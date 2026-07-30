import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const HOME = process.env.HOME ?? '/home/merulox';
const CLIENTS_PATH = join(HOME, '.config/boreal/clients.json');

export interface BorealClient {
  name: string;
  owner: string;
  trade: string;
  city: string;
  business_type: string;
  notes: string;
}

export type ClientRegistry = Record<string, BorealClient>;

export function readClients(): ClientRegistry {
  try {
    return JSON.parse(readFileSync(CLIENTS_PATH, 'utf8')) as ClientRegistry;
  } catch {
    return {};
  }
}

export function writeClients(registry: ClientRegistry): void {
  mkdirSync(join(HOME, '.config/boreal'), { recursive: true });
  writeFileSync(CLIENTS_PATH, JSON.stringify(registry, null, 2));
}

export function addClient(phone: string, client: BorealClient): void {
  const registry = readClients();
  registry[phone] = client;
  writeClients(registry);
}

export function removeClient(phone: string): boolean {
  const registry = readClients();
  if (!(phone in registry)) return false;
  delete registry[phone];
  writeClients(registry);
  return true;
}

const BOREAL_SERVICES = [
  'missed-call-bot',
  'sms-inbox',
  'sms-webhook',
  'boreal-tunnel',
  'boreal-campaign',
  'boreal-followup',
];

export function getBorealServiceHealth(): { name: string; active: boolean }[] {
  return BOREAL_SERVICES.map((name) => {
    try {
      const out = execFileSync('systemctl', ['--user', 'is-active', name], {
        encoding: 'utf8',
        timeout: 2000,
      }).trim();
      return { name, active: out === 'active' };
    } catch {
      return { name, active: false };
    }
  });
}

// ── Hormozi resident ─────────────────────────────────────────────────────
// Promoted from facility to resident 2026-07-25. hormozi.py is still a
// shared library (missed-call-bot, reply-agent, close-agent import and call
// it, not a systemd unit of its own — `systemctl is-active` does not apply),
// but it now carries a persistent mandate and goals backed by real crm.db
// rows, satisfying the domain model's resident criteria (persistent
// identity, mandate, goals, memory, conversation semantics) honestly:
//   - mandate: MANDATE constant below, mirrors hormozi.MANDATE verbatim.
//   - goals/memory: learning_actions rows (actor='hormozi',
//     action_type='hypothesis_proposed'), the exact table/review mechanism
//     the Forge learning dashboard already uses — no new schema invented.
//   - conversation: getHormoziProposals()/reviewHormoziProposal() below —
//     approve/decline a pending hypothesis. Deliberately does NOT auto-launch
//     an experiment; that remains a separate, human-deliberate step per the
//     2026-07-21 sales-learning governance decision.
// NOT populated, and not fabricated to look complete: activeWorkerIds (no
// bounded execution/session model — Hormozi runs inline in the caller's
// process), homePlaceId/districtIds (no City place/district registry exists
// for any resident except Genesis yet).
//
// Health/activity is observed directly from source: the experiment ledger
// every hormozi-tagged generation writes to via
// boreal_send.send(prompt_version=, model_version=) → crm_lib.
// message_variants.prompt_version always starts with "hormozi-" (see
// hormozi.DOCTRINE_VERSION / MISSED_CALL_PROMPT_VERSION /
// CLOSE_FOLLOWUP_PROMPT_VERSION) — never duplicate those version strings
// here, read what was actually produced.

export const HORMOZI_RESIDENT_ID = 'resident:boreal:hormozi';
export const HORMOZI_MANDATE =
  'Own the creation of mutually qualified, trust-preserving conversations between Bor\u00e9al Num\u00e9rique ' +
  'and Quebec contractors. Keep every explicit promise, surface the correct human action at the correct ' +
  'time, and learn from attributable outcomes. Prefer no contact over irrelevant or trust-damaging contact. ' +
  'May inspect CRM state, rank work, prepare call briefs and reply drafts, create operator reminders, and ' +
  'propose review-gated experiments. Never sends a message, places a call, changes lead state, changes ' +
  'doctrine, or activates an experiment.';

