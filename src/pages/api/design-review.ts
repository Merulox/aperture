import type { APIRoute } from 'astro';
import { spawn, execFile } from 'node:child_process';
import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HOME = homedir();
const SYNTRA = join(HOME, 'syntra');
const NODE_BIN = '/run/current-system/sw/bin/node';
export const REVIEW_LOG = '/tmp/syntra-design-reviewer.log';

export const POST: APIRoute = async () => {
  const logHandle = await open(REVIEW_LOG, 'w');
  await logHandle.write(`[${new Date().toISOString()}] review started\n`);

  const child = spawn(NODE_BIN, ['scripts/design-reviewer.js'], {
    cwd: SYNTRA,
    detached: true,
    stdio: ['ignore', logHandle.fd, logHandle.fd],
  });

  child.once('exit', async (code) => {
    await logHandle.write(`[${new Date().toISOString()}] exited with code ${code}\n`).catch(() => {});
    await logHandle.close().catch(() => {});
    if (code === 0) {
      await execFileAsync('systemctl', ['--user', 'start', 'syntra-design-poller']).catch(() => {});
    }
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
};
