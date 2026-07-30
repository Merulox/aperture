import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const HOME = process.env.HOME ?? '/home/merulox';

// -- Signaler resident ------------------------------------------------------
// Standalone passive-income content agent, 2026-07-26 — explicitly NOT a
// Boréal resident. Own SQLite DB (signaler.db), own account registry, own
// review queue; reuses the mandate -> doctrine -> propose -> human-review
// gate pattern Hormozi/Ogilvy already proved out, never their crm.db.
// See ~/projects/signaler/CONTEXT.md for the full mandate.

const SIGNALER_DB = join(HOME, 'projects', 'signaler', 'signaler.db');
const SECRETS_DIR = join(HOME, '.secrets');

// v1 platforms only (real APIs exist today, per SETUP.md) — YouTube/TikTok
// are deliberately EXCLUDED here. They're staged/deferred (blocked on the
// unbuilt video pipeline, TikTok additionally on business verification),
// not a v1 setup gap; flagging them as "needs attention" would just teach
// the operator to ignore a permanently-red indicator.
const V1_PLATFORM_SECRETS: { platform: string; secrets: string[] }[] = [
  { platform: 'x', secrets: ['signaler-x-api-key.txt', 'signaler-x-api-secret.txt', 'signaler-x-access-token.txt', 'signaler-x-access-secret.txt'] },
  { platform: 'reddit', secrets: ['signaler-reddit-client-id.txt', 'signaler-reddit-client-secret.txt', 'signaler-reddit-username.txt', 'signaler-reddit-password.txt'] },
  { platform: 'threads', secrets: ['signaler-threads-user-id.txt', 'signaler-threads-access-token.txt'] },
  { platform: 'instagram', secrets: ['signaler-instagram-account-id.txt', 'signaler-instagram-access-token.txt'] },
];
const TYPEFULLY_SECRETS = ['typefully-signaltomind-api-key.txt', 'typefully-signaltomind-social-set-id.txt'];


export interface CredentialGap {
  platform: string;
  missingSecrets: string[];
}

interface AccountPublishingTarget {
  platform: string;
  publishingProvider: string;
}

/** Which credentials are missing for platforms that have a real account.
 * Direct accounts use their platform adapter's secrets; Typefully accounts
 * use one shared API key + social-set ID. Platforms with no account are not
 * setup gaps — they are simply outside the current roadmap. */
export function getSignalerCredentialGaps(targets: AccountPublishingTarget[] = []): CredentialGap[] {
  const isPresent = (name: string): boolean => {
    const path = join(SECRETS_DIR, name);
    if (!existsSync(path)) return false;
    try {
      return readFileSync(path, 'utf8').trim().length > 0;
    } catch {
      return false;
    }
  };
  const requirements = new Map<string, string[]>();
  for (const target of targets) {
    if (target.publishingProvider === 'typefully') {
      requirements.set('typefully', TYPEFULLY_SECRETS);
      continue;
    }
    const direct = V1_PLATFORM_SECRETS.find(({ platform }) => platform === target.platform);
    if (direct) requirements.set(direct.platform, direct.secrets);
  }
  return [...requirements.entries()]
    .map(([platform, secrets]) => ({
      platform,
      missingSecrets: secrets.filter((name) => !isPresent(name)),
    }))
    .filter((gap) => gap.missingSecrets.length > 0);
}

export const SIGNALER_MANDATE =
  "Research trending content and candidate niches, generate cross-platform " +
  'content, and (once real accounts/credentials exist) post it — a fully ' +
  "separate passive-income pipeline from Bor\u00e9al's Hormozi/Ogilvy. Niches " +
  "are grounded in the operator's own genuine interests plus live trend " +
  'research, never faked authority. Never posts directly: every generated ' +
  'post is an immutable content_proposals row; a human approves or declines, ' +
  'and a separate, human-triggered publish step performs the actual platform ' +
  'call. Monetization is affiliate-first.';

export interface SignalerRoadmapItem {
  id: number;
  accountId: number;
  accountHandle: string;
  itemKey: string;
  kind: 'milestone' | 'po_task';
  title: string;
  detail: string;
  owner: 'signaler' | 'merulox';
  status: 'planned' | 'in_progress' | 'blocked' | 'done';
  blocker: string;
  sortOrder: number;
  completedAt: string | null;
}