const CRM_DB = join(HOME, 'projects', 'boreal-leads', 'crm.db');

export interface HormoziStatus {
  health: 'healthy' | 'idle' | 'unavailable';
  activeDoctrineVersions: string[];
  totalGenerated: number;
  generatedToday: number;
  lastGeneratedAt: string | null;
  error: string | null;
}

export function getHormoziStatus(): HormoziStatus {
  if (!existsSync(CRM_DB)) {
    return {
      health: 'unavailable', activeDoctrineVersions: [], totalGenerated: 0,
      generatedToday: 0, lastGeneratedAt: null, error: 'crm.db not found',
    };
  }
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(CRM_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');

    const totalRow = database
      .prepare(`SELECT COUNT(*) AS n, MAX(created_at) AS last FROM message_variants WHERE prompt_version LIKE 'hormozi-%'`)
      .get() as { n: number; last: string | null };

    const todayRow = database
      .prepare(`SELECT COUNT(*) AS n FROM message_variants WHERE prompt_version LIKE 'hormozi-%' AND created_at LIKE ?`)
      .get(`${new Date().toISOString().slice(0, 10)}%`) as { n: number };

    const versionRows = database
      .prepare(`SELECT DISTINCT prompt_version FROM message_variants WHERE prompt_version LIKE 'hormozi-%' ORDER BY prompt_version`)
      .all() as { prompt_version: string }[];

    const totalGenerated = totalRow?.n ?? 0;
    const generatedToday = todayRow?.n ?? 0;
    return {
      health: generatedToday > 0 ? 'healthy' : 'idle',
      activeDoctrineVersions: versionRows.map((r) => r.prompt_version),
      totalGenerated,
      generatedToday,
      lastGeneratedAt: totalRow?.last ?? null,
      error: null,
    };
  } catch (cause) {
    return {
      health: 'unavailable', activeDoctrineVersions: [], totalGenerated: 0,
      generatedToday: 0, lastGeneratedAt: null, error: String(cause),
    };
  } finally {
    database?.close();
  }
}

export interface HormoziProposal {
  id: number;
  actionKey: string;
  actionType: string;
  summary: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface HormoziActivity {
  id: number;
  actionType: string;
  summary: string;
  createdAt: string;
  reviewedAt: string | null;
}

/** Hormozi's persistent goals/memory — pending review = active goals awaiting
 * human decision; recent = the resident's visible activity log. Both read
 * directly from learning_actions (actor='hormozi'), the same table/review
 * mechanism the Forge learning dashboard already uses. */
export function getHormoziProposals(): { pending: HormoziProposal[]; recent: HormoziActivity[]; error: string | null } {
  if (!existsSync(CRM_DB)) {
    return { pending: [], recent: [], error: 'crm.db not found' };
  }
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(CRM_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');

    const pendingRows = database
      .prepare(`
        SELECT id, action_key, action_type, summary, detail_json, created_at
        FROM learning_actions
        WHERE actor = 'hormozi' AND action_type = 'hypothesis_proposed'
          AND requires_review = 1 AND reviewed_at IS NULL
        ORDER BY created_at DESC
      `)
      .all() as { id: number; action_key: string; action_type: string; summary: string; detail_json: string; created_at: string }[];

    const recentRows = database
      .prepare(`
        SELECT id, action_type, summary, created_at, reviewed_at
        FROM learning_actions
        WHERE actor IN ('hormozi', 'merulox') AND action_key LIKE 'hormozi:%'
        ORDER BY created_at DESC LIMIT 20
      `)
      .all() as { id: number; action_type: string; summary: string; created_at: string; reviewed_at: string | null }[];

    return {
      pending: pendingRows.map((r) => ({
        id: r.id, actionKey: r.action_key, actionType: r.action_type,
        summary: r.summary, detail: JSON.parse(r.detail_json || '{}'), createdAt: r.created_at,
      })),
      recent: recentRows.map((r) => ({
        id: r.id, actionType: r.action_type, summary: r.summary,
        createdAt: r.created_at, reviewedAt: r.reviewed_at,
      })),
      error: null,
    };
  } catch (cause) {
    return { pending: [], recent: [], error: String(cause) };
  } finally {
    database?.close();
  }
}

/** The resident's conversation loop: approve/decline a pending hypothesis.
 * Shells out to hormozi-review (mirrors reply_draft_send's shell-out to
 * reply-agent) so the write logic lives once, in crm_lib, not duplicated
 * here. Never launches an experiment — that stays a separate human step. */
interface ReviewResult {
  ok: boolean;
  error?: string;
}

function parseReviewResult(text: string): ReviewResult {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('ok' in parsed)) {
    return { ok: false, error: 'unexpected hormozi-review output' };
  }
  const ok = parsed.ok === true;
  if ('error' in parsed && typeof parsed.error === 'string') {
    return { ok, error: parsed.error };
  }
  return { ok };
}

