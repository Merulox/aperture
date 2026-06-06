import type { APIRoute } from 'astro';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await request.json()
    : Object.fromEntries(await request.formData());
  const id = String(payload.id || '').trim();
  const answer = String(payload.answer || '').trim();

  if (!/^[A-Za-z0-9_-]+$/.test(id) || !answer) {
    return new Response('A valid request id and answer are required.', { status: 400 });
  }

  const directory = join(homedir(), 'obsidian/claude-bus/permission-requests');
  await mkdir(directory, { recursive: true });
  const response = `---\nid: ${id}\nanswered_at: ${new Date().toISOString()}\n---\n${answer}\n`;
  await writeFile(join(directory, `${id}.response.md`), response, 'utf8');

  return redirect('/tasks', 303);
};
