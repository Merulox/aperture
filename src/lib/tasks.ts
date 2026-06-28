import { homedir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

const HOME = homedir();
const PERMISSION_DIR = join(HOME, 'obsidian/claude-bus/permission-requests');
const EX_BRIEFS_DIR = join(HOME, 'kernel/ecosystem-review/briefs');
const EX_BOARD = join(EX_BRIEFS_DIR, 'README.md');
const SYNTRA_TASKS = join(HOME, 'syntra/.agent/TASKS.md');
const SYNTRA_BRIEFS_DIR = join(HOME, 'syntra/docs/planning');
const BRAIN_BUS_TASKS = join(HOME, 'obsidian/claude-bus/tasks');
const APERTURE_JOBS = join(HOME, '.local/share/aperture/jobs');
const NAVI_TASKS = join(HOME, 'projects/navi/.agent/TASKS.md');
const NAVI_PROJECT_DIR = join(HOME, 'projects/navi');

interface JobState {
  taskId: string;
  status: 'running' | 'done' | 'failed' | 'blocked';
  startedAt: string;
  finishedAt: string | null;
  blockedReason?: string;
}

export interface PermissionRequest {
  id: string;
  requestor: string;
  task: string;
  question: string;
  urgency: string;
  created: string;
  context: string;
}

export interface ExTask {
  id: string;
  status: string;
  statusBadge: string;
  statusTone: string;
  uninitiated: boolean;
  title: string;
  briefPath: string;
  briefPreview: string;
  briefContent: string;
  briefExists: boolean;
  prompt: string;
  riskGate: string;
  dependsOn: string;
  blocked: boolean;
  executor: 'codex' | 'opencode' | 'either';
}

export interface SyntraTask {
  id: string;
  status: string;
  priority: string;
  title: string;
  briefPath: string;
  briefPreview: string;
  briefContent: string;
  briefExists: boolean;
  prompt: string;
  statusBadge: string;
  statusTone: string;
  uninitiated: boolean;
  notes: string;
}

export interface FailedBrainTask {
  filename: string;
  action: string;
  priority: string;
}

export interface BrainBusSummary {
  pending: number;
  claimed: number;
  failed: number;
  failedTasks: FailedBrainTask[];
}

export interface TaskboardData {
  permissionRequests: PermissionRequest[];
  borealTasks: ExTask[];
  exTasks: ExTask[];
  vicTasks: ExTask[];
  syntraTasks: SyntraTask[];
  naviTasks: SyntraTask[];
  brainBus: BrainBusSummary;
}

function parseFrontmatter(content: string): { fields: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { fields: {}, body: content.trim() };

  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { fields, body: match[2].trim() };
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

async function getBriefPreview(path: string): Promise<{ briefPreview: string; briefContent: string; briefExists: boolean }> {
  if (!path) return { briefPreview: '', briefContent: '', briefExists: false };
  try {
    const content = await readFile(path, 'utf8');
    return { briefPreview: content, briefContent: content, briefExists: true };
  } catch {
    return { briefPreview: '', briefContent: '', briefExists: false };
  }
}

async function listFiles(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

async function latestJobs(): Promise<Map<string, JobState>> {
  const jobs = await Promise.all((await listFiles(APERTURE_JOBS))
    .filter((file) => file.endsWith('.json'))
    .map(async (file): Promise<JobState | null> => {
      try {
        return JSON.parse(await readFile(join(APERTURE_JOBS, file), 'utf8')) as JobState;
      } catch {
        return null;
      }
    }));
  const latest = new Map<string, JobState>();
  for (const job of jobs.filter((item): item is JobState => item !== null)) {
    if (!latest.has(job.taskId) || latest.get(job.taskId)!.startedAt < job.startedAt) latest.set(job.taskId, job);
  }
  return latest;
}

function overlayJobState<T extends { id: string; status: string; statusBadge: string; statusTone: string; uninitiated: boolean; prompt: string }>(
  tasks: T[],
  jobs: Map<string, JobState>,
): T[] {
  return tasks.map((task) => {
    if (task.status !== 'briefed') return task;
    const job = jobs.get(task.id);
    if (!job) return task;
    if (job.status === 'running') return { ...task, status: 'in_progress', statusBadge: 'RUNNING', statusTone: 'blue', uninitiated: false, prompt: '' };
    if (job.status === 'done') {
      const note = `finished ${job.finishedAt || ''}`.trim();
      return { ...task, status: 'awaiting_verify', statusBadge: 'AWAITING VERIFY', statusTone: 'orange', uninitiated: false, prompt: '', jobFinishedAt: job.finishedAt, riskGate: note, notes: note };
    }
    if (job.status === 'failed') return { ...task, statusBadge: 'FAILED — RELAUNCH', statusTone: 'red', uninitiated: true };
    return { ...task, statusBadge: 'BLOCKED — see reason', statusTone: 'red', uninitiated: true, blockedReason: job.blockedReason, riskGate: job.blockedReason, notes: job.blockedReason };
  });
}

function classifyStatus(status: string): {
  statusBadge: string;
  statusTone: string;
  uninitiated: boolean;
} {
  if (status === 'briefed') return { statusBadge: 'READY', statusTone: 'green', uninitiated: true };
  if (status === 'backlog') return { statusBadge: 'NO BRIEF', statusTone: 'yellow', uninitiated: true };
  if (status === 'in_progress') return { statusBadge: 'RUNNING', statusTone: 'blue', uninitiated: false };
  if (status === 'review') return { statusBadge: 'REVIEW', statusTone: 'orange', uninitiated: false };
  if (status === 'done') return { statusBadge: 'DONE', statusTone: 'muted', uninitiated: false };
  return { statusBadge: status || 'unknown', statusTone: 'muted', uninitiated: false };
}

function sortTasks<T extends { status: string; uninitiated: boolean; id: string }>(tasks: T[]): T[] {
  return tasks.sort(
    (a, b) =>
      Number(b.uninitiated) - Number(a.uninitiated) ||
      Number(a.status === 'done') - Number(b.status === 'done') ||
      a.id.localeCompare(b.id),
  );
}

function parseExecutor(content: string): 'codex' | 'opencode' | 'either' {
  const match = content.match(/^## EXECUTOR\s*\n\s*(codex|opencode|either)\b/m);
  if (!match) return 'codex';
  return match[1] as 'codex' | 'opencode' | 'either';
}

function promptForBrief(briefPath: string): string {
  const displayPath = briefPath.startsWith(HOME) ? `~${briefPath.slice(HOME.length)}` : briefPath;
  return [
    'Read ~/kernel/agents/executor.md.',
    `Then read ${displayPath} and implement it.`,
    'Report back using ~/kernel/templates/implementation-report.md. Paste raw command output — do not summarize.',
  ].join('\n');
}

export async function getPermissionRequests(): Promise<PermissionRequest[]> {
  const files = await listFiles(PERMISSION_DIR);
  const responseIds = new Set(
    files.filter((file) => file.endsWith('.response.md')).map((file) => file.slice(0, -12)),
  );
  const requests = await Promise.all(
    files
      .filter((file) => file.endsWith('.request.md'))
      .map(async (file): Promise<PermissionRequest | null> => {
        const { fields, body } = parseFrontmatter(await readText(join(PERMISSION_DIR, file)));
        const id = fields.id || file.slice(0, -11);
        if (responseIds.has(id)) return null;
        return {
          id,
          requestor: fields.requestor || 'unknown',
          task: fields.task || 'unassigned',
          question: fields.question || 'No question supplied',
          urgency: (fields.urgency || 'LOW').toUpperCase(),
          created: fields.created || 'unknown',
          context: body,
        };
      }),
  );

  const urgencyOrder: Record<string, number> = { HIGH: 0, MED: 1, LOW: 2 };
  return requests
    .filter((request): request is PermissionRequest => request !== null)
    .sort(
      (a, b) =>
        (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3) ||
        a.created.localeCompare(b.created),
    );
}

export async function getExTasks(): Promise<ExTask[]> {
  const [content, briefFiles] = await Promise.all([readText(EX_BOARD), listFiles(EX_BRIEFS_DIR)]);
  const tasks = await Promise.all(content
    .split(/\r?\n/)
    .filter((line) => /^\|\s*[A-Z]+-\d+[a-z]?\s*\|/.test(line))
    .map(async (line) => {
      const cells = tableCells(line);
      const id = cells[0];
      const status = (cells[1] || 'unknown').replaceAll('`', '');
      const title = cells[2] || '';
      const briefFile = briefFiles.find((file) => file.startsWith(`${id}-`) && file.endsWith('.md'));
      const briefPath = briefFile ? join(EX_BRIEFS_DIR, briefFile) : '';
      const preview = await getBriefPreview(briefPath);
      const dependsOn = (cells[6] || '').replace(/^—$/, '').trim();
      return {
        id,
        status,
        ...classifyStatus(status),
        title,
        briefPath,
        ...preview,
        prompt: status === 'briefed' && briefPath ? promptForBrief(briefPath) : '',
        riskGate: cells[5] || '',
        dependsOn,
        blocked: false,
        executor: parseExecutor(preview.briefContent),
      };
    }));
  const statusMap = new Map(tasks.map((task) => [task.id, task.status]));
  const resolved = tasks.map((task) => ({
    ...task,
    blocked: task.dependsOn
      ? task.dependsOn.split(',').map((dep) => dep.trim()).filter(Boolean)
          .some((dep) => statusMap.get(dep) !== 'done')
      : false,
  }));
  return sortTasks(resolved);
}

export async function getSyntraTasks(): Promise<SyntraTask[]> {
  const content = await readText(SYNTRA_TASKS);
  const tasks = await Promise.all(content
    .split(/\r?\n/)
    .filter((line) => /^\|\s*[A-Z]+-\d+[a-z]?\s*\|/.test(line))
    .map(async (line) => {
      const cells = tableCells(line);
      const status = (cells[1] || 'unknown').replaceAll('`', '');
      const briefRef = cells[5] || '';
      const hasBrief = briefRef !== '' && briefRef !== '—';
      const briefPath = hasBrief
        ? briefRef.startsWith('~/')
          ? join(HOME, briefRef.slice(2))
          : isAbsolute(briefRef)
            ? briefRef
            : join(SYNTRA_BRIEFS_DIR, briefRef)
        : '';
      const preview = await getBriefPreview(briefPath);
      return {
        id: cells[0],
        status,
        ...classifyStatus(status),
        priority: cells[2] || '',
        title: cells[4] || '',
        briefPath,
        ...preview,
        prompt: ['briefed', 'backlog'].includes(status)
          ? briefPath
            ? promptForBrief(briefPath)
            : 'Brief not yet written — architect must write it first.'
          : '',
        notes: cells[6] || '',
      };
    }));
  return sortTasks(tasks);
}

export async function getBrainBusSummary(): Promise<BrainBusSummary> {
  const [pendingFiles, claimedFiles, failedFiles] = await Promise.all([
    listFiles(join(BRAIN_BUS_TASKS, 'pending')),
    listFiles(join(BRAIN_BUS_TASKS, 'claimed')),
    listFiles(join(BRAIN_BUS_TASKS, 'failed')),
  ]);
  const markdownFiles = (files: string[]) => files.filter((file) => file.endsWith('.md'));
  const failedMarkdown = markdownFiles(failedFiles);
  const failedTasks = await Promise.all(
    failedMarkdown.map(async (file) => {
      const { fields } = parseFrontmatter(await readText(join(BRAIN_BUS_TASKS, 'failed', file)));
      return {
        filename: basename(file),
        action: fields.action || 'unknown action',
        priority: fields.priority || 'unknown',
      };
    }),
  );

  return {
    pending: markdownFiles(pendingFiles).length,
    claimed: markdownFiles(claimedFiles).length,
    failed: failedMarkdown.length,
    failedTasks,
  };
}

function classifyNaviStatus(status: string): { statusBadge: string; statusTone: string; uninitiated: boolean } {
  if (status === 'done') return { statusBadge: 'DONE', statusTone: 'muted', uninitiated: false };
  if (status === 'review') return { statusBadge: 'REVIEW', statusTone: 'orange', uninitiated: false };
  if (status === 'in_progress') return { statusBadge: 'RUNNING', statusTone: 'blue', uninitiated: false };
  if (status === 'ready') return { statusBadge: 'READY', statusTone: 'green', uninitiated: true };
  if (status === 'backlog') return { statusBadge: 'BACKLOG', statusTone: 'yellow', uninitiated: true };
  if (status === 'blocked') return { statusBadge: 'BLOCKED', statusTone: 'red', uninitiated: false };
  if (status === 'needs_fix') return { statusBadge: 'NEEDS FIX', statusTone: 'red', uninitiated: false };
  return { statusBadge: status || 'unknown', statusTone: 'muted', uninitiated: false };
}

export async function getNaviTasks(): Promise<SyntraTask[]> {
  const content = await readText(NAVI_TASKS);
  const seen = new Set<string>();
  const tasks = await Promise.all(
    content
      .split(/\r?\n/)
      .filter((line) => /^\|\s*[A-Z][A-Z0-9]*-\w+\s*\|/.test(line))
      .map(async (line): Promise<SyntraTask | null> => {
        const cells = tableCells(line);
        if (cells.length < 4) return null;
        const id = cells[0];
        if (seen.has(id)) return null;
        seen.add(id);
        const status = cells[1].replaceAll('`', '').trim();
        const title = cells[2] || '';

        // Main table (6 cols): ID | Status | Title | Brief | Owner | Notes
        // Follow-up table (5 cols): ID | Status | Title | Owner | Notes
        let briefRef = '';
        let notes = '';
        if (cells.length >= 6) {
          briefRef = cells[3].replaceAll('`', '').trim();
          notes = cells[5] || '';
        } else {
          notes = cells[4] || '';
        }

        const isValidBrief = briefRef && briefRef !== 'TBD' && briefRef !== '—';
        const briefPath = isValidBrief
          ? briefRef.startsWith('~/')
            ? join(HOME, briefRef.slice(2))
            : join(NAVI_PROJECT_DIR, briefRef)
          : '';
        const preview = await getBriefPreview(briefPath);

        return {
          id,
          status,
          ...classifyNaviStatus(status),
          priority: '',
          title,
          briefPath,
          ...preview,
          prompt: '',
          notes,
        };
      }),
  );
  return sortTasks(tasks.filter((t): t is SyntraTask => t !== null));
}

export async function getTaskboardData(): Promise<TaskboardData> {
  const [permissionRequests, ecosystemTasks, syntraTasks, naviTasks, brainBus, jobs] = await Promise.all([
    getPermissionRequests(),
    getExTasks(),
    getSyntraTasks(),
    getNaviTasks(),
    getBrainBusSummary(),
    latestJobs(),
  ]);
  const borealTasks = ecosystemTasks.filter((task) => /^BX-/.test(task.id));
  const vicTasks = ecosystemTasks.filter((task) => /^VIC-/.test(task.id));
  const exTasks = ecosystemTasks.filter((task) => !/^BX-/.test(task.id) && !/^VIC-/.test(task.id));
  return {
    permissionRequests,
    borealTasks: overlayJobState(borealTasks, jobs),
    exTasks: overlayJobState(exTasks, jobs),
    vicTasks: overlayJobState(vicTasks, jobs),
    syntraTasks: overlayJobState(syntraTasks, jobs),
    naviTasks,
    brainBus,
  };
}
