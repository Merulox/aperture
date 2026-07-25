import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse as parseYaml } from 'yaml';

const execFileAsync = promisify(execFile);
const HOME = homedir();

export const OMP_INTENT_ROOT = join(HOME, 'kernel/v2/tasks');
export const OMP_STATE_ROOT = join(HOME, '.local/share/aperture/omp-runs');
export const OMP_WORKSPACES_ROOT = join(OMP_STATE_ROOT, 'workspaces');
export const OMP_NETWORK = 'aperture-omp-shadow';
export const OMP_GATEWAY_CONTAINER = 'aperture-omp-gateway';
export const OMP_GATEWAY_URL = `http://${OMP_GATEWAY_CONTAINER}:49555`;
export const OMP_RUNTIME_IMAGE = 'docker.io/library/archlinux@sha256:1f83ba0580a15cd6ad1d02d62ad432ddc940f53f07d0e39c8982d6c9c74e53e0';
export const OMP_CLI = join(HOME, '.local/bin/omp');
export const OMP_NATIVE = join(HOME, '.omp/natives/17.0.5/pi_natives.linux-x64-modern.node');
export const OMP_MODEL = 'openai-codex/gpt-5.6-sol';
const HOST_OWNED_EVIDENCE = 'host-owned-run-record';

const REPOSITORY_ROOTS = [
  join(HOME, 'projects'),
  join(HOME, 'kernel'),
  join(HOME, 'syntra'),
  join(HOME, 'website'),
];

export type OmpRunStatus = 'queued' | 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled';

export interface OmpIntent {
  workId: string;
  title: string;
  contractPath: string;
  status: string;
  mode: string;
  riskTier: number;
  repository: string;
  allowedPaths: string[];
  evidencePath: string;
  model: string;
  valid: boolean;
  issues: string[];
}

export async function intentEvidenceExists(intent: OmpIntent): Promise<boolean> {
  if (!/\.(?:json|md|txt|ya?ml)$/i.test(intent.evidencePath)) return false;
  const evidencePath = resolve(intent.repository, intent.evidencePath);
  if (!isWithin(evidencePath, intent.repository)) return false;
  return access(evidencePath).then(() => true).catch(() => false);
}

export interface OmpRunRecord {
  schemaVersion: 1;
  runId: string;
  workId: string;
  title: string;
  contractPath: string;
  contractSnapshotPath: string;
  repository: string;
  workspace: string;
  model: string;
  runtimeImage: string;
  runtimeIdentity: string;
  networkPolicy: 'gateway-only-internal-network';
  containerName: string;
  pid: number;
  status: OmpRunStatus;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string | null;
  logPath: string;
  errorLogPath: string;
  diffPath: string;
  sessionId: string | null;
  stopReason: string | null;
  finalMessage: string | null;
  changedPaths: string[];
  disallowedPaths: string[];
  failureClass: string | null;
  failureDetail: string | null;
}

interface ContractYaml {
  work_id?: unknown;
  status?: unknown;
  mode?: unknown;
  risk_tier?: unknown;
  repository?: unknown;
  allowed_paths?: unknown;
  evidence_path?: unknown;
  selected_model?: unknown;
}

export interface OmpOutputSummary {
  sessionId: string | null;
  stopReason: string | null;
  finalMessage: string | null;
  errorMessage: string | null;
  completed: boolean;
}

function expandHome(value: string): string {
  if (value === '~') return HOME;
  if (value.startsWith('~/')) return join(HOME, value.slice(2));
  return value;
}

export function isWithin(path: string, root: string): boolean {
  const pathValue = resolve(path);
  const rootValue = resolve(root);
  return pathValue === rootValue || pathValue.startsWith(`${rootValue}${sep}`);
}

function contractYaml(content: string): ContractYaml {
  const match = content.match(/```yaml\s*\n([\s\S]*?)\n```/i);
  if (!match) throw new Error('Intent contract is missing its fenced YAML header.');
  const parsed = parseYaml(match[1]);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Intent contract YAML must be an object.');
  }
  return parsed as ContractYaml;
}

function titleFrom(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(?:Intent Contract:\s*)?(.+)$/m)?.[1]?.trim();
  return heading || fallback;
}

