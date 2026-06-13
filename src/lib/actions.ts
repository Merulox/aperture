import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HOME = homedir();
const CRM_DB = join(HOME, 'projects/boreal-leads/crm.db');
const LEADS_PAGE = join(HOME, 'projects/aperture/src/pages/leads.astro');
const SIGNALS = join(HOME, '.claude/projects/-home-merulox/memory/signals.md');
const BRIEFS = join(HOME, 'agent-infra/ecosystem-review/briefs/README.md');
const GAP_AUDIT = join(HOME, 'obsidian/knowledge/projects/ecosystem/gap-audit-2026-06-11.md');
const FOLLOWUP_TEMPLATES = join(HOME, 'projects/boreal-leads/templates/followup.yaml');
const HELD_TIMERS = [
  'close-agent.timer',
  'follow-up-auto.timer',
  'follow-up-sequence.timer',
  'db-reactivation.timer',
  'outreach-batch.timer',
];

export type ActionOwner = 'merulox' | 'executor' | 'architect';
export type ActionUrgency = 'now' | 'today' | 'week';

export interface ActionItem {
  id: string;
  title: string;
  why: string;
  owner: ActionOwner;
  urgency: ActionUrgency;
  source: string;
  link?: string;
  filteredItems?: ActionItem[];
}

export interface NextActions {
  activeRule: string;
  actions: ActionItem[];
  generatedAt: string;
}

interface LeadRow {
  phone: string;
  name: string;
  stage?: string;
  classification?: string;
  postpone_until?: string;
  postpone_note?: string;
  notes?: string;
  last_outbound_ts?: string;
  last_inbound_ts?: string;
  last_inbound_body?: string;
  hours_since_reply?: number;
}

const sourceOrder = new Map([
  ['crm-unanswered', 0],
  ['crm-due', 1],
  ['crm-stale', 2],
  ['briefs', 3],
  ['gap-audit', 4],
  ['standing-checks', 5],
  ['signals', 6],
]);
const ownerOrder: Record<ActionOwner, number> = { merulox: 0, executor: 1, architect: 2 };
const urgencyOrder: Record<ActionUrgency, number> = { now: 0, today: 1, week: 2 };

function warning(source: string, message: string): ActionItem {
  return {
    id: `warning-${source}`,
    title: `⚠️ source unreadable: ${source}`,
    why: message,
    owner: 'architect',
    urgency: 'today',
    source,
  };
}

async function safeCollector(source: string, collector: () => Promise<ActionItem[]>): Promise<ActionItem[]> {
  try {
    return await collector();
  } catch (error) {
    return [warning(source, error instanceof Error ? error.message : String(error))];
  }
}

