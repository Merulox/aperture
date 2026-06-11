import type { APIRoute } from 'astro';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const JOBS_DIR = join(homedir(), '.local/share/aperture/jobs');

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

interface JobView extends JobRecord {
  logTail: string;
}

function tailLines(content: string, lineCount = 100): string {
  const lines = content.trimEnd().split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - lineCount)).join('\n');
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

async function readJob(jobFile: string): Promise<JobRecord | null> {
  try {
    return JSON.parse(await readFile(join(JOBS_DIR, jobFile), 'utf8')) as JobRecord;
  } catch {
    return null;
  }
}

async function readLogTail(logPath: string): Promise<string> {
  try {
    return tailLines(await readFile(logPath, 'utf8'));
  } catch {
    return '';
  }
}

async function refreshJob(job: JobRecord, jobPath: string): Promise<JobRecord> {
  if (job.status !== 'running') return job;

  if (isPidAlive(job.pid)) {
    return job;
  }

  const updated: JobRecord = {
    ...job,
    status: job.exitCode === 0 ? 'done' : 'failed',
    finishedAt: job.finishedAt || new Date().toISOString(),
  };
  await writeFile(jobPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return updated;
}

export const GET: APIRoute = async () => {
  let files: string[] = [];
  try {
    files = await readdir(JOBS_DIR);
  } catch {
    return new Response(JSON.stringify({ jobs: [] }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const jobs = await Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .map(async (file): Promise<JobView | null> => {
        const jobPath = join(JOBS_DIR, file);
        const job = await readJob(file);
        if (!job) return null;
        const refreshed = await refreshJob(job, jobPath);
        const logTail = await readLogTail(refreshed.logPath);
        return { ...refreshed, logTail };
      }),
  );

  const visibleJobs = jobs
    .filter((job): job is JobView => job !== null)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 20);

  return new Response(JSON.stringify({ jobs: visibleJobs }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
