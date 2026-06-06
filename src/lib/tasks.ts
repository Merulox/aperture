import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

const HOME = homedir();
const PERMISSION_DIR = join(HOME, 'obsidian/claude-bus/permission-requests');
const EX_BRIEFS_DIR = join(HOME, 'agent-infra/ecosystem-review/briefs');
const EX_BOARD = join(EX_BRIEFS_DIR, 'README.md');
const SYNTRA_TASKS = join(HOME, 'syntra/.agent/TASKS.md');
const BRAIN_BUS_TASKS = join(HOME, 'obsidian/claude-bus/tasks');

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
  title: string;
  briefPath: string;
  riskGate: string;
}

export interface SyntraTask {
  id: string;
  status: string;
  priority: string;
  title: string;
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
  exTasks: ExTask[];
  syntraTasks: SyntraTask[];
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

async function listFiles(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
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
  return content
    .split(/\r?\n/)
    .filter((line) => /^\|\s*EX-\d+\s*\|/.test(line))
    .map((line) => {
      const cells = tableCells(line);
      const id = cells[0];
      const brief = cells[1] || '';
      const status = brief.match(/[✅🔄⬜]/u)?.[0] || '';
      const title = brief.replace(/[✅🔄⬜]/gu, '').trim();
      const briefPath = briefFiles.find((file) => file.startsWith(`${id}-`) && file.endsWith('.md'));
      return {
        id,
        status,
        title,
        briefPath: briefPath ? join(EX_BRIEFS_DIR, briefPath) : '',
        riskGate: cells[4] || '',
      };
    });
}

export async function getSyntraTasks(): Promise<SyntraTask[]> {
  const content = await readText(SYNTRA_TASKS);
  return content
    .split(/\r?\n/)
    .filter((line) => /^\|\s*[A-Z]+-\d+\s*\|/.test(line))
    .map((line) => {
      const cells = tableCells(line);
      return {
        id: cells[0],
        status: (cells[1] || 'unknown').replaceAll('`', ''),
        priority: cells[2] || '',
        title: cells[4] || '',
        notes: cells[6] || '',
      };
    });
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

export async function getTaskboardData(): Promise<TaskboardData> {
  const [permissionRequests, exTasks, syntraTasks, brainBus] = await Promise.all([
    getPermissionRequests(),
    getExTasks(),
    getSyntraTasks(),
    getBrainBusSummary(),
  ]);
  return { permissionRequests, exTasks, syntraTasks, brainBus };
}
