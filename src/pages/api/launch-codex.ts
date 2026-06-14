import type { APIRoute } from 'astro';
import { appendFile, glob, open, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HOME = homedir();
const JOBS_DIR = join(HOME, '.local/share/aperture/jobs');
const CODEX_CLI = '/run/current-system/sw/bin/codex';
const AGENT_INFRA = join(HOME, 'agent-infra');
const APERTURE = join(HOME, 'projects/aperture');
const SYNTRA = join(HOME, 'syntra');
const WEBSITE = join(HOME, 'website');
const KNOWN_ROOTS = [
  join(HOME, '.local/share/boreal-outreach'),
  join(HOME, 'projects/boreal-leads'),
  APERTURE,
  AGENT_INFRA,
  SYNTRA,
  join(HOME, 'scripts'),
  WEBSITE,
].sort((a, b) => b.length - a.length);
const RESTART_ALLOWLIST = new Set([
  'sms-inbox',
  'sms-webhook',
  'missed-call-bot',
  'calendly-poller',
  'callback-reminder',
  'pipeline-integrity-check',
]);

interface JobRecord {
  jobId: string;
  taskId: string;
  taskTitle: string;
  briefPath: string;
  startedAt: string;
  pid: number;
  logPath: string;
  status: 'running' | 'done' | 'failed' | 'blocked';
  exitCode: number | null;
  finishedAt: string | null;
  blockedReason?: string;
}

function normalizePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('~/')) return join(HOME, trimmed.slice(2));
  return resolve(trimmed);
}

interface WorkContext {
  cwd: string;
  addDirs: string[];
  skipSandbox?: boolean;
  skipGitRepoCheck?: boolean;
  warning?: string;
}

function isWithin(path: string, root: string): boolean {
  const remainder = relative(root, path);
  return remainder === '' || (!remainder.startsWith('..') && !isAbsolute(remainder));
}

function briefRepo(resolvedBrief: string): string {
  if (isWithin(resolvedBrief, AGENT_INFRA)) return AGENT_INFRA;
  if (isWithin(resolvedBrief, SYNTRA)) return SYNTRA;
  if (isWithin(resolvedBrief, APERTURE)) return APERTURE;
  if (isWithin(resolvedBrief, WEBSITE)) return WEBSITE;
  return dirname(resolvedBrief);
}

function defaultWorkRoot(resolvedBrief: string): string {
  const briefName = basename(resolvedBrief);
  if (isWithin(resolvedBrief, AGENT_INFRA) && /^AP-\d/.test(briefName)) return APERTURE;
  if (isWithin(resolvedBrief, AGENT_INFRA) && /^WEB-/.test(briefName)) return WEBSITE;
  return briefRepo(resolvedBrief);
}

export function ownedPathTokens(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === '## FILES IT OWNS');
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const section = lines.slice(start + 1, end < 0 ? undefined : end);
  const pathLike = /^(?:~\/|\/|\.{1,2}\/|[\w.@-]+\/\S+|.+\.(?:js|jsx|ts|tsx|mjs|cjs|json|md|mdx|css|scss|astro|py|yaml|yml|toml|sh|sql|txt|html|env)$)/;

  return section
    .flatMap((line) => {
      const trimmed = line.trim().replace(/^-\s+/, '');
      if (!trimmed || trimmed.startsWith('```') || /^\*\*[^`]+:\*\*$/.test(trimmed)) return [];
      const ownedPrefix = trimmed.split(/\s+(?:\(|—|--)\s*/)[0];
      const quoted = [...ownedPrefix.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
      const bare = [...ownedPrefix.matchAll(/(?:^|[\s,+])((?:~\/|\/|\.{1,2}\/|src\/|api\/)[^\s,;+`]+)/g)]
        .map((match) => match[1].trim());
      return [...quoted, ...bare]
        .map((token) => token.replace(/[.,:;]+$/, ''))
        .filter((token) => pathLike.test(token));
    })
    .filter(Boolean);
}

async function existingAncestor(path: string): Promise<string> {
  let candidate = path;
  while (candidate !== dirname(candidate)) {
    try {
      return (await stat(candidate)).isDirectory() ? candidate : dirname(candidate);
    } catch {
      candidate = dirname(candidate);
    }
  }
  return candidate;
}

function mapToWritableRoot(path: string): string {
  return KNOWN_ROOTS.find((root) => isWithin(path, root)) ?? path;
}

