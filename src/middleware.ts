import type { MiddlewareHandler } from 'astro';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const authFile =
  process.env.WEB_AUTH_FILE ??
  import.meta.env.WEB_AUTH_FILE ??
  join(homedir(), '.secrets/web-auth.txt');

function loadExpectedAuth(): string {
  const raw = readFileSync(authFile, 'utf8').trim();
  const separator = raw.indexOf(':');
  if (separator <= 0 || separator === raw.length - 1) {
    throw new Error(`Invalid Basic auth credential file: ${authFile}`);
  }
  return 'Basic ' + btoa(raw);
}

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const auth = ctx.request.headers.get('authorization');
  if (auth !== loadExpectedAuth()) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="aperture"' },
    });
  }
  return next();
};
