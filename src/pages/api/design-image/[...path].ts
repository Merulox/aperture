import type { APIRoute } from 'astro';
import { createReadStream } from 'node:fs';
import { access, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';

const SCREENSHOTS_DIR = join(homedir(), 'syntra/docs/design/screenshots');

export const GET: APIRoute = async ({ params }) => {
  const requestPath = params.path;
  if (!requestPath || requestPath.includes('\0') || extname(requestPath).toLowerCase() !== '.png') {
    return new Response('not found', { status: 404 });
  }

  const root = await realpath(SCREENSHOTS_DIR).catch(() => null);
  if (!root) return new Response('not found', { status: 404 });

  const target = normalize(join(root, requestPath));
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    return new Response('not found', { status: 404 });
  }

  const resolved = await realpath(target).catch(() => null);
  if (!resolved || !resolved.startsWith(`${root}${sep}`)) {
    return new Response('not found', { status: 404 });
  }

  await access(resolved).catch(() => null);
  const body = Readable.toWeb(createReadStream(resolved)) as ReadableStream;
  return new Response(body, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'no-store',
    },
  });
};
