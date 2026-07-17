import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';

const LOG_PATH = '/tmp/syntra-design-reviewer.log';

export const GET: APIRoute = async () => {
  const text = await readFile(LOG_PATH, 'utf8').catch(() => '');
  return new Response(JSON.stringify({ log: text }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
