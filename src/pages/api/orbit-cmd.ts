import type { APIRoute } from 'astro';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ORBIT_BIN = join(homedir(), 'scripts/orbit');
const ALLOWED_CMDS = new Set(['pause', 'resume', 'tick', 'pace', 'ask-answer', 'status', 'list', 'digest']);

export const POST: APIRoute = async ({ request }) => {
  let body: { args: unknown };
  try {
    body = await request.json() as { args: unknown };
  } catch {
    return Response.json({ ok: false, output: 'invalid json' }, { status: 400 });
  }

  const { args } = body;
  if (!Array.isArray(args) || args.length === 0 || args.some((a) => typeof a !== 'string' || !a)) {
    return Response.json({ ok: false, output: 'args must be a non-empty string[]' }, { status: 400 });
  }

  const cmd = args[0] as string;
  if (!ALLOWED_CMDS.has(cmd)) {
    return Response.json({ ok: false, output: `command '${cmd}' not allowed via UI` }, { status: 400 });
  }

  const result = spawnSync(ORBIT_BIN, args as string[], {
    encoding: 'utf-8',
    timeout: 30_000,
  });

  const output = (result.stdout + result.stderr).trim() || '(no output)';
  return Response.json({ ok: result.status === 0, output });
};