async function isInGitRepo(path: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', path, 'rev-parse', '--is-inside-work-tree']);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

export async function briefWorkContext(briefPath: string): Promise<WorkContext> {
  const resolved = normalizePath(briefPath);
  const ownRepo = briefRepo(resolved);
  const defaultRoot = defaultWorkRoot(resolved);

  if (isWithin(resolved, SYNTRA)) {
    return { cwd: SYNTRA, addDirs: [], skipSandbox: true };
  }

  let tokens: string[] = [];
  try {
    tokens = ownedPathTokens(await readFile(resolved, 'utf8'));
  } catch {
    // The fallback below preserves the existing repo-only behavior.
  }
  if (!tokens.length) {
    return {
      cwd: defaultRoot,
      addDirs: defaultRoot === ownRepo ? [] : [ownRepo],
      skipGitRepoCheck: !(await isInGitRepo(defaultRoot)),
      warning: '[aperture] WARN: could not derive work-roots from brief; running with repo-only write access',
    };
  }

  const roots = await Promise.all(tokens.map(async (token) => {
    const expanded = token.startsWith('~/')
      ? join(HOME, token.slice(2))
      : isAbsolute(token)
        ? token
        : resolve(defaultRoot, token);
    return mapToWritableRoot(await existingAncestor(expanded));
  }));
  const counts = new Map<string, number>();
  for (const root of roots) counts.set(root, (counts.get(root) ?? 0) + 1);

  let cwd = defaultRoot;
  if (!/^AP-\d/.test(basename(resolved)) && !/^WEB-/.test(basename(resolved))) {
    const highestCount = Math.max(...counts.values());
    const candidates = [...counts.entries()].filter(([, count]) => count === highestCount).map(([root]) => root);
    cwd = candidates.length > 1 ? ownRepo : candidates[0];
  }
  const addDirs = [...new Set([...roots.filter((root) => root !== cwd), ownRepo])];
  return { cwd, addDirs, skipGitRepoCheck: !(await isInGitRepo(cwd)) };
}

function tailLines(content: string, lineCount = 20): string {
  const lines = content.trimEnd().split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - lineCount)).join('\n');
}

