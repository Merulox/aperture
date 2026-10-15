import assert from 'node:assert/strict';
import { deriveAttention, rankAttention, STALE_DAYS } from '../src/lib/attention.ts';

const NOW = Date.parse('2026-10-14T21:00:00-04:00');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test('opt-out classified reply on a live stage is urgent and asks to confirm STOP', () => {
  const a = deriveAttention({ phone: '1', name: 'Climatech', stage: 'RESPONDED',
    last_inbound_ts: daysAgo(107), last_inbound_body: 'Wtf ???', last_inbound_class: 'STOP',
    last_outbound_ts: daysAgo(107) }, NOW)!;
  assert.equal(a.level, 'urgent');
  assert.equal(a.reason, 'opt_out_mismatch');
  assert.match(a.awaited, /mark them STOP/);
});

test('terminal leads produce nothing', () => {
  assert.equal(deriveAttention({ phone: '2', name: 'x', stage: 'DEAD', last_inbound_ts: daysAgo(1) }, NOW), null);
  assert.equal(deriveAttention({ phone: '3', name: 'x', stage: 'STOP', last_inbound_class: 'STOP' }, NOW), null);
});

test('fresh unanswered reply is urgent; older one still needs you', () => {
  const fresh = deriveAttention({ phone: '4', name: 'A', stage: 'SENT', last_inbound_ts: daysAgo(1),
    last_inbound_body: 'Intéressé, appelez-moi', last_inbound_class: 'INTERESTED', last_outbound_ts: daysAgo(3) }, NOW)!;
  assert.equal(fresh.level, 'urgent');
  assert.equal(fresh.reason, 'they_wrote_last');
  assert.match(fresh.state, /yesterday/);
  const old = deriveAttention({ phone: '5', name: 'B', stage: 'RESPONDED', last_inbound_ts: daysAgo(10),
    last_outbound_ts: daysAgo(12) }, NOW)!;
  assert.equal(old.level, 'needs_you');
});

test('we wrote last long ago -> decide final message or close', () => {
  const a = deriveAttention({ phone: '6', name: 'Berardelli', stage: 'RESPONDED',
    last_inbound_ts: daysAgo(109), last_inbound_body: "C'est qui ça", last_outbound_ts: daysAgo(75) }, NOW)!;
  assert.equal(a.reason, 'stale_no_reply');
  assert.equal(a.daysSince, 75);
  assert.match(a.state, /C'est qui ça/);
  assert.match(a.awaited, /final message, or close/);
});

test('we wrote last recently -> waiting on them', () => {
  const a = deriveAttention({ phone: '7', name: 'C', stage: 'RESPONDED', last_inbound_ts: daysAgo(STALE_DAYS + 5),
    last_outbound_ts: daysAgo(STALE_DAYS - 1) }, NOW)!;
  assert.equal(a.level, 'waiting_on_them');
});

test('postponed in the future is scheduled; past due needs you', () => {
  const future = deriveAttention({ phone: '8', name: 'Sijytec', stage: 'POSTPONED', postpone_until: '2026-12-08',
    last_inbound_ts: daysAgo(160), last_outbound_ts: daysAgo(70) }, NOW)!;
  assert.equal(future.level, 'scheduled');
  const due = deriveAttention({ phone: '9', name: 'D', stage: 'POSTPONED', postpone_until: '2026-10-01',
    postpone_note: 'rappeler après la saison', last_outbound_ts: daysAgo(30) }, NOW)!;
  assert.equal(due.reason, 'postpone_due');
  assert.match(due.state, /rappeler après la saison/);
});

test('booked call asks for outcome', () => {
  const a = deriveAttention({ phone: '10', name: 'E', stage: 'BOOKED', last_outbound_ts: daysAgo(1) }, NOW)!;
  assert.equal(a.reason, 'call_booked');
});

test('ranking puts urgent first, then needs_you, then waiting, then scheduled', () => {
  const ranked = rankAttention([
    { phone: 's', name: 's', stage: 'POSTPONED', postpone_until: '2026-12-08' },
    { phone: 'w', name: 'w', stage: 'RESPONDED', last_outbound_ts: daysAgo(2) },
    { phone: 'u', name: 'u', stage: 'RESPONDED', last_inbound_class: 'STOP', last_inbound_ts: daysAgo(5) },
    { phone: 'n', name: 'n', stage: 'RESPONDED', last_outbound_ts: daysAgo(60) },
  ], NOW);
  assert.deepEqual(ranked.map((r) => r.phone), ['u', 'n', 'w', 's']);
});

console.log(`${passed} passed`);
