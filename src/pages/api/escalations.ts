import type { APIRoute } from 'astro';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const JOBS_DIR = join(homedir(), '.local/share/aperture/jobs');

export const GET: APIRoute = async () => {
  let files: string[] = [];
  try {
    files = await readdir(JOBS_DIR);
  } catch {
    return Response.json([]);
  }

  const blockedFiles = files.filter((file) => file.endsWith('.blocked'));
  const escalations = await Promise.all(blockedFiles.map(async (file) => {
    const jobId = file.replace(/\.blocked$/, '');
    const text = await readFile(join(JOBS_DIR, file), 'utf8').catch(() => '');
    let taskId = '';
    try {
      const job = JSON.parse(await readFile(join(JOBS_DIR, `${jobId}.json`), 'utf8'));
      taskId = job.taskId;
    } catch {
      // A blocked file can still be displayed without a matching job record.
    }
    const lines = text.trim().split('\n');
    const category = lines[0]?.trim() || 'BLOCKED';
    const message = lines.slice(1).join('\n').trim();
    return { jobId, taskId, category, message };
  }));

  return Response.json(escalations.filter((escalation) => escalation.message));
};

export const DELETE: APIRoute = async ({ url }) => {
  const jobId = url.searchParams.get('jobId')?.trim() || '';
  if (!/^[A-Za-z0-9-]+$/.test(jobId)) {
    return new Response('A valid jobId is required.', { status: 400 });
  }

  try {
    await unlink(join(JOBS_DIR, `${jobId}.blocked`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Response('Escalation not found.', { status: 404 });
    }
    return new Response('Failed to dismiss escalation.', { status: 500 });
  }

  return Response.json({ ok: true });
};
