import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { leadExists } from '../../lib/crm';

const execFileAsync = promisify(execFile);
const GATEWAY_PATH = join(homedir(), 'scripts/boreal-send');
const PHONE = /^\+\d{10,15}$/;

interface GatewayResult {
  exit_code?: number;
  result?: string;
  reason?: string;
  twilio_sid?: string | null;
}

function parseGatewayResult(stdout: string): GatewayResult {
  try {
    return JSON.parse(stdout.trim()) as GatewayResult;
  } catch {
    return {};
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    await access(GATEWAY_PATH);
  } catch {
    return Response.json({ ok: false, message: 'BX-01 gateway not installed' }, { status: 503 });
  }

  let payload: { phone?: unknown; body?: unknown };
  try {
    payload = await request.json();
  } catch {
    return new Response('A JSON body is required.', { status: 400 });
  }
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!PHONE.test(phone) || !body || body.length > 1000) {
    return new Response('A valid lead phone and message body (max 1000 characters) are required.', { status: 400 });
  }
  if (!await leadExists(phone)) {
    return new Response('Lead not found.', { status: 404 });
  }

  const args = ['--to', phone, '--body', body, '--human-approved', '--caller', 'aperture-console'];
  try {
    const { stdout } = await execFileAsync(GATEWAY_PATH, args, { maxBuffer: 1024 * 1024 });
    return Response.json({ ok: true, ...parseGatewayResult(stdout) });
  } catch (error) {
    const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
    const result = parseGatewayResult(failure.stdout ?? '');
    const exitCode = Number(result.exit_code ?? failure.code ?? 1);
    const message = exitCode === 2
      ? '⛔ lead opted out (STOP) — send refused'
      : result.reason || failure.stderr?.trim() || 'Gateway send failed';
    return Response.json({ ok: false, exitCode, message, ...result }, { status: 409 });
  }
};
