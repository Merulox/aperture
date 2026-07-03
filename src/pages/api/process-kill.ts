import type { APIRoute } from 'astro';
import { kill } from 'node:process';
import { findManageableProcess } from '../../lib/data';

export const POST: APIRoute = async ({ request }) => {
  const payload = await request.json().catch(() => ({}));
  const pid = Number(payload.pid);

  if (!Number.isInteger(pid) || pid <= 1) {
    return json({ ok: false, error: 'A valid pid is required.' }, 400);
  }

  const process = findManageableProcess(pid);
  if (!process) {
    return json({ ok: false, error: 'Process is not visible or not manageable.' }, 403);
  }

  try {
    kill(pid, 'SIGTERM');
    return json({
      ok: true,
      pid,
      command: process.command,
      signal: 'SIGTERM',
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to terminate process.',
      },
      500,
    );
  }
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