function hasStdout(value: unknown): value is { stdout: string | Buffer } {
  return typeof value === 'object' && value !== null && 'stdout' in value;
}

export function reviewHormoziProposal(actionId: number, decision: 'approved' | 'declined', note = ''): ReviewResult {
  try {
    const args = [
      join(HOME, 'scripts', 'hormozi-review'),
      '--action-id', String(actionId),
      '--decision', decision,
    ];
    if (note) args.push('--note', note);
    const out = execFileSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 10000 });
    return parseReviewResult(out.trim());
  } catch (cause: unknown) {
    const stdout = hasStdout(cause) ? String(cause.stdout).trim() : '';
    if (stdout) {
      try {
        return parseReviewResult(stdout);
      } catch {
        // fall through to generic error below
      }
    }
    return { ok: false, error: String(cause) };
  }
}


// ── Hormozi bounded operating cycle ─────────────────────────────────────

export interface HormoziCycleConfig {
  enabled: boolean;
  intervalHours: number;
  maxActionsPerRun: number;
  lastRunAt: string | null;
  lastRunSummary: string;
}

export interface HormoziOperatorAction {
  id: number;
  leadPhone: string | null;
  leadName: string;
  sourceKind: string;
  actionType: string;
  priority: number;
  summary: string;
  rationale: string;
  evidence: Record<string, unknown>;
  brief: Record<string, unknown>;
  decisionSource: string;
  dueAt: string | null;
  createdAt: string;
}

export interface HormoziCycleState {
  config: HormoziCycleConfig | null;
  actions: HormoziOperatorAction[];
  error: string | null;
}

const HORMOZI_CYCLE_DEFAULTS: HormoziCycleConfig = {
  enabled: false,
  intervalHours: 4,
  maxActionsPerRun: 3,
  lastRunAt: null,
  lastRunSummary: '',
};

export function getHormoziCycleState(): HormoziCycleState {
  if (!existsSync(CRM_DB)) {
    return { config: null, actions: [], error: 'crm.db not found' };
  }
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(CRM_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');
    const configRow = database
      .prepare(`
        SELECT enabled, interval_hours, max_actions_per_run,
               last_run_at, last_run_summary
        FROM hormozi_cycle_config WHERE id=1
      `)
      .get() as {
        enabled: number;
        interval_hours: number;
        max_actions_per_run: number;
        last_run_at: string | null;
        last_run_summary: string;
      } | undefined;
    const actionRows = database
      .prepare(`
        SELECT id, lead_phone, lead_name, source_kind, action_type, priority,
               summary, rationale, evidence_json, brief_json, decision_source,
               due_at, created_at
        FROM hormozi_actions
        WHERE status='open'
        ORDER BY priority DESC, COALESCE(due_at, created_at), id
        LIMIT 25
      `)
      .all() as {
        id: number;
        lead_phone: string | null;
        lead_name: string;
        source_kind: string;
        action_type: string;
        priority: number;
        summary: string;
        rationale: string;
        evidence_json: string;
        brief_json: string;
        decision_source: string;
        due_at: string | null;
        created_at: string;
      }[];
    return {
      config: configRow ? {
        enabled: configRow.enabled === 1,
        intervalHours: configRow.interval_hours,
        maxActionsPerRun: configRow.max_actions_per_run,
        lastRunAt: configRow.last_run_at,
        lastRunSummary: configRow.last_run_summary,
      } : HORMOZI_CYCLE_DEFAULTS,
      actions: actionRows.map((row) => ({
        id: row.id,
        leadPhone: row.lead_phone,
        leadName: row.lead_name,
        sourceKind: row.source_kind,
        actionType: row.action_type,
        priority: row.priority,
        summary: row.summary,
        rationale: row.rationale,
        evidence: JSON.parse(row.evidence_json || '{}') as Record<string, unknown>,
        brief: JSON.parse(row.brief_json || '{}') as Record<string, unknown>,
        decisionSource: row.decision_source,
        dueAt: row.due_at,
        createdAt: row.created_at,
      })),
      error: null,
    };
  } catch (cause) {
    const detail = String(cause);
    if (/no such table:\s*hormozi_(?:cycle_config|actions)/i.test(detail)) {
      return { config: HORMOZI_CYCLE_DEFAULTS, actions: [], error: null };
    }
    return { config: null, actions: [], error: detail };
  } finally {
    database?.close();
  }
}