export interface SignalerStatus {
  health: 'healthy' | 'idle' | 'unavailable';
  nicheCount: number;
  accountCount: number;
  totalGenerated: number;
  generatedToday: number;
  pendingCount: number;
  lastGeneratedAt: string | null;
  credentialGaps: CredentialGap[];
  roadmap: SignalerRoadmapItem[];
  error: string | null;
}

export function getSignalerStatus(): SignalerStatus {
  let credentialGaps: CredentialGap[] = [];
  if (!existsSync(SIGNALER_DB)) {
    return {
      health: 'unavailable', nicheCount: 0, accountCount: 0, totalGenerated: 0,
      generatedToday: 0, pendingCount: 0, lastGeneratedAt: null, credentialGaps,
      roadmap: [], error: 'signaler.db not found',
    };
  }
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(SIGNALER_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');

    const targets = database
      .prepare('SELECT platform, publishing_provider FROM accounts ORDER BY id')
      .all() as { platform: string; publishing_provider: string }[];
    credentialGaps = getSignalerCredentialGaps(targets.map((target) => ({
      platform: target.platform,
      publishingProvider: target.publishing_provider,
    })));
    const nicheRow = database.prepare('SELECT COUNT(*) AS n FROM niches').get() as { n: number };
    const accountRow = database.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number };
    const totalRow = database
      .prepare('SELECT COUNT(*) AS n, MAX(created_at) AS last FROM content_proposals')
      .get() as { n: number; last: string | null };
    const todayRow = database
      .prepare('SELECT COUNT(*) AS n FROM content_proposals WHERE created_at LIKE ?')
      .get(`${new Date().toISOString().slice(0, 10)}%`) as { n: number };
    const pendingRow = database
      .prepare('SELECT COUNT(*) AS n FROM content_proposals WHERE requires_review = 1 AND reviewed_at IS NULL')
      .get() as { n: number };
    const roadmapRows = database
      .prepare(`
        SELECT ri.id, ri.account_id, a.handle AS account_handle, ri.item_key, ri.kind,
               ri.title, ri.detail, ri.owner, ri.status, ri.blocker, ri.sort_order,
               ri.completed_at
        FROM roadmap_items ri
        JOIN accounts a ON a.id = ri.account_id
        ORDER BY ri.sort_order, ri.id
      `)
      .all() as {
        id: number; account_id: number; account_handle: string; item_key: string;
        kind: 'milestone' | 'po_task'; title: string; detail: string;
        owner: 'signaler' | 'merulox'; status: 'planned' | 'in_progress' | 'blocked' | 'done';
        blocker: string; sort_order: number; completed_at: string | null;
      }[];

    const generatedToday = todayRow?.n ?? 0;
    return {
      health: generatedToday > 0 ? 'healthy' : 'idle',
      nicheCount: nicheRow?.n ?? 0,
      accountCount: accountRow?.n ?? 0,
      totalGenerated: totalRow?.n ?? 0,
      generatedToday,
      pendingCount: pendingRow?.n ?? 0,
      lastGeneratedAt: totalRow?.last ?? null,
      credentialGaps,
      roadmap: roadmapRows.map((row) => ({
        id: row.id,
        accountId: row.account_id,
        accountHandle: row.account_handle,
        itemKey: row.item_key,
        kind: row.kind,
        title: row.title,
        detail: row.detail,
        owner: row.owner,
        status: row.status,
        blocker: row.blocker,
        sortOrder: row.sort_order,
        completedAt: row.completed_at,
      })),
      error: null,
    };
  } catch (cause) {
    return {
      health: 'unavailable', nicheCount: 0, accountCount: 0, totalGenerated: 0,
      generatedToday: 0, pendingCount: 0, lastGeneratedAt: null, credentialGaps,
      roadmap: [], error: String(cause),
    };
  } finally {
    database?.close();
  }
}

export interface SignalerProposal {
  id: number;
  actionKey: string;
  platform: string;
  format: string;
  angle: string;
  copyText: string;
  niche: string | null;
  createdAt: string;
}

export interface SignalerActivity {
  id: number;
  decision: string;
  note: string;
  platform: string;
  angle: string;
  decidedAt: string;
}