function sectionBody(content: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content.match(new RegExp(`^## ${escaped}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'mi'))?.[1].trim() ?? '';
}

function contextForMatch(content: string, index: number, length: number): string {
  const lineStart = content.lastIndexOf('\n', index) + 1;
  const lineEnd = content.indexOf('\n', index + length);
  const surrounding = content.slice(Math.max(0, lineStart - 160), lineEnd < 0 ? undefined : Math.min(content.length, lineEnd + 240));
  return surrounding.trim().slice(0, 400);
}

const HARD_BLOCK = /must .* authorize|authorize the required|outside .* FILES IT OWNS|not in FILES IT OWNS|MISSING_DEP|BRIEF_ERROR|NEEDS_CLARIFICATION|command not found|no such file or directory/i;
const EXPECTED_LIMITATION = /live .*(verification|endpoint|api)|service (?:was|is)?\s*not running|could not (?:curl|reach|connect)|localhost|\bgit\b.*(?:prohibit|forbid|read-only|not allowed|unavailable)|\.git\/|systemctl|user scope bus|verification .*pending|unverified because|restart .*(?:not run|pending)/i;

function substantiveBlockers(content: string): string | undefined {
  const remaining = content
    .split(/\r?\n/)
    .filter((line) => !EXPECTED_LIMITATION.test(line))
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  const normalized = remaining.replace(/^(?:[-*+]\s*|\d+[.)]\s*)/gm, '').trim();
  if (!normalized || /^(?:none|n\/a)\.?$/i.test(normalized)) return undefined;
  return remaining.slice(0, 400);
}

export function blockedReasonFor(content: string): string | undefined {
  const direct = HARD_BLOCK.exec(content);
  if (direct?.index !== undefined) return contextForMatch(content, direct.index, direct[0].length);

  return substantiveBlockers(sectionBody(content, 'Blockers or open questions'));
}

export function restartAfterServices(content: string): string[] {
  const services = [...content.matchAll(/^\s*restart-after:\s*(.+)$/gmi)]
    .flatMap((match) => match[1].split(','))
    .map((service) => service.trim())
    .filter(Boolean);
  return [...new Set(services)];
}

async function appendJobLog(logPath: string, line: string): Promise<void> {
  await appendFile(logPath, `${line}\n`, 'utf8').catch(() => {});
}

function isExcludedCommitPath(path: string): boolean {
  const name = basename(path);
  if (/\.db$|\.sqlite.*$|\.bak-/i.test(name)) return true;

  const parts = path.split(/[\\/]+/);
  const underBorealLeads = parts.includes('boreal-leads');
  return underBorealLeads && !/\.(?:md|py|yaml|json)$/i.test(name);
}

function hasGlobMagic(path: string): boolean {
  return /[*?[\]{}]/.test(path);
}

async function filesUnder(path: string): Promise<string[]> {
  const entry = await stat(path).catch(() => null);
  if (!entry) return [];
  if (!entry.isDirectory()) return [path];

  const children = await readdir(path, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(children
    .filter((child) => child.name !== '.git')
    .map((child) => filesUnder(join(path, child.name))));
  return files.flat();
}

async function resolvedOwnedPaths(briefPath: string): Promise<string[]> {
  const content = await readFile(briefPath, 'utf8').catch(() => '');
  const defaultRoot = defaultWorkRoot(briefPath);
  const expanded = await Promise.all(ownedPathTokens(content).map(async (token) => {
    const path = token.startsWith('~/')
      ? join(HOME, token.slice(2))
      : isAbsolute(token)
        ? token
        : resolve(defaultRoot, token);
    if (hasGlobMagic(path)) {
      const matches: string[] = [];
      for await (const match of glob(path)) matches.push(resolve(match));
      return (await Promise.all(matches.map(filesUnder))).flat();
    }
    return filesUnder(path);
  }));

  return [...new Set(expanded.flat().filter((path) => !isExcludedCommitPath(path)))];
}

async function gitRepoRoot(path: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', dirname(path), 'rev-parse', '--show-toplevel']);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function applyCommit(
  briefPath: string,
  logPath: string,
  taskId: string,
  taskTitle: string,
  jobId: string,
): Promise<void> {
  const paths = await resolvedOwnedPaths(briefPath);
  const roots = await Promise.all(paths.map(gitRepoRoot));
  const pathsByRepo = new Map<string, string[]>();
  for (const [index, root] of roots.entries()) {
    if (!root) continue;
    const repoPaths = pathsByRepo.get(root) ?? [];
    repoPaths.push(relative(root, paths[index]));
    pathsByRepo.set(root, repoPaths);
  }

  for (const [root, ownedPaths] of pathsByRepo) {
    try {
      await execFileAsync('git', ['-C', root, 'add', '--', ...ownedPaths]);
    } catch (error) {
      const result = error as Error & { stdout?: string; stderr?: string };
      const reason = result.stderr?.trim() || result.stdout?.trim() || result.message;
      await appendJobLog(logPath, `[aperture] commit ${taskId} @ ${root}: failed (${reason.slice(0, 300)})`);
      continue;
    }

    try {
      await execFileAsync('git', ['-C', root, 'diff', '--cached', '--quiet']);
      await appendJobLog(logPath, `[aperture] commit ${taskId}: no changes in ${root}`);
      continue;
    } catch (error) {
      const result = error as Error & { code?: number | string; stdout?: string; stderr?: string };
      if (result.code === 1) {
        // Exit 1 means the staged diff is non-empty.
      } else {
        const reason = result.stderr?.trim() || result.stdout?.trim() || result.message;
        await appendJobLog(logPath, `[aperture] commit ${taskId} @ ${root}: failed (${reason.slice(0, 300)})`);
        continue;
      }
    }

    try {
      // Local commits only. Aperture must never push executor work.
      await execFileAsync('git', [
        '-C', root, 'commit',
        '-m', `${taskId}: ${taskTitle} [executor]`,
        '-m', `job ${jobId} · brief ${basename(briefPath)}`,
      ]);
      const { stdout } = await execFileAsync('git', ['-C', root, 'rev-parse', '--short', 'HEAD']);
      await appendJobLog(logPath, `[aperture] commit ${taskId} @ ${root}: ${stdout.trim()}`);
    } catch (error) {
      const result = error as Error & { stdout?: string; stderr?: string };
      const reason = result.stderr?.trim() || result.stdout?.trim() || result.message;
      await appendJobLog(logPath, `[aperture] commit ${taskId} @ ${root}: failed (${reason.slice(0, 300)})`);
    }
  }
}

async function applyRestarts(briefPath: string, logPath: string): Promise<void> {
  const content = await readFile(briefPath, 'utf8').catch(() => '');
  for (const service of restartAfterServices(content)) {
    if (!RESTART_ALLOWLIST.has(service)) {
      await appendJobLog(logPath, `[aperture] restart ${service}: skipped (not allowlisted)`);
      continue;
    }
    try {
      await execFileAsync('systemctl', ['--user', 'restart', service]);
      const { stdout } = await execFileAsync('systemctl', ['--user', 'is-active', service]);
      await appendJobLog(logPath, `[aperture] restart ${service}: ${stdout.trim() || 'unknown'}`);
    } catch (error) {
      const result = error as Error & { stdout?: string; stderr?: string };
      const reason = result.stderr?.trim() || result.stdout?.trim() || result.message;
      await appendJobLog(logPath, `[aperture] restart ${service}: failed (${reason.slice(0, 300)})`);
    }
  }
}

async function classifyCompletion(lastMessagePath: string, logPath: string): Promise<string | undefined> {
  const lastMessage = await readFile(lastMessagePath, 'utf8').catch(() => '');
  const log = await readFile(logPath, 'utf8').catch(() => '');
  return blockedReasonFor(lastMessage || tailLines(log, 120));
}

async function writeJobRecord(jobPath: string, job: JobRecord): Promise<void> {
  await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, 'utf8');
}

async function updateJobRecord(jobPath: string, updater: (job: JobRecord) => JobRecord): Promise<void> {
  try {
    const current = JSON.parse(await readFile(jobPath, 'utf8')) as JobRecord;
    await writeJobRecord(jobPath, updater(current));
  } catch {
    // Ignore stale or missing job records.
  }
}

export const POST: APIRoute = async ({ request }) => {
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const taskId = String(payload?.taskId || '').trim();
  const taskTitle = String(payload?.taskTitle || '').trim();
  const briefPath = String(payload?.briefPath || '').trim();
  const prompt = String(payload?.prompt || '').trim();

  if (!/^[A-Za-z0-9-]+$/.test(taskId) || !taskTitle || !briefPath || !prompt) {
    return new Response('taskId, taskTitle, briefPath, and a non-empty prompt are required.', { status: 400 });
  }

  const jobId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const jobPath = join(JOBS_DIR, `${jobId}.json`);
  const logPath = join(JOBS_DIR, `${jobId}.log`);
  const lastMessagePath = `${jobPath}.last.md`;
  const { cwd, addDirs, skipSandbox = false, skipGitRepoCheck = false, warning } = await briefWorkContext(briefPath);

  await mkdir(JOBS_DIR, { recursive: true });
  const logHandle = await open(logPath, 'a');
  if (warning) await logHandle.write(`${warning}\n`);

  let child;
  try {
    const codexArgs = skipSandbox
      ? ['exec', '-', '-C', cwd, '--dangerously-bypass-approvals-and-sandbox']
      : ['exec', '-', '-C', cwd, '-s', 'workspace-write'];
    codexArgs.push('-o', lastMessagePath);
    for (const dir of addDirs) {
      codexArgs.push('--add-dir', dir);
    }
    if (skipGitRepoCheck) {
      codexArgs.push('--skip-git-repo-check');
    }

    child = spawn(CODEX_CLI, codexArgs, {
      cwd,
      detached: true,
      env: { ...process.env, APERTURE_JOB_ID: jobId },
      stdio: ['pipe', logHandle.fd, logHandle.fd],
    });
    child.stdin?.end(`${prompt}\n`);
  } catch (error) {
    await logHandle.close().catch(() => {});
    return new Response(`Failed to launch Codex: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
  }

  const job: JobRecord = {
    jobId,
    taskId,
    taskTitle,
    briefPath: normalizePath(briefPath),
    startedAt,
    pid: child.pid ?? 0,
    logPath,
    status: 'running',
    exitCode: null,
    finishedAt: null,
  };

  await writeJobRecord(jobPath, job);

  child.once('error', async () => {
    await updateJobRecord(jobPath, (current) => ({
      ...current,
      status: current.status === 'running' ? 'failed' : current.status,
      exitCode: current.exitCode,
      finishedAt: current.finishedAt ?? new Date().toISOString(),
    }));
  });

  child.once('exit', async (exitCode) => {
    const blockedReason = exitCode === 0 ? await classifyCompletion(lastMessagePath, logPath) : undefined;
    const status = exitCode !== 0 ? 'failed' : blockedReason ? 'blocked' : 'done';
    await updateJobRecord(jobPath, (current) => ({
      ...current,
      status,
      exitCode,
      finishedAt: new Date().toISOString(),
      ...(blockedReason ? { blockedReason } : {}),
    }));
    if (status === 'done') {
      const resolvedBrief = normalizePath(briefPath);
      await applyCommit(resolvedBrief, logPath, taskId, taskTitle, jobId);
      await applyRestarts(resolvedBrief, logPath);
    }
  });

  child.unref();
  await logHandle.close().catch(() => {});

  return new Response(JSON.stringify({ ok: true, jobId, pid: child.pid }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