interface HormoziCycleResult {
  ok: boolean;
  ran?: boolean;
  reason?: string;
  summary?: string;
  error?: string;
  action_id?: number;
  status?: string;
}

function parseHormoziCycleResult(text: string): HormoziCycleResult {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('ok' in parsed)) {
    return { ok: false, error: 'unexpected hormozi-cycle output' };
  }
  return parsed as HormoziCycleResult;
}

async function runHormoziCycleCLI(args: string[], timeoutMs: number): Promise<HormoziCycleResult> {
  const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      join(HOME, 'scripts', 'hormozi-cycle'),
      args,
      { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1_048_576 },
      (error, stdout, stderr) => (
        error ? reject(Object.assign(error, { stdout, stderr })) : resolve({ stdout, stderr })
      ),
    );
  }).catch((cause: unknown) => {
    const stdout = hasStdout(cause) ? String(cause.stdout).trim() : '';
    if (stdout) return { stdout, stderr: '' };
    throw cause;
  });
  try {
    return parseHormoziCycleResult(result.stdout.trim());
  } catch {
    return {
      ok: false,
      error: String(result.stderr || result.stdout || 'hormozi-cycle produced no output'),
    };
  }
}

export async function setHormoziCycleConfig(input: {
  enabled?: boolean;
  intervalHours?: number;
  maxActionsPerRun?: number;
}): Promise<HormoziCycleResult> {
  const args: string[] = [];
  if (input.enabled === true) args.push('--enable');
  if (input.enabled === false) args.push('--disable');
  if (input.intervalHours !== undefined) {
    args.push('--interval-hours', String(Math.trunc(input.intervalHours)));
  }
  if (input.maxActionsPerRun !== undefined) {
    args.push('--max-actions', String(Math.trunc(input.maxActionsPerRun)));
  }
  if (args.length === 0) return { ok: false, error: 'no config fields provided' };
  return runHormoziCycleCLI(args, 10_000);
}

export async function runHormoziCycleNow(): Promise<HormoziCycleResult> {
  return runHormoziCycleCLI(['--force'], 90_000);
}

export async function resolveHormoziOperatorAction(
  actionId: number,
  status: 'done' | 'dismissed',
): Promise<HormoziCycleResult> {
  return runHormoziCycleCLI(
    ['--resolve', String(actionId), '--resolution', status],
    10_000,
  );
}

// ── Ogilvy resident ──────────────────────────────────────────────────────
// Money-optimized content resident, 2026-07-25 — the sibling of the
// Hormozi resident, same governance pattern: mandate constant, goals via
// learning_actions (actor='ogilvy'), conversation via approve/decline.
// Ogilvy owns top-of-funnel content (Facebook/Instagram) feeding leads
// into the funnel Hormozi's reactive engine closes. Never publishes
// directly — approval shells out to ogilvy-review, which appends the post
// to 04-content-batch.md in the format content-push/fb-post already
// deliver. Ogilvy is a strategy/memory layer around that existing
// publisher, not a second one.