export function getSignalerProposals(): { pending: SignalerProposal[]; recent: SignalerActivity[]; error: string | null } {
  if (!existsSync(SIGNALER_DB)) {
    return { pending: [], recent: [], error: 'signaler.db not found' };
  }
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(SIGNALER_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');

    const pendingRows = database
      .prepare(`
        SELECT cp.id, cp.action_key, cp.platform, cp.format, cp.angle, cp.copy_text, cp.created_at, n.name AS niche_name
        FROM content_proposals cp
        LEFT JOIN niches n ON n.id = cp.niche_id
        WHERE cp.requires_review = 1 AND cp.reviewed_at IS NULL
        ORDER BY cp.created_at DESC
      `)
      .all() as { id: number; action_key: string; platform: string; format: string; angle: string; copy_text: string; created_at: string; niche_name: string | null }[];

    const recentRows = database
      .prepare(`
        SELECT cp.id, rd.decision, rd.note, cp.platform, cp.angle, rd.decided_at
        FROM review_decisions rd JOIN content_proposals cp ON cp.id = rd.proposal_id
        ORDER BY rd.id DESC LIMIT 20
      `)
      .all() as { id: number; decision: string; note: string; platform: string; angle: string; decided_at: string }[];

    return {
      pending: pendingRows.map((r) => ({
        id: r.id, actionKey: r.action_key, platform: r.platform, format: r.format,
        angle: r.angle, copyText: r.copy_text, niche: r.niche_name, createdAt: r.created_at,
      })),
      recent: recentRows.map((r) => ({
        id: r.id, decision: r.decision, note: r.note, platform: r.platform,
        angle: r.angle, decidedAt: r.decided_at,
      })),
      error: null,
    };
  } catch (cause) {
    return { pending: [], recent: [], error: String(cause) };
  } finally {
    database?.close();
  }
}

/** The resident's conversation loop: approve/decline a pending content
 * proposal. Shells out to signaler-review so the write logic (atomic
 * reviewed_at guard + append-only review_decisions row) lives once, in
 * signaler_lib.py, not duplicated here. Never publishes — that stays a
 * separate, human-triggered signaler-publish step. */
interface ReviewResult {
  ok: boolean;
  error?: string;
}

function parseReviewResult(text: string): ReviewResult {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('ok' in parsed)) {
    return { ok: false, error: 'unexpected signaler-review output' };
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

export function reviewSignalerProposal(actionId: number, decision: 'approved' | 'declined', note = ''): ReviewResult {
  try {
    const args = [
      join(HOME, 'scripts', 'signaler-review'),
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

/** The resident's live chat: a genuine synchronous LLM turn (Signaler
 * speaking as itself about its mandate/niches/proposals — never a lead-
 * facing post), shelled out to signaler-chat so the model call, history
 * persistence, and status-context construction live once, in Python, not
 * duplicated here. Async (execFile, not execFileSync) — a live model call
 * can take 10-40s and must not block Astro's Node event loop. */
export interface SignalerChatMessage {
  id: number;
  role: 'operator' | 'resident';
  body: string;
  createdAt: string;
}

export function getSignalerChatHistory(): { history: SignalerChatMessage[]; error: string | null } {
  if (!existsSync(SIGNALER_DB)) return { history: [], error: 'signaler.db not found' };
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(SIGNALER_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');
    const rows = database
      .prepare('SELECT id, role, body, created_at FROM chat_messages ORDER BY id DESC LIMIT 50')
      .all() as { id: number; role: string; body: string; created_at: string }[];
    return {
      history: rows.reverse().map((r) => ({
        id: r.id, role: r.role === 'resident' ? 'resident' : 'operator', body: r.body, createdAt: r.created_at,
      })),
      error: null,
    };
  } catch (cause) {
    // The table is created lazily by the first write (signaler-chat's
    // get_db() migration) — a genuinely empty history before any message
    // has ever been sent is not an error, never surface it as one.
    const detail = String(cause);
    if (/no such table:\s*chat_messages/i.test(detail)) return { history: [], error: null };
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
    return { ok: false, error: 'unexpected signaler-chat output' };
  }
  const ok = parsed.ok === true;
  const response = 'response' in parsed && typeof parsed.response === 'string' ? parsed.response : undefined;
  const error = 'error' in parsed && typeof parsed.error === 'string' ? parsed.error : undefined;
  return { ok, response, error };
}

export async function sendSignalerChatMessage(text: string): Promise<ChatResult> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'text is required' };
  const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      join(HOME, 'scripts', 'signaler-chat'),
      ['--text', trimmed],
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
    return { ok: false, error: String(result.stderr || result.stdout || 'signaler-chat produced no output') };
  }
}

// ── Scheduled pipeline config (City-UI-configurable) ─────────────────────
// signaler-cycle.timer polls every 15 min; pipeline_config (this section)
// is the real schedule the operator controls. Read via direct SQLite for
// GET (cheap, no subprocess); writes/run-now shell out to signaler-cycle
// so the validation and due-ness logic live once, in Python.

export interface SignalerPipelineConfig {
  enabled: boolean;
  intervalHours: number;
  maxProposalsPerRun: number;
  lastRunAt: string | null;
  lastRunSummary: string;
}

export function getSignalerPipelineConfig(): { config: SignalerPipelineConfig | null; error: string | null } {
  if (!existsSync(SIGNALER_DB)) return { config: null, error: 'signaler.db not found' };
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(SIGNALER_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');
    const row = database
      .prepare('SELECT enabled, interval_hours, max_proposals_per_run, last_run_at, last_run_summary FROM pipeline_config WHERE id = 1')
      .get() as { enabled: number; interval_hours: number; max_proposals_per_run: number; last_run_at: string | null; last_run_summary: string } | undefined;
    if (!row) {
      // Never run yet — the Python side seeds this row lazily on first
      // read/write. Report the same defaults the schema declares rather
      // than a spurious error.
      return { config: { enabled: false, intervalHours: 24, maxProposalsPerRun: 3, lastRunAt: null, lastRunSummary: '' }, error: null };
    }
    return {
      config: {
        enabled: row.enabled === 1,
        intervalHours: row.interval_hours,
        maxProposalsPerRun: row.max_proposals_per_run,
        lastRunAt: row.last_run_at,
        lastRunSummary: row.last_run_summary,
      },
      error: null,
    };
  } catch (cause) {
    const detail = String(cause);
    // The table is created lazily by the first write (signaler-cycle's
    // get_db() migration) — report the same schema defaults rather than
    // a spurious error before the pipeline has ever been touched.
    if (/no such table:\s*pipeline_config/i.test(detail)) {
      return { config: { enabled: false, intervalHours: 24, maxProposalsPerRun: 3, lastRunAt: null, lastRunSummary: '' }, error: null };
    }
    return { config: null, error: detail };
  } finally {
    database?.close();
  }
}

interface CycleResult {
  ok: boolean;
  ran?: boolean;
  reason?: string;
  summary?: string;
  config?: unknown;
  error?: string;
}

function parseCycleResult(text: string): CycleResult {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('ok' in parsed)) {
    return { ok: false, error: 'unexpected signaler-cycle output' };
  }
  return parsed as CycleResult;
}