async function sqliteJson<T>(sql: string): Promise<T[]> {
  const uri = `file:${CRM_DB}?mode=ro&immutable=1`;
  const { stdout } = await execFileAsync('sqlite3', ['-json', uri, sql], { maxBuffer: 4 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) as T[] : [];
}

function leadName(lead: LeadRow): string {
  return lead.name || lead.phone;
}

async function collectCrm(): Promise<ActionItem[]> {
  const leadsPageExists = await access(LEADS_PAGE).then(() => true, () => false);
  const unanswered = await sqliteJson<LeadRow>(`
    WITH latest AS (
      SELECT c.*, ROW_NUMBER() OVER (PARTITION BY lead_phone ORDER BY ts DESC, id DESC) AS rn
      FROM conversations c
      WHERE junk = 0
    )
    SELECT l.phone, l.name, l.stage, latest.classification,
      latest.body AS last_inbound_body,
      ROUND((julianday('now') - julianday(latest.ts)) * 24, 1) AS hours_since_reply
    FROM latest JOIN leads l ON l.phone = latest.lead_phone
    WHERE latest.rn = 1 AND latest.direction = 'in'
    ORDER BY latest.ts ASC;
  `);
  const liveUnanswered = unanswered.filter((lead) =>
    !['STOP', 'DEAD'].includes(lead.stage?.toUpperCase() ?? '') &&
    !['STOP', 'BOUNCE'].includes(lead.classification?.toUpperCase() ?? '') &&
    (lead.hours_since_reply ?? 0) <= 14 * 24
  );
  const filteredUnanswered = unanswered.filter((lead) => !liveUnanswered.includes(lead));
  const due = await sqliteJson<LeadRow>(`
    SELECT phone, name, stage, postpone_until, postpone_note, notes
    FROM leads
    WHERE postpone_until IS NOT NULL
      AND date(postpone_until) <= date('now', '+1 day')
    ORDER BY date(postpone_until), name;
  `);
  const stale = await sqliteJson<LeadRow>(`
    SELECT phone, name, stage, last_outbound_ts, last_inbound_ts
    FROM leads
    WHERE stage IN ('REPLIED', 'RESPONDED')
      AND last_outbound_ts IS NOT NULL
      AND julianday('now') - julianday(last_outbound_ts) > 7
    ORDER BY last_outbound_ts ASC;
  `);

  return [
    ...liveUnanswered.map((lead): ActionItem => ({
      id: `unanswered-${lead.phone}`,
      title: `Reply to ${leadName(lead)}`,
      why: `Inbound reply waiting ${lead.hours_since_reply ?? '?'}h${lead.last_inbound_body ? `: ${lead.last_inbound_body}` : ''}`,
      owner: 'merulox',
      urgency: 'now',
      source: 'crm-unanswered',
      link: leadsPageExists ? `/leads?phone=${encodeURIComponent(lead.phone)}` : undefined,
    })),
    ...(filteredUnanswered.length > 0 ? [{
      id: 'unanswered-filtered-rollup',
      title: `${filteredUnanswered.length} older unanswered threads — review in /leads`,
      why: 'Older, STOP, DEAD, and bounced inbound threads are hidden from the urgent bucket.',
      owner: 'merulox' as const,
      urgency: 'week' as const,
      source: 'crm-unanswered',
      link: leadsPageExists ? '/leads' : undefined,
      filteredItems: filteredUnanswered.map((lead): ActionItem => ({
        id: `unanswered-filtered-${lead.phone}`,
        title: `Reply to ${leadName(lead)}`,
        why: `Inbound reply waiting ${lead.hours_since_reply ?? '?'}h${lead.last_inbound_body ? `: ${lead.last_inbound_body}` : ''}`,
        owner: 'merulox',
        urgency: 'week',
        source: 'crm-unanswered',
        link: leadsPageExists ? `/leads?phone=${encodeURIComponent(lead.phone)}` : undefined,
      })),
    }] : []),
    ...due.map((lead): ActionItem => ({
      id: `due-${lead.phone}`,
      title: `Follow up with ${leadName(lead)} (${lead.postpone_until})`,
      why: lead.postpone_note || lead.notes || `CRM ${lead.stage || 'lead'} date is due.`,
      owner: 'merulox',
      urgency: 'today',
      source: 'crm-due',
      link: leadsPageExists ? `/leads?phone=${encodeURIComponent(lead.phone)}` : undefined,
    })),
    ...stale.map((lead): ActionItem => ({
      id: `stale-${lead.phone}`,
      title: `Revisit warm lead ${leadName(lead)}`,
      why: `Stage ${lead.stage}; last outbound ${lead.last_outbound_ts}.`,
      owner: 'merulox',
      urgency: 'week',
      source: 'crm-stale',
      link: leadsPageExists ? `/leads?phone=${encodeURIComponent(lead.phone)}` : undefined,
    })),
  ];
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

async function collectBriefs(): Promise<ActionItem[]> {
  const rows = (await readFile(BRIEFS, 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|'))
    .map(tableCells)
    .filter((cells) => cells.length >= 7 && /^[A-Z]+-\d+[a-z]?$/.test(cells[0]));
  const statuses = new Map(rows.map((cells) => [cells[0], cells[1].replaceAll('`', '')]));
  const actions: ActionItem[] = [];

  for (const cells of rows) {
    const [id, rawStatus, title, , , riskGate, rawDepends] = cells;
    const status = rawStatus.replaceAll('`', '');
    const depends = rawDepends.replaceAll('`', '');
    const dependencyDone = depends === '—' || depends === '' ||
      depends.split(/[,+]/).every((dependency) => statuses.get(dependency.trim()) === 'done');
    if (status === 'briefed' && dependencyDone) {
      actions.push({
        id: `launch-${id}`,
        title: `Launch executor: ${id}`,
        why: title,
        owner: 'executor',
        urgency: 'today',
        source: 'briefs',
        link: '/tasks',
      });
    }
    if (status === 'review') {
      actions.push({
        id: `verify-${id}`,
        title: `Verify ${id}`,
        why: title,
        owner: 'architect',
        urgency: 'today',
        source: 'briefs',
        link: '/tasks',
      });
    }
    if (status === 'briefed' && !dependencyDone && /\bPO\b/i.test(riskGate)) {
      actions.push({
        id: `po-gate-${id}`,
        title: `Resolve PO gate for ${id}`,
        why: `${riskGate}; depends on ${depends}.`,
        owner: 'merulox',
        urgency: 'today',
        source: 'briefs',
      });
    }
  }
  return actions;
}

async function collectGapAudit(): Promise<ActionItem[]> {
  return (await readFile(GAP_AUDIT, 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line.includes('🔲'))
    .map(tableCells)
    .filter((cells) => cells.length >= 4 && cells[2].replaceAll('*', '').trim().toLowerCase() === 'merulox')
    .map((cells): ActionItem => ({
      id: `gap-${cells[0]}`,
      title: cells[1],
      why: `Open gap-audit item #${cells[0]}.`,
      owner: 'merulox',
      urgency: 'week',
      source: 'gap-audit',
    }));
}

async function collectStandingChecks(): Promise<ActionItem[]> {
  const actions: ActionItem[] = [];
  const scripts = await execFileAsync('git', ['-C', join(HOME, 'scripts'), 'status', '--porcelain']);
  const changeCount = scripts.stdout.split(/\r?\n/).filter(Boolean).length;
  if (changeCount > 0) {
    actions.push({
      id: 'standing-scripts',
      title: `Commit ~/scripts (${changeCount} changes)`,
      why: 'Restored scripts and operations fixes remain uncommitted.',
      owner: 'merulox',
      urgency: 'today',
      source: 'standing-checks',
    });
  }

  try {
    const templates = await readFile(FOLLOWUP_TEMPLATES, 'utf8');
    const drafts = templates.match(/status:\s*DRAFT/g)?.length ?? 0;
    if (drafts > 0) {
      actions.push({
        id: 'standing-drafts',
        title: `Approve follow-up templates (${drafts} DRAFT)`,
        why: 'Draft follow-up copy cannot be activated until PO approval.',
        owner: 'merulox',
        urgency: 'today',
        source: 'standing-checks',
      });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const held: string[] = [];
  for (const timer of HELD_TIMERS) {
    try {
      const { stdout } = await execFileAsync('systemctl', ['--user', 'is-enabled', timer]);
      if (stdout.trim() !== 'enabled') held.push(`${timer}: ${stdout.trim() || 'held'}`);
    } catch (error) {
      const result = error as Error & { stdout?: string; stderr?: string };
      const status = result.stdout?.trim() || result.stderr?.trim();
      if (status && !status.includes('Failed to connect')) held.push(`${timer}: ${status}`);
      else if (status?.includes('Failed to connect')) throw error;
    }
  }
  if (held.length > 0) {
    actions.push({
      id: 'standing-senders',
      title: 'Sender timers awaiting go/no-go',
      why: held.join(' · '),
      owner: 'merulox',
      urgency: 'today',
      source: 'standing-checks',
    });
  }
  return actions;
}

async function collectActiveRule(): Promise<string> {
  const line = (await readFile(SIGNALS, 'utf8')).split(/\r?\n/).find((candidate) => candidate.startsWith('active_rule:'));
  return line?.slice('active_rule:'.length).trim() || 'No active rule set.';
}

export async function getNextActions(): Promise<NextActions> {
  const [crm, briefs, gapAudit, standing, activeRuleResult] = await Promise.all([
    safeCollector('crm', collectCrm),
    safeCollector('briefs', collectBriefs),
    safeCollector('gap-audit', collectGapAudit),
    safeCollector('standing-checks', collectStandingChecks),
    collectActiveRule().then(
      (activeRule) => ({ activeRule, warning: [] as ActionItem[] }),
      (error) => ({ activeRule: 'Active rule unavailable.', warning: [warning('signals', error instanceof Error ? error.message : String(error))] }),
    ),
  ]);
  const actions = [...crm, ...briefs, ...gapAudit, ...standing, ...activeRuleResult.warning].sort(
    (a, b) => ownerOrder[a.owner] - ownerOrder[b.owner] ||
      urgencyOrder[a.urgency] - urgencyOrder[b.urgency] ||
      (sourceOrder.get(a.source) ?? 99) - (sourceOrder.get(b.source) ?? 99) ||
      a.title.localeCompare(b.title),
  );
  return { activeRule: activeRuleResult.activeRule, actions, generatedAt: new Date().toISOString() };
}