export const OGILVY_RESIDENT_ID = 'resident:boreal:ogilvy';
export const OGILVY_MANDATE =
  'Own money-optimized content generation and attribution learning for Bor\u00e9al Num\u00e9rique\u2019s ' +
  'Facebook/Instagram acquisition content \u2014 the top-of-funnel layer feeding leads into the funnel ' +
  'Hormozi\u2019s reactive engine closes. Propose new post angles grounded in the proven 26-post voice ' +
  'and in observed gaps; never publish directly \u2014 a human reviews and decides. Known limitation: ' +
  'leads.source has zero Facebook-attributed values despite 26 published posts \u2014 attribution is ' +
  'directional (a ?src= campaign code per post), not yet closed-loop measured.';

export interface OgilvyStatus {
  health: 'healthy' | 'idle' | 'unavailable';
  activeDoctrineVersions: string[];
  totalGenerated: number;
  generatedToday: number;
  lastGeneratedAt: string | null;
  error: string | null;
}

export function getOgilvyStatus(): OgilvyStatus {
  if (!existsSync(CRM_DB)) {
    return {
      health: 'unavailable', activeDoctrineVersions: [], totalGenerated: 0,
      generatedToday: 0, lastGeneratedAt: null, error: 'crm.db not found',
    };
  }
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(CRM_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');

    const totalRow = database
      .prepare(`SELECT COUNT(*) AS n, MAX(created_at) AS last FROM message_variants WHERE prompt_version LIKE 'ogilvy-%'`)
      .get() as { n: number; last: string | null };

    const todayRow = database
      .prepare(`SELECT COUNT(*) AS n FROM message_variants WHERE prompt_version LIKE 'ogilvy-%' AND created_at LIKE ?`)
      .get(`${new Date().toISOString().slice(0, 10)}%`) as { n: number };

    const versionRows = database
      .prepare(`SELECT DISTINCT prompt_version FROM message_variants WHERE prompt_version LIKE 'ogilvy-%' ORDER BY prompt_version`)
      .all() as { prompt_version: string }[];

    const totalGenerated = totalRow?.n ?? 0;
    const generatedToday = todayRow?.n ?? 0;
    return {
      health: generatedToday > 0 ? 'healthy' : 'idle',
      activeDoctrineVersions: versionRows.map((r) => r.prompt_version),
      totalGenerated,
      generatedToday,
      lastGeneratedAt: totalRow?.last ?? null,
      error: null,
    };
  } catch (cause) {
    return {
      health: 'unavailable', activeDoctrineVersions: [], totalGenerated: 0,
      generatedToday: 0, lastGeneratedAt: null, error: String(cause),
    };
  } finally {
    database?.close();
  }
}

export interface OgilvyProposal {
  id: number;
  actionKey: string;
  actionType: string;
  summary: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface OgilvyActivity {
  id: number;
  actionType: string;
  summary: string;
  createdAt: string;
  reviewedAt: string | null;
}

export function getOgilvyProposals(): { pending: OgilvyProposal[]; recent: OgilvyActivity[]; error: string | null } {
  if (!existsSync(CRM_DB)) {
    return { pending: [], recent: [], error: 'crm.db not found' };
  }
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(CRM_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');

    const pendingRows = database
      .prepare(`
        SELECT id, action_key, action_type, summary, detail_json, created_at
        FROM learning_actions
        WHERE actor = 'ogilvy' AND action_type = 'content_proposed'
          AND requires_review = 1 AND reviewed_at IS NULL
        ORDER BY created_at DESC
      `)
      .all() as { id: number; action_key: string; action_type: string; summary: string; detail_json: string; created_at: string }[];

    const recentRows = database
      .prepare(`
        SELECT id, action_type, summary, created_at, reviewed_at
        FROM learning_actions
        WHERE actor IN ('ogilvy', 'merulox') AND action_key LIKE 'ogilvy:%'
        ORDER BY created_at DESC LIMIT 20
      `)
      .all() as { id: number; action_type: string; summary: string; created_at: string; reviewed_at: string | null }[];

    return {
      pending: pendingRows.map((r) => ({
        id: r.id, actionKey: r.action_key, actionType: r.action_type,
        summary: r.summary, detail: JSON.parse(r.detail_json || '{}'), createdAt: r.created_at,
      })),
      recent: recentRows.map((r) => ({
        id: r.id, actionType: r.action_type, summary: r.summary,
        createdAt: r.created_at, reviewedAt: r.reviewed_at,
      })),
      error: null,
    };
  } catch (cause) {
    return { pending: [], recent: [], error: String(cause) };
  } finally {
    database?.close();
  }
}

export function reviewOgilvyProposal(actionId: number, decision: 'approved' | 'declined', note = ''): ReviewResult {
  try {
    const args = [
      join(HOME, 'scripts', 'ogilvy-review'),
      '--action-id', String(actionId),
      '--decision', decision,
    ];
    if (note) args.push('--note', note);
    const out = execFileSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 10000 });
    return parseReviewResult(out.trim());
  } catch (cause: unknown) {
    const stdout = hasStdout(cause) ? String(cause.stdout).trim() : '';
    if (stdout) {
      try {
        return parseReviewResult(stdout);
      } catch {
        // fall through to generic error below
      }
    }
    return { ok: false, error: String(cause) };
  }
}

