import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CRM_PATH = join(homedir(), 'projects/boreal-leads/crm.db');

export interface LeadSummary {
  name: string;
  phone: string;
  stage: string;
  lastMessage: {
    body: string;
    direction: 'in' | 'out';
    ts: string;
  } | null;
  unanswered: boolean;
}

export interface Conversation {
  id: number;
  direction: 'in' | 'out';
  body: string;
  classification: string;
  source: string;
  ts: string;
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function query<T>(sql: string): Promise<T[]> {
  const { stdout } = await execFileAsync(
    'sqlite3',
    ['-readonly', '-json', CRM_PATH, sql],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout.trim() ? JSON.parse(stdout) as T[] : [];
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    aacute: 'á',
    agrave: 'à',
    acirc: 'â',
    ccedil: 'ç',
    eacute: 'é',
    egrave: 'è',
    ecirc: 'ê',
    euml: 'ë',
    gt: '>',
    icirc: 'î',
    iuml: 'ï',
    lt: '<',
    nbsp: ' ',
    ocirc: 'ô',
    quot: '"',
    ugrave: 'ù',
    ucirc: 'û',
    uuml: 'ü',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#x')) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return named[code.toLowerCase()] ?? entity;
  });
}

export async function getLeads(): Promise<LeadSummary[]> {
  const rows = await query<{
    name: string;
    phone: string;
    stage: string;
    body: string | null;
    direction: 'in' | 'out' | null;
    ts: string | null;
  }>(`
    SELECT
      l.name,
      l.phone,
      l.stage,
      c.body,
      c.direction,
      c.ts
    FROM leads l
    LEFT JOIN conversations c ON c.id = (
      SELECT latest.id
      FROM conversations latest
      WHERE latest.lead_phone = l.phone
      ORDER BY latest.ts DESC, latest.id DESC
      LIMIT 1
    )
    WHERE c.id IS NOT NULL
    ORDER BY
      CASE WHEN c.direction = 'in' THEN 0 ELSE 1 END,
      CASE
        WHEN l.stage
          IN ('REPLIED', 'RESPONDED', 'BOOKED') THEN 0
        ELSE 1
      END,
      COALESCE(l.last_inbound_ts, c.ts) DESC
  `);

  return rows.map((row) => ({
    name: decodeEntities(row.name),
    phone: row.phone,
    stage: row.stage,
    lastMessage: row.direction && row.ts && row.body !== null
      ? { body: row.body, direction: row.direction, ts: row.ts }
      : null,
    unanswered: row.direction === 'in',
  }));
}

export async function getLeadThread(phone: string): Promise<Conversation[]> {
  return query<Conversation>(`
    SELECT
      id,
      direction,
      body,
      COALESCE(classification, '') AS classification,
      COALESCE(template_bucket, '') AS source,
      ts
    FROM conversations
    WHERE lead_phone = ${sqlText(phone)}
    ORDER BY ts ASC, id ASC
  `);
}

export async function leadExists(phone: string): Promise<boolean> {
  const rows = await query<{ found: number }>(
    `SELECT 1 AS found FROM leads WHERE phone = ${sqlText(phone)} LIMIT 1`,
  );
  return rows.length > 0;
}
