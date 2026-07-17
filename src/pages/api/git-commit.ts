import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getGitnexusStatus } from '../../lib/gitnexus';

const execFileAsync = promisify(execFile);

export const POST: APIRoute = async ({ request }) => {
  let name = '';
  let message = '';
  try {
    const body = (await request.json()) as { repo?: string; message?: string };
    name = body.repo ?? '';
    message = (body.message ?? '').trim();
  } catch {
    /* handled below */
  }
  const status = await getGitnexusStatus();
  const repo = status.repos.find((entry) => entry.name === name);
  if (!repo) {
    return new Response(JSON.stringify({ error: `unknown repo: ${name}` }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  if (!message) {
    return new Response(JSON.stringify({ error: 'commit message required' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  try {
    await execFileAsync('git', ['-C', repo.path, 'add', '-A'], { timeout: 30_000 });
    const { stdout } = await execFileAsync('git', ['-C', repo.path, 'commit', '-m', message], {
      timeout: 30_000,
    });
    fetch('http://127.0.0.1:7776/refresh', { signal: AbortSignal.timeout(1500) }).catch(() => {});
    return new Response(JSON.stringify({ repo: name, output: stdout.trim() }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
};
