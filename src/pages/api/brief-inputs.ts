import type { APIRoute } from 'astro';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { PROVIDED_INPUTS_HEADING, parseProvidedInputs } from '../../lib/tasks';

const HOME = homedir();
const ALLOWED_DIRS = [
  join(HOME, 'syntra/docs/planning'),
  join(HOME, 'kernel/ecosystem-review/briefs'),
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function normalizePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('~/')) return join(HOME, trimmed.slice(2));
  return isAbsolute(trimmed) ? trimmed : resolve(trimmed);
}

function isWithin(path: string, root: string): boolean {
  const remainder = relative(root, path);
  return remainder === '' || (!remainder.startsWith('..') && !isAbsolute(remainder));
}

async function allowedBriefPath(input: string): Promise<string | undefined> {
  const [briefPath, allowedDirs] = await Promise.all([
    realpath(normalizePath(input)).catch(() => ''),
    Promise.all(ALLOWED_DIRS.map((dir) => realpath(dir).catch(() => dir))),
  ]);
  if (!briefPath) return undefined;
  return allowedDirs.some((dir) => isWithin(briefPath, dir)) ? briefPath : undefined;
}

function formatSection(inputs: Record<string, string>, confirms: string[]): string {
  const lines = [`## ${PROVIDED_INPUTS_HEADING}`];
  for (const key of Object.keys(inputs).sort()) lines.push(`- ${key}: ${inputs[key]}`);
  for (const key of [...new Set(confirms)].sort()) lines.push(`- [x] ${key}`);
  return lines.join('\n');
}

function upsertProvidedInputsSection(
  content: string,
  inputs: Record<string, string>,
  confirms: string[],
): string {
  const existing = parseProvidedInputs(content);
  const mergedInputs = { ...existing.inputs, ...inputs };
  const mergedConfirms = [...new Set([...existing.confirms, ...confirms])];
  const section = formatSection(mergedInputs, mergedConfirms);
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${PROVIDED_INPUTS_HEADING}`);

  if (start >= 0) {
    const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
    const nextLines = [
      ...lines.slice(0, start),
      ...section.split('\n'),
      ...lines.slice(end < 0 ? lines.length : end),
    ];
    return nextLines.join('\n');
  }

  return `${content.trimEnd()}\n\n${section}\n`;
}

export const POST: APIRoute = async ({ request }) => {
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const briefPath = String(payload?.briefPath || '').trim();
  const rawInputs = payload?.inputs;
  const rawConfirms = payload?.confirms;

  if (!briefPath || !rawInputs || typeof rawInputs !== 'object' || Array.isArray(rawInputs)) {
    return json({ error: 'briefPath and inputs object are required.' }, 400);
  }

  const inputs: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawInputs as Record<string, unknown>)) {
    const name = key.trim();
    const input = String(value ?? '').trim();
    if (!name) return json({ error: 'Input names must be non-empty.' }, 400);
    if (!input) return json({ error: `Input ${name} must be non-empty.` }, 400);
    inputs[name] = input;
  }

  const confirms = Array.isArray(rawConfirms)
    ? rawConfirms.map((confirm) => String(confirm).trim()).filter(Boolean)
    : [];

  const resolvedBrief = await allowedBriefPath(briefPath);
  if (!resolvedBrief) return json({ error: 'briefPath is outside allowed directories or does not exist.' }, 403);

  const content = await readFile(resolvedBrief, 'utf8');
  await writeFile(resolvedBrief, upsertProvidedInputsSection(content, inputs, confirms), 'utf8');
  return json({ ok: true });
};