function normalizeAllowedPaths(values: unknown, repository: string, issues: string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    issues.push('allowed_paths must contain at least one repository-relative path.');
    return [];
  }

  const normalized: string[] = [];
  for (const raw of values) {
    if (typeof raw !== 'string' || !raw.trim()) {
      issues.push('allowed_paths contains a non-string or empty value.');
      continue;
    }
    const value = raw.trim();
    const absolute = resolve(repository, expandHome(value));
    if (!isWithin(absolute, repository)) {
      issues.push(`allowed path escapes repository: ${value}`);
      continue;
    }
    const repoRelative = relative(repository, absolute).split(sep).join('/');
    if (!repoRelative || repoRelative.startsWith('../')) {
      issues.push(`allowed path is not a repository artifact: ${value}`);
      continue;
    }
    normalized.push(repoRelative);
  }
  return [...new Set(normalized)];
}

export async function loadOmpIntent(requestedPath: string): Promise<OmpIntent> {
  const intentRoot = await realpath(OMP_INTENT_ROOT);
  const resolved = await realpath(expandHome(requestedPath));
  if (!isWithin(resolved, intentRoot)) throw new Error('Contract path is outside the Kernel v2 task root.');

  const content = await readFile(resolved, 'utf8');
  const yaml = contractYaml(content);
  const issues: string[] = [];
  const workId = typeof yaml.work_id === 'string' ? yaml.work_id.trim() : '';
  const status = typeof yaml.status === 'string' ? yaml.status.trim() : '';
  const mode = typeof yaml.mode === 'string' ? yaml.mode.trim() : '';
  const riskTier = typeof yaml.risk_tier === 'number' ? yaml.risk_tier : Number(yaml.risk_tier);
  const repositoryField = typeof yaml.repository === 'string' ? yaml.repository.trim() : '';
  const repositoryCandidate = repositoryField ? resolve(expandHome(repositoryField)) : '';
  let evidencePath = typeof yaml.evidence_path === 'string' ? yaml.evidence_path.trim() : '';
  let repository = repositoryCandidate;

  if (!/^[A-Za-z0-9-]+$/.test(workId)) issues.push('work_id must use letters, numbers, and hyphens only.');
  if (!['proposed', 'ready'].includes(status)) issues.push('status must be proposed or ready.');
  if (!['direct', 'fan-out', 'mission', 'routine'].includes(mode)) issues.push('mode is not a supported Kernel v2 mode.');
  if (!Number.isInteger(riskTier) || riskTier < 0 || riskTier > 3) issues.push('risk_tier must be an integer from 0 through 3.');
  if (!repositoryCandidate) {
    issues.push('repository is required.');
  } else {
    try {
      repository = await realpath(repositoryCandidate);
      if (!REPOSITORY_ROOTS.some((root) => isWithin(repository, root))) {
        issues.push('repository is outside the configured shadow adapter roots.');
      }
    } catch {
      issues.push('repository does not exist.');
    }
  }

  const allowedPaths = repository
    ? normalizeAllowedPaths(yaml.allowed_paths, repository, issues)
    : [];
  if (!evidencePath) {
    issues.push('evidence_path is required.');
  } else if (evidencePath === HOST_OWNED_EVIDENCE) {
    // Typed run records are stored by the host adapter, outside the worker workspace.
  } else if (/\.(?:json|md|txt|ya?ml)$/i.test(evidencePath) && repository) {
    if (isAbsolute(evidencePath)) {
      issues.push('evidence_path must be repository-relative.');
    } else {
      const absoluteEvidencePath = resolve(repository, evidencePath);
      if (!isWithin(absoluteEvidencePath, repository)) {
        issues.push('evidence_path escapes the intent repository.');
      } else {
        evidencePath = relative(repository, absoluteEvidencePath).split(sep).join('/');
      }
    }
  } else {
    issues.push('evidence_path must be host-owned-run-record or a repository-relative .json, .md, .txt, .yaml, or .yml file.');
  }

  return {
    workId: workId || 'invalid-contract',
    title: titleFrom(content, workId || 'Invalid contract'),
    contractPath: resolved,
    status,
    mode,
    riskTier,
    repository,
    allowedPaths,
    evidencePath,
    model: typeof yaml.selected_model === 'string' && yaml.selected_model.trim() ? yaml.selected_model.trim() : OMP_MODEL,
    valid: issues.length === 0,
    issues,
  };
}

