import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getGitnexusStatus } from '../../lib/gitnexus';

const execFileAsync = promisify(execFile);

export const POST: APIRoute = async ({ request }) => {
  let name = '';
  try {
    name = ((await request.json()) as { repo?: string }).repo ?? '';
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
  if (!repo.sync?.remoteUrl) {
    return new Response(JSON.stringify({ error: `${name} has no remote` }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const { stdout, stderr } = await execFileAsync('git', ['-C', repo.path, 'push'], {
      timeout: 60_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    // poke git-tracker so the panel badges update without waiting 15 min
    fetch('http://127.0.0.1:7776/refresh', { signal: AbortSignal.timeout(1500) }).catch(() => {});
    return new Response(JSON.stringify({ repo: name, output: (stderr + stdout).trim() || 'pushed' }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
};
