import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const GET: APIRoute = async () => {
  try {
    const link = readFileSync(join(homedir(), '.secrets/calendly-link.txt'), 'utf8').trim();
    return Response.json({ link });
  } catch {
    return Response.json({ link: '' });
  }
};