export async function listOmpIntents(): Promise<OmpIntent[]> {
  const files = (await readdir(OMP_INTENT_ROOT, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !entry.name.endsWith('-review.md'))
    .map((entry) => join(OMP_INTENT_ROOT, entry.name));

  const intents = await Promise.all(files.map(async (path) => {
    try {
      return await loadOmpIntent(path);
    } catch (error) {
      return {
        workId: 'invalid-contract',
        title: path.split('/').at(-1) || path,
        contractPath: path,
        status: 'invalid',
        mode: '',
        riskTier: -1,
        repository: '',
        allowedPaths: [],
        evidencePath: '',
        model: OMP_MODEL,
        valid: false,
        issues: [error instanceof Error ? error.message : String(error)],
      } satisfies OmpIntent;
    }
  }));

  return intents.sort((a, b) => a.workId.localeCompare(b.workId));
}

export function runPath(runId: string): string {
  return join(OMP_STATE_ROOT, `${runId}.json`);
}

export async function writeOmpRun(record: OmpRunRecord): Promise<void> {
  await mkdir(OMP_STATE_ROOT, { recursive: true, mode: 0o700 });
  const destination = runPath(record.runId);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, destination);
}

export async function readOmpRun(runId: string): Promise<OmpRunRecord> {
  if (!/^[a-f0-9-]{36}$/.test(runId)) throw new Error('Invalid run ID.');
  return JSON.parse(await readFile(runPath(runId), 'utf8')) as OmpRunRecord;
}

export async function updateOmpRun(runId: string, updater: (current: OmpRunRecord) => OmpRunRecord): Promise<OmpRunRecord> {
  const updated = updater(await readOmpRun(runId));
  await writeOmpRun(updated);
  return updated;
}

