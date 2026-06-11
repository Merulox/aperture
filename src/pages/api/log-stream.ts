import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const JOBS_DIR = join(homedir(), '.local/share/aperture/jobs');

interface JobRecord {
  pid: number;
  logPath: string;
  exitCode: number | null;
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

export const GET: APIRoute = async ({ url }) => {
  const jobId = url.searchParams.get('jobId');
  if (!jobId || !/^[\w-]+$/.test(jobId)) {
    return new Response('invalid jobId', { status: 400 });
  }

  let job: JobRecord;
  try {
    job = JSON.parse(await readFile(join(JOBS_DIR, `${jobId}.json`), 'utf8')) as JobRecord;
  } catch {
    return new Response('job not found', { status: 404 });
  }

  let tick: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      let offset = 0;
      let reading = false;
      const enc = new TextEncoder();

      tick = setInterval(async () => {
        if (reading) return;
        reading = true;

        const content = await readFile(job.logPath, 'utf8').catch(() => '');
        const chunk = content.slice(offset);
        offset = content.length;
        for (const line of chunk.split('\n')) {
          if (line) controller.enqueue(enc.encode(`data: ${line}\n\n`));
        }

        if (!isPidAlive(job.pid)) {
          controller.enqueue(enc.encode(`event: done\ndata: ${job.exitCode ?? 1}\n\n`));
          clearInterval(tick);
          controller.close();
        }
        reading = false;
      }, 500);
    },
    cancel() {
      clearInterval(tick);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
