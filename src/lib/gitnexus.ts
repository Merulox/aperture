import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REGISTRY = join(homedir(), '.gitnexus/registry.json');
const SERVE_URL = 'http://localhost:4747';
export const EXPLORER_URL = 'https://gitnexus.vercel.app';

export interface RepoStats {
  files: number;
  nodes: number;
  edges: number;
  communities: number;
  processes: number;
  embeddings: number;
}

export interface RepoSync {
  branch: string;
  ahead: number;
  behind: number;
  dirtyCount: number;
  remoteUrl: string | null;
  health: string;
}

export interface RepoStatus {
  name: string;
  path: string;
  indexedAt: string;
  lastCommit: string;
  remoteUrl?: string;
  stats: RepoStats;
  commitsBehind: number | null;
  sync: RepoSync | null;
}

export interface GitnexusStatus {
  serve: 'up' | 'down';
  nextReindex: string | null;
  repos: RepoStatus[];
  generatedAt: string;
}

interface RegistryEntry extends Omit<RepoStatus, 'commitsBehind'> {}

async function readRegistry(): Promise<RegistryEntry[]> {
  // serve is the live source; the registry file is the fallback when it's down
  try {
    const response = await fetch(`${SERVE_URL}/api/repos`, { signal: AbortSignal.timeout(1500) });
    if (response.ok) return (await response.json()) as RegistryEntry[];
  } catch {
    /* fall through to file */
  }
  try {
    return JSON.parse(await readFile(REGISTRY, 'utf8')) as RegistryEntry[];
  } catch {
    return [];
  }
}

async function serveStatus(): Promise<'up' | 'down'> {
  try {
    const response = await fetch(`${SERVE_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

async function commitsBehind(repoPath: string, lastCommit: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, 'rev-list', '--count', `${lastCommit}..HEAD`]);
    const count = Number.parseInt(stdout.trim(), 10);
    return Number.isNaN(count) ? null : count;
  } catch {
    return null;
  }
}

async function git(repoPath: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], { timeout: 10_000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

// computed live from local git so commits/pushes reflect on the next refresh;
// "behind" is only as fresh as the last fetch — git-tracker fetches every 15 min
async function computeSync(repoPath: string): Promise<RepoSync | null> {
  // rev-parse fails on a repo with no commits yet; symbolic-ref names the unborn branch
  const branch =
    (await git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])) ??
    (await git(repoPath, ['symbolic-ref', '--short', 'HEAD']));
  if (branch === null) return null;
  const [remoteUrl, tracking, porcelain] = await Promise.all([
    git(repoPath, ['remote', 'get-url', 'origin']),
    git(repoPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
    git(repoPath, ['status', '--porcelain']),
  ]);
  let ahead = 0;
  let behind = 0;
  if (tracking && tracking !== 'HEAD') {
    const counts = await git(repoPath, ['rev-list', '--left-right', '--count', `HEAD...${tracking}`]);
    const parts = counts?.split(/\s+/) ?? [];
    if (parts.length === 2) {
      ahead = Number.parseInt(parts[0], 10) || 0;
      behind = Number.parseInt(parts[1], 10) || 0;
    }
  }
  const dirtyCount = (porcelain ?? '').split('\n').filter((line) => line.trim()).length;
  const health = behind > 0 ? 'behind' : dirtyCount > 0 ? 'dirty' : ahead > 0 ? 'ahead' : 'clean';
  return { branch, ahead, behind, dirtyCount, remoteUrl: remoteUrl || null, health };
}

async function nextReindex(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('systemctl', [
      '--user', 'show', 'gitnexus-reindex.timer', '--property=NextElapseUSecRealtime', '--value',
    ]);
    const value = stdout.trim();
    return value && value !== 'n/a' ? value : null;
  } catch {
    return null;
  }
}

export async function getGitnexusStatus(): Promise<GitnexusStatus> {
  const [serve, next, registry] = await Promise.all([serveStatus(), nextReindex(), readRegistry()]);
  const repos = await Promise.all(
    registry.map(async (entry): Promise<RepoStatus> => {
      const [behind, sync] = await Promise.all([
        commitsBehind(entry.path, entry.lastCommit),
        computeSync(entry.path),
      ]);
      return { ...entry, commitsBehind: behind, sync };
    }),
  );
  repos.sort((a, b) => a.name.localeCompare(b.name));
  return { serve, nextReindex: next, repos, generatedAt: new Date().toISOString() };
}