async function runSignalerCycleCLI(args: string[], timeoutMs: number): Promise<CycleResult> {
  const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      join(HOME, 'scripts', 'signaler-cycle'),
      args,
      { timeout: timeoutMs, maxBuffer: 1_048_576 },
      (error, stdout, stderr) => (error ? reject(Object.assign(error, { stdout, stderr })) : resolve({ stdout, stderr })),
    );
  }).catch((cause: unknown) => {
    const stdout = hasStdout(cause) ? String(cause.stdout).trim() : '';
    if (stdout) return { stdout, stderr: '' };
    throw cause;
  });
  try {
    return parseCycleResult(result.stdout.trim());
  } catch {
    return { ok: false, error: String(result.stderr || result.stdout || 'signaler-cycle produced no output') };
  }
}

export async function setSignalerPipelineConfig(input: {
  enabled?: boolean;
  intervalHours?: number;
  maxProposalsPerRun?: number;
}): Promise<CycleResult> {
  const args: string[] = [];
  if (input.enabled === true) args.push('--enable');
  if (input.enabled === false) args.push('--disable');
  if (input.intervalHours !== undefined) args.push('--set', `interval_hours=${Math.trunc(input.intervalHours)}`);
  if (input.maxProposalsPerRun !== undefined) args.push('--set', `max_proposals_per_run=${Math.trunc(input.maxProposalsPerRun)}`);
  if (args.length === 0) return { ok: false, error: 'no config fields provided' };
  return runSignalerCycleCLI(args, 10_000);
}

/** Force a cycle now, bypassing the due-ness check — still respects
 * `enabled` (signaler-cycle refuses to run at all while disabled, even
 * with --force). Longer timeout: up to `max_proposals_per_run` real
 * Anthropic calls can run sequentially. */
export async function runSignalerCycleNow(): Promise<CycleResult> {
  return runSignalerCycleCLI(['--force'], 90_000);
}

// ── Account ideas (pre-decision planning checklist) ──────────────────────
// Replaces chat as the place candidate handles/bios live: chat is
// ephemeral prose that can't be checked off and can't produce a real
// account; this is the structured lifecycle between "brainstorm" and
// "committed account" — idea (candidates + draft bio) -> decided (one
// handle chosen) -> created (promoted to a real accounts row once the
// operator has actually signed up). All writes shell out to
// signaler-account-ideas so signaler_lib.py owns the mutation logic,
// same discipline as every other write path here.

