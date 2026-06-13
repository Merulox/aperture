import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const JOBS_DIR = join(homedir(), '.local/share/aperture/jobs');
const client = new Anthropic();

export const GET: APIRoute = async ({ url }) => {
  const jobId = url.searchParams.get('jobId');
  if (!jobId || !/^[\w-]+$/.test(jobId)) {
    return new Response(JSON.stringify({ summary: '' }), { headers: { 'content-type': 'application/json' } });
  }

  let job: any;
  try {
    job = JSON.parse(await readFile(join(JOBS_DIR, `${jobId}.json`), 'utf8'));
  } catch {
    return new Response(JSON.stringify({ summary: '' }), { headers: { 'content-type': 'application/json' } });
  }

  const raw = await readFile(job.logPath, 'utf8').catch(() => '');
  const lines = raw.split('\n')
    .filter(l => l.trim() && !l.includes('[gitnexus]'))
    .slice(-40)
    .join('\n');

  if (!lines.trim()) {
    return new Response(JSON.stringify({ summary: 'starting…' }), { headers: { 'content-type': 'application/json' } });
  }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 30,
    system: 'Output ONE phrase (max 8 words) describing what the agent is doing right now. No punctuation. No filler.',
    messages: [{ role: 'user', content: lines }],
  });

  const summary = (response.content[0] as any).text?.trim() ?? '';
  return new Response(JSON.stringify({ summary }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