export async function listOmpRuns(): Promise<OmpRunRecord[]> {
  await mkdir(OMP_STATE_ROOT, { recursive: true, mode: 0o700 });
  const files = (await readdir(OMP_STATE_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^[a-f0-9-]{36}\.json$/.test(entry.name));
  const records = await Promise.all(files.map(async (entry) => {
    try {
      return JSON.parse(await readFile(join(OMP_STATE_ROOT, entry.name), 'utf8')) as OmpRunRecord;
    } catch {
      return null;
    }
  }));
  return records.filter((record): record is OmpRunRecord => record !== null)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function assertAdapterDependencies(): Promise<void> {
  await Promise.all([
    access(OMP_CLI, constants.X_OK),
    access(OMP_NATIVE, constants.R_OK),
    access('/run/current-system/sw', constants.R_OK),
  ]);
  const { stdout } = await execFileAsync('/run/current-system/sw/bin/podman', [
    'inspect', '--format', '{{.State.Running}}', OMP_GATEWAY_CONTAINER,
  ]);
  if (stdout.trim() !== 'true') throw new Error('OMP auth gateway is not running.');
}

function pathPattern(path: string): RegExp {
  const escaped = path.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0000', '.*')
    .replaceAll('?', '[^/]');
  return new RegExp(`^${escaped}(?:/.*)?$`);
}

export function disallowedChangedPaths(changedPaths: string[], allowedPaths: string[]): string[] {
  const patterns = allowedPaths.map(pathPattern);
  return changedPaths.filter((path) => !patterns.some((pattern) => pattern.test(path)));
}

export async function finalizeOmpRun(runId: string, exitCode: number | null): Promise<void> {
  const current = await readOmpRun(runId);
  if (!['queued', 'running', 'cancelling'].includes(current.status)) return;

  const git = '/run/current-system/sw/bin/git';
  await execFileAsync(git, ['-C', current.workspace, 'add', '-N', '.']).catch(() => undefined);
  const [{ stdout: diff }, { stdout: changedRaw }, output, errorLog] = await Promise.all([
    execFileAsync(git, ['-C', current.workspace, 'diff', '--binary', '--no-ext-diff', 'HEAD'], { maxBuffer: 64 * 1024 * 1024 })
      .catch(() => ({ stdout: '', stderr: '' })),
    execFileAsync(git, ['-C', current.workspace, 'diff', '--name-only', '-z', 'HEAD'], { maxBuffer: 16 * 1024 * 1024 })
      .catch(() => ({ stdout: '', stderr: '' })),
    parseOmpOutput(current.logPath),
    readFile(current.errorLogPath, 'utf8').catch(() => ''),
  ]);
  await writeFile(current.diffPath, diff, { encoding: 'utf8', mode: 0o600 });

  const changedPaths = changedRaw.split('\0').map((path) => path.trim()).filter(Boolean);
  const intent = await loadOmpIntent(current.contractPath);
  const disallowedPaths = disallowedChangedPaths(changedPaths, intent.allowedPaths);
  const succeeded = exitCode === 0 && output.completed && output.stopReason !== 'error' && !output.errorMessage && disallowedPaths.length === 0;

  let failureClass: string | null = null;
  let failureDetail: string | null = null;
  if (disallowedPaths.length > 0) {
    failureClass = 'ownership_violation';
    failureDetail = `Changed paths outside contract ownership: ${disallowedPaths.join(', ')}`;
  } else if (exitCode !== 0) {
    failureClass = 'worker_exit';
    failureDetail = `Worker container exited ${exitCode === null ? 'without an exit code' : `with code ${exitCode}`}.`;
  } else if (output.errorMessage || output.stopReason === 'error') {
    failureClass = 'agent_error';
    failureDetail = output.errorMessage || 'OMP emitted a structured error stop reason.';
  } else if (!output.completed) {
    failureClass = 'incomplete_output';
    failureDetail = 'OMP JSONL output did not contain agent_end.';
  }
  if (!failureDetail && !succeeded && errorLog.trim()) {
    failureDetail = errorLog.trim().split(/\r?\n/).slice(-12).join('\n');
  }

  await updateOmpRun(runId, (record) => {
    if (record.status === 'cancelled') return record;
    const cancelled = record.status === 'cancelling';
    return {
      ...record,
      status: cancelled ? 'cancelled' : (succeeded ? 'succeeded' : 'failed'),
      exitCode,
      finishedAt: new Date().toISOString(),
      sessionId: output.sessionId,
      stopReason: output.stopReason,
      finalMessage: output.finalMessage,
      changedPaths,
      disallowedPaths,
      failureClass: cancelled ? 'operator_cancelled' : failureClass,
      failureDetail: cancelled
        ? 'Cancelled through the authenticated Aperture shadow-run API.'
        : failureDetail,
    };
  });
  await execFileAsync('/run/current-system/sw/bin/podman', ['rm', current.containerName]).catch(() => undefined);
}

export async function parseOmpOutput(logPath: string): Promise<OmpOutputSummary> {
  const content = await readFile(logPath, 'utf8').catch(() => '');
  let sessionId: string | null = null;
  let stopReason: string | null = null;
  let finalMessage: string | null = null;
  let errorMessage: string | null = null;
  let completed = false;

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!event || typeof event !== 'object') continue;
    if ('type' in event && event.type === 'session' && 'id' in event && typeof event.id === 'string') {
      sessionId = event.id;
    }
    if ('type' in event && event.type === 'agent_end') completed = true;
    if (!('message' in event) || !event.message || typeof event.message !== 'object') continue;
    const message = event.message;
    if (!('role' in message) || message.role !== 'assistant') continue;
    if ('stopReason' in message && typeof message.stopReason === 'string') stopReason = message.stopReason;
    if ('errorMessage' in message && typeof message.errorMessage === 'string') errorMessage = message.errorMessage;
    if ('content' in message && Array.isArray(message.content)) {
      const text = message.content
        .filter((part): part is { type: 'text'; text: string } => (
          Boolean(part)
          && typeof part === 'object'
          && 'type' in part
          && part.type === 'text'
          && 'text' in part
          && typeof part.text === 'string'
        ))
        .map((part) => part.text)
        .join('\n')
        .trim();
      if (text) finalMessage = text;
    }
  }

  return { sessionId, stopReason, finalMessage, errorMessage, completed };
}
