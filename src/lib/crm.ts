import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// ── Grouped leads (for incall console) ──────────────────────────────────────

export interface LeadGrouped {
  phone: string;
  name: string;
  stage: string;
  notes: string;
  close_touch: number;
  responded_at: string;
  close_last_ts: string;
  sent_date: string;
  postpone_until: string;
  postpone_note: string;
  tags: string[];
  template: string;
  last_ts: string;
  last_body: string;
  last_classification: string;
}

export async function getLeadsGrouped(): Promise<Record<string, LeadGrouped[]>> {
  const rows = await query<{
    phone: string; name: string; stage: string; notes: string;
    close_touch: number; responded_at: string; close_last_ts: string;
    sent_date: string; postpone_until: string; postpone_note: string;
    tags: string; template: string; last_ts: string;
    last_body: string; last_classification: string;
  }>(`
    SELECT phone, name, stage,
      COALESCE(notes,'') as notes,
      COALESCE(close_touch,0) as close_touch,
      COALESCE(responded_at,'') as responded_at,
      COALESCE(close_last_ts,'') as close_last_ts,
      COALESCE(sent_date,'') as sent_date,
      COALESCE(postpone_until,'') as postpone_until,
      COALESCE(postpone_note,'') as postpone_note,
      COALESCE(tags,'') as tags,
      COALESCE(template,'') as template,
      COALESCE(last_inbound_ts, last_outbound_ts, '') as last_ts,
      COALESCE(last_inbound_body, last_outbound_body, '') as last_body,
      COALESCE(last_inbound_class,'') as last_classification
    FROM leads
    WHERE stage IN ('RESPONDED','BOOKED','POSTPONED','FROID','STOP','BANNED')
    ORDER BY COALESCE(last_inbound_ts, last_outbound_ts, sent_date) DESC
  `);

  const groups: Record<string, LeadGrouped[]> = {
    responded: [], booked: [], postponed: [], froid: [], stop: [], banned: [],
  };

  for (const row of rows) {
    const lead: LeadGrouped = {
      ...row,
      tags: row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    };
    const key = row.stage.toLowerCase();
    if (key in groups) groups[key].push(lead);
  }

  return groups;
}

const VALID_STAGES = new Set([
  'RESPONDED', 'BOOKED', 'WON', 'LOST', 'IGNORED', 'SKIPPED',
  'DRAFTED', 'POSTPONED', 'STOP', 'BANNED', 'SENT', 'FROID',
]);

async function execWriteSQL(sql: string): Promise<void> {
  await promisify(execFile)('sqlite3', [CRM_PATH, sql], { maxBuffer: 1024 * 1024 });
}

export async function updateLeadStage(phone: string, stage: string): Promise<void> {
  if (!VALID_STAGES.has(stage)) throw new Error(`Invalid stage: ${stage}`);
  await execWriteSQL(
    `UPDATE leads SET stage=${sqlText(stage)},updated_at=datetime('now') WHERE phone=${sqlText(phone)}`,
  );
}

export async function setLeadTags(phone: string, tags: string[]): Promise<void> {
  const tagsStr = tags.map((t) => t.trim()).filter(Boolean).join(',');
  await execWriteSQL(
    `UPDATE leads SET tags=${sqlText(tagsStr)},updated_at=datetime('now') WHERE phone=${sqlText(phone)}`,
  );
}

const NOTES_DIR = join(homedir(), '.local/share/aperture/incall-notes');

export function getLeadNotes(phone: string): string {
  try {
    const safe = phone.replace(/[^0-9+]/g, '');
    return readFileSync(join(NOTES_DIR, `${safe}.txt`), 'utf8');
  } catch {
    return '';
  }
}

export function saveLeadNotes(phone: string, notes: string): void {
  mkdirSync(NOTES_DIR, { recursive: true });
  const safe = phone.replace(/[^0-9+]/g, '');
  writeFileSync(join(NOTES_DIR, `${safe}.txt`), notes);
}