// ── Resident chat (Hormozi + Ogilvy) ─────────────────────────────────────
// Genuine synchronous LLM turn — the resident speaking as itself about its
// mandate/pending proposals, never a lead-facing SMS or post — shelled out
// to boreal-chat so the model call, history persistence, and status-context
// construction live once, in Python, not duplicated here. Async (execFile,
// not execFileSync): a live model call can take 10-40s and must not block
// Astro's Node event loop. Shared across both residents since they share
// crm.db and the same boreal-chat script (resident-discriminated).

export interface BorealChatMessage {
  id: number;
  role: 'operator' | 'resident';
  body: string;
  createdAt: string;
}

export function getBorealChatHistory(resident: 'hormozi' | 'ogilvy'): { history: BorealChatMessage[]; error: string | null } {
  if (!existsSync(CRM_DB)) return { history: [], error: 'crm.db not found' };
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(CRM_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');
    const rows = database
      .prepare('SELECT id, role, body, created_at FROM resident_chat_messages WHERE resident = ? ORDER BY id DESC LIMIT 50')
      .all(resident) as { id: number; role: string; body: string; created_at: string }[];
    return {
      history: rows.reverse().map((r) => ({
        id: r.id, role: r.role === 'resident' ? 'resident' : 'operator', body: r.body, createdAt: r.created_at,
      })),
      error: null,
    };
  } catch (cause) {
    // The table is created lazily by the first write (boreal-chat's
    // get_db() migration) — a genuinely empty history before any message
    // has ever been sent is not an error, never surface it as one.
    const detail = String(cause);
    if (/no such table:\s*resident_chat_messages/i.test(detail)) return { history: [], error: null };
    return { history: [], error: detail };
  } finally {
    database?.close();
  }
}

interface ChatResult {
  ok: boolean;
  response?: string;
  error?: string;
}

function parseChatResult(text: string): ChatResult {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('ok' in parsed)) {
    return { ok: false, error: 'unexpected boreal-chat output' };
  }
  const ok = parsed.ok === true;
  const response = 'response' in parsed && typeof parsed.response === 'string' ? parsed.response : undefined;
  const error = 'error' in parsed && typeof parsed.error === 'string' ? parsed.error : undefined;
  return { ok, response, error };
}

export async function sendBorealChatMessage(resident: 'hormozi' | 'ogilvy', text: string): Promise<ChatResult> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'text is required' };
  const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      join(HOME, 'scripts', 'boreal-chat'),
      ['--resident', resident, '--text', trimmed],
      { timeout: 45_000, maxBuffer: 1_048_576 },
      (error, stdout, stderr) => (error ? reject(Object.assign(error, { stdout, stderr })) : resolve({ stdout, stderr })),
    );
  }).catch((cause: unknown) => {
    const stdout = hasStdout(cause) ? String(cause.stdout).trim() : '';
    if (stdout) return { stdout, stderr: '' };
    throw cause;
  });
  try {
    return parseChatResult(result.stdout.trim());
  } catch {
    return { ok: false, error: String(result.stderr || result.stdout || 'boreal-chat produced no output') };
  }
}