export interface SignalerNiche {
  id: number;
  name: string;
  status: string;
}

export function getSignalerNiches(): { niches: SignalerNiche[]; error: string | null } {
  if (!existsSync(SIGNALER_DB)) return { niches: [], error: 'signaler.db not found' };
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(SIGNALER_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');
    const rows = database.prepare('SELECT id, name, status FROM niches ORDER BY id').all() as SignalerNiche[];
    return { niches: rows, error: null };
  } catch (cause) {
    return { niches: [], error: String(cause) };
  } finally {
    database?.close();
  }
}

export interface SignalerAccountIdea {
  id: number;
  nicheId: number | null;
  nicheName: string | null;
  platform: string;
  candidateHandles: string[];
  draftBio: string;
  notes: string;
  status: 'idea' | 'decided' | 'created';
  decidedHandle: string | null;
  accountId: number | null;
  createdAt: string;
}

export function getSignalerAccountIdeas(): { ideas: SignalerAccountIdea[]; error: string | null } {
  if (!existsSync(SIGNALER_DB)) return { ideas: [], error: 'signaler.db not found' };
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(SIGNALER_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');
    const rows = database
      .prepare(`
        SELECT ai.id, ai.niche_id, n.name AS niche_name, ai.platform, ai.candidate_handles_json,
               ai.draft_bio, ai.notes, ai.status, ai.decided_handle, ai.account_id, ai.created_at
        FROM account_ideas ai
        LEFT JOIN niches n ON n.id = ai.niche_id
        ORDER BY ai.id
      `)
      .all() as {
        id: number; niche_id: number | null; niche_name: string | null; platform: string;
        candidate_handles_json: string; draft_bio: string; notes: string; status: string;
        decided_handle: string | null; account_id: number | null; created_at: string;
      }[];
    return {
      ideas: rows.map((r) => ({
        id: r.id, nicheId: r.niche_id, nicheName: r.niche_name, platform: r.platform,
        candidateHandles: JSON.parse(r.candidate_handles_json || '[]') as string[],
        draftBio: r.draft_bio, notes: r.notes,
        status: r.status as 'idea' | 'decided' | 'created',
        decidedHandle: r.decided_handle, accountId: r.account_id, createdAt: r.created_at,
      })),
      error: null,
    };
  } catch (cause) {
    const detail = String(cause);
    if (/no such table:\s*account_ideas/i.test(detail)) return { ideas: [], error: null };
    return { ideas: [], error: detail };
  } finally {
    database?.close();
  }
}

interface AccountIdeaResult {
  ok: boolean;
  idea_id?: number;
  account_id?: number;
  error?: string;
}

function parseAccountIdeaResult(text: string): AccountIdeaResult {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('ok' in parsed)) {
    return { ok: false, error: 'unexpected signaler-account-ideas output' };
  }
  return parsed as AccountIdeaResult;
}

function runAccountIdeasCLI(args: string[]): AccountIdeaResult {
  try {
    const out = execFileSync(join(HOME, 'scripts', 'signaler-account-ideas'), args, { encoding: 'utf8', timeout: 10_000 });
    return parseAccountIdeaResult(out.trim());
  } catch (cause: unknown) {
    const stdout = hasStdout(cause) ? String(cause.stdout).trim() : '';
    if (stdout) {
      try {
        return parseAccountIdeaResult(stdout);
      } catch {
        // fall through
      }
    }
    return { ok: false, error: String(cause) };
  }
}

export function proposeSignalerAccountIdea(input: {
  nicheId: number; platform: string; handles: string[]; bio: string; notes?: string;
}): AccountIdeaResult {
  return runAccountIdeasCLI([
    '--propose',
    '--niche-id', String(input.nicheId),
    '--platform', input.platform,
    '--handles', input.handles.join(','),
    '--bio', input.bio,
    '--notes', input.notes ?? '',
  ]);
}

export function decideSignalerAccountHandle(ideaId: number, handle: string): AccountIdeaResult {
  return runAccountIdeasCLI(['--decide', '--idea-id', String(ideaId), '--handle', handle]);
}

export function markSignalerAccountCreated(ideaId: number): AccountIdeaResult {
  return runAccountIdeasCLI(['--create', '--idea-id', String(ideaId)]);
}
