// Deterministic "what does this lead need from me?" rules for the /leads attention bar.
// Pure: no I/O, so it can be tested directly and never invents state the CRM doesn't hold.

export type AttentionLevel = 'urgent' | 'needs_you' | 'waiting_on_them' | 'scheduled';

export interface AttentionInput {
  phone: string;
  name: string;
  owner_name?: string | null;
  stage: string;
  last_inbound_ts?: string | null;
  last_inbound_body?: string | null;
  last_inbound_class?: string | null;
  last_outbound_ts?: string | null;
  postpone_until?: string | null;
  postpone_note?: string | null;
}

export interface Attention {
  phone: string;
  name: string;
  stage: string;
  level: AttentionLevel;
  reason: 'opt_out_mismatch' | 'they_wrote_last' | 'call_booked' | 'postpone_due' | 'stale_no_reply' | 'awaiting_reply' | 'postponed';
  state: string;   // the lead's current state, in plain words
  awaited: string; // what is expected of Merulox (or "nothing yet")
  since: string | null;
  daysSince: number | null;
}

const TERMINAL: Record<string, true> = { STOP: true, BANNED: true, DEAD: true, LOST: true, WON: true };
export const URGENT_REPLY_DAYS = 2;
export const STALE_DAYS = 21;
const DAY = 86_400_000;

function parse(ts?: string | null): number | null {
  if (!ts) return null;
  const value = Date.parse(ts);
  return Number.isNaN(value) ? null : value;
}

function days(from: number, now: number): number {
  return Math.max(0, Math.floor((now - from) / DAY));
}

function quote(body?: string | null): string {
  const text = (body ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return `"${text.length > 90 ? `${text.slice(0, 87)}…` : text}"`;
}

function ago(n: number): string {
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
}

export function deriveAttention(lead: AttentionInput, now: number = Date.now()): Attention | null {
  const stage = (lead.stage || '').toUpperCase();
  const inbound = parse(lead.last_inbound_ts);
  const outbound = parse(lead.last_outbound_ts);
  const cls = (lead.last_inbound_class || '').toUpperCase();
  const base = { phone: lead.phone, name: lead.name || lead.phone, stage };

  if (cls === 'STOP' && !TERMINAL[stage]) {
    const n = inbound === null ? null : days(inbound, now);
    return {
      ...base,
      level: 'urgent',
      reason: 'opt_out_mismatch',
      state: `Their last reply ${quote(lead.last_inbound_body)} was read as an opt-out, but the lead is still marked ${stage}.`,
      awaited: 'Confirm the opt-out: mark them STOP so nothing contacts them again.',
      since: lead.last_inbound_ts ?? null,
      daysSince: n,
    };
  }
  if (TERMINAL[stage]) return null;

  if (inbound !== null && (outbound === null || inbound > outbound)) {
    const n = days(inbound, now);
    return {
      ...base,
      level: n <= URGENT_REPLY_DAYS ? 'urgent' : 'needs_you',
      reason: 'they_wrote_last',
      state: `They wrote last, ${ago(n)}: ${quote(lead.last_inbound_body)}${cls ? ` (${cls.toLowerCase()})` : ''}. No reply from us yet.`,
      awaited: 'Reply to them, or close the lead if it is not a fit.',
      since: lead.last_inbound_ts ?? null,
      daysSince: n,
    };
  }

  if (stage === 'BOOKED') {
    return {
      ...base,
      level: 'needs_you',
      reason: 'call_booked',
      state: 'A call is booked.',
      awaited: 'Hold the call, then record the outcome.',
      since: lead.last_outbound_ts ?? lead.last_inbound_ts ?? null,
      daysSince: null,
    };
  }

  if (stage === 'POSTPONED') {
    const until = parse(lead.postpone_until);
    const note = lead.postpone_note ? ` Note: ${quote(lead.postpone_note)}.` : '';
    if (until !== null && until > now) {
      return {
        ...base,
        level: 'scheduled',
        reason: 'postponed',
        state: `Postponed until ${lead.postpone_until}.${note}`,
        awaited: 'Nothing until then.',
        since: lead.postpone_until ?? null,
        daysSince: null,
      };
    }
    return {
      ...base,
      level: 'needs_you',
      reason: 'postpone_due',
      state: `The postponement${lead.postpone_until ? ` (until ${lead.postpone_until})` : ''} has ended.${note}`,
      awaited: 'Follow up as agreed, or reschedule or close the lead.',
      since: lead.postpone_until ?? null,
      daysSince: until === null ? null : days(until, now),
    };
  }

  if (outbound !== null) {
    const n = days(outbound, now);
    const theirs = lead.last_inbound_body ? ` Their last words: ${quote(lead.last_inbound_body)}.` : '';
    if (n >= STALE_DAYS) {
      return {
        ...base,
        level: 'needs_you',
        reason: 'stale_no_reply',
        state: `Our last message was ${ago(n)}; no reply since.${theirs}`,
        awaited: 'Decide: one final message, or close the lead as dead.',
        since: lead.last_outbound_ts ?? null,
        daysSince: n,
      };
    }
    return {
      ...base,
      level: 'waiting_on_them',
      reason: 'awaiting_reply',
      state: `We wrote last, ${ago(n)}.${theirs}`,
      awaited: 'Nothing yet; waiting on their reply.',
      since: lead.last_outbound_ts ?? null,
      daysSince: n,
    };
  }
  return null;
}

const ORDER: Record<AttentionLevel, number> = { urgent: 0, needs_you: 1, waiting_on_them: 2, scheduled: 3 };

export function rankAttention(leads: AttentionInput[], now: number = Date.now()): Attention[] {
  return leads
    .map((lead) => deriveAttention(lead, now))
    .filter((item): item is Attention => item !== null)
    .sort((a, b) => ORDER[a.level] - ORDER[b.level] || (a.daysSince ?? 0) - (b.daysSince ?? 0));
}
