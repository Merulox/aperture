import type { APIRoute } from 'astro';
import { open, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const HOME = homedir();
const JOBS_DIR = join(HOME, '.local/share/aperture/jobs');
const CODEX_CLI = '/run/current-system/sw/bin/codex';

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
}

function briefWorkContext(briefPath: string): WorkContext {
  const resolved = normalizePath(briefPath);
  const agentInfra = join(HOME, 'agent-infra');
  const syntra = join(HOME, 'syntra');
  const aperture = join(HOME, 'projects/aperture');
  const briefName = basename(resolved);

  if (resolved.startsWith(`${agentInfra}/`) || resolved === agentInfra) {
    // AP-* briefs work in aperture; all others work in agent-infra
    if (/^AP-\d/.test(briefName)) {
      return { cwd: aperture, addDirs: [agentInfra] };
    }
    // WEB-* briefs need ~/.config writable
    if (/^WEB-/.test(briefName)) {
      return { cwd: agentInfra, addDirs: [join(HOME, '.config')] };
    }
    return { cwd: agentInfra, addDirs: [] };
  }

  if (resolved.startsWith(`${syntra}/`) || resolved === syntra) {
    return { cwd: syntra, addDirs: [] };
  }

  return { cwd: dirname(resolved), addDirs: [] };
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
  const { cwd, addDirs } = briefWorkContext(briefPath);

  await mkdir(JOBS_DIR, { recursive: true });
  const logHandle = await open(logPath, 'a');

  let child;
  try {
    const codexArgs = ['exec', '-', '-C', cwd];
    for (const dir of addDirs) {
      codexArgs.push('--add-dir', dir);
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
      status: 'failed',
      exitCode: null,
      finishedAt: new Date().toISOString(),
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
