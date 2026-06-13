import type { APIRoute } from 'astro';
import { open, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
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

interface JobRecord {
  jobId: string;
  taskId: string;
  taskTitle: string;
  briefPath: string;
  startedAt: string;
  pid: number;
  logPath: string;
  status: 'running' | 'done' | 'failed';
  exitCode: number | null;
  finishedAt: string | null;
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

function ownedPathTokens(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === '## FILES IT OWNS');
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const section = lines.slice(start + 1, end < 0 ? undefined : end);
  const pathLike = /^(?:~\/|\/|\.{1,2}\/|src\/|api\/|package\.json$|astro\.config\.mjs$|\.gitignore$)/;

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
  const { cwd, addDirs, skipSandbox = false, skipGitRepoCheck = false, warning } = await briefWorkContext(briefPath);

  await mkdir(JOBS_DIR, { recursive: true });
  const logHandle = await open(logPath, 'a');
  if (warning) await logHandle.write(`${warning}\n`);

  let child;
  try {
    const codexArgs = skipSandbox
      ? ['exec', '-', '-C', cwd, '--dangerously-skip-sandbox']
      : ['exec', '-', '-C', cwd, '-s', 'workspace-write'];
    for (const dir of addDirs) {
      codexArgs.push('--add-dir', dir);
    }
    if (skipGitRepoCheck) {
      codexArgs.push('--skip-git-repo-check');
    }

    child = spawn(CODEX_CLI, codexArgs, {
      cwd,
      detached: true,
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
    await updateJobRecord(jobPath, (current) => ({
      ...current,
      status: exitCode === 0 ? 'done' : 'failed',
      exitCode,
      finishedAt: new Date().toISOString(),
    }));
  });

  child.unref();
  await logHandle.close().catch(() => {});

  return new Response(JSON.stringify({ ok: true, jobId, pid: child.pid }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
