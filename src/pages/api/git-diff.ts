import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getGitnexusStatus } from '../../lib/gitnexus';

const execFileAsync = promisify(execFile);
const MAX_DIFF = 200 * 1024;

async function git(repoPath: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 20_000,
    });
    return stdout;
  } catch {
    return '';
  }
}

export const GET: APIRoute = async ({ url }) => {
  const name = url.searchParams.get('repo') ?? '';
  const scope = url.searchParams.get('scope') ?? 'dirty';
  const status = await getGitnexusStatus();
  const repo = status.repos.find((entry) => entry.name === name);
  if (!repo) {
    return new Response(JSON.stringify({ error: `unknown repo: ${name}` }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  let diff: string;
  if (scope === 'unpushed') {
    const log = await git(repo.path, ['log', '@{u}..HEAD', '--oneline']);
    const body = await git(repo.path, ['diff', '@{u}..HEAD', '--stat', '--patch']);
    diff = log ? `unpushed commits:\n${log}\n${body}` : '— nothing unpushed —';
  } else {
    const porcelain = await git(repo.path, ['status', '--porcelain']);
    const body = await git(repo.path, ['diff', 'HEAD']);
    diff = porcelain ? `changed files:\n${porcelain}\n${body}` : '— working tree clean —';
  }
  if (diff.length > MAX_DIFF) {
    diff = `${diff.slice(0, MAX_DIFF)}\n… truncated (${diff.length} bytes total)`;
  }
  return new Response(JSON.stringify({ repo: name, scope, diff }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
