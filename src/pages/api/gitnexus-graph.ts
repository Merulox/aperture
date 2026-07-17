import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { getGitnexusStatus } from '../../lib/gitnexus';

const execFileAsync = promisify(execFile);
const GITNEXUS_BIN = join(homedir(), '.npm-global/bin/gitnexus');

const NODE_QUERY =
  "MATCH (s) WHERE label(s) IN ['Function','Class','Method','File'] " +
  "OPTIONAL MATCH (s)-[m:CodeRelation]->(c:Community) WHERE m.type='MEMBER_OF' " +
  'RETURN s.id AS id, s.name AS name, label(s) AS kind, s.filePath AS file, c.id AS community LIMIT 2000';

const EDGE_QUERY =
  "MATCH (a)-[r:CodeRelation]->(b) WHERE r.type IN ['CALLS','IMPORTS','DEFINES','HAS_METHOD'] " +
  'RETURN a.id AS source, b.id AS target, r.type AS type LIMIT 4000';

// cypher CLI returns rows as a markdown table; cells never contain "|"
// because we only select ids, names, labels, and paths
function parseTable(markdown: string): string[][] {
  const lines = markdown.split('\n').filter((line) => line.startsWith('|'));
  return lines.slice(2).map((line) =>
    line.replace(/^\|\s?/, '').replace(/\s?\|$/, '').split(' | ').map((cell) => cell.trim()),
  );
}

// the CLI truncates large output on pipes (async stdout flush + exit),
// so route it through a file where Node's stdout writes are synchronous
async function cypher(repo: string, query: string): Promise<string[][]> {
  const outFile = join(tmpdir(), `gitnexus-cypher-${randomUUID()}.json`);
  try {
    await execFileAsync(
      '/bin/sh',
      ['-c', '"$1" cypher -r "$2" "$3" > "$4"', 'sh', GITNEXUS_BIN, repo, query, outFile],
      { timeout: 60_000 },
    );
    // zero rows comes back as a bare [] instead of {markdown}
    const payload = JSON.parse(await readFile(outFile, 'utf8')) as { markdown?: string } | unknown[];
    if (Array.isArray(payload) || !payload.markdown) return [];
    return parseTable(payload.markdown);
  } finally {
    await unlink(outFile).catch(() => {});
  }
}

export const GET: APIRoute = async ({ url }) => {
  const repo = url.searchParams.get('repo') ?? '';
  const status = await getGitnexusStatus();
  if (!status.repos.some((entry) => entry.name === repo)) {
    return new Response(JSON.stringify({ error: `unknown repo: ${repo}` }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const [nodeRows, edgeRows] = await Promise.all([cypher(repo, NODE_QUERY), cypher(repo, EDGE_QUERY)]);
    const nodes = nodeRows.map(([id, name, kind, file, community]) => ({
      id, name, kind, file, community: community || 'none',
    }));
    const seen = new Set(nodes.map((node) => node.id));
    const links = edgeRows
      .filter(([source, target]) => seen.has(source) && seen.has(target))
      .map(([source, target, type]) => ({ source, target, type }));
    return new Response(JSON.stringify({ repo, nodes, links }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
};
