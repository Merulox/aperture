import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  GenesisCityEvent,
  GenesisCitySnapshot,
  GenesisDeliverySnapshot,
  GenesisMessageReceipt,
  GenesisRunSnapshot,
  GenesisTraceSnapshot,
  GenesisWakeReceipt,
  GenesisWakeSnapshot,
} from './city-types';

const GENESIS_ROOT = process.env.GENESIS_ROOT ?? join(homedir(), 'projects', 'genesis');
const RUNTIME_DB = process.env.GENESIS_RUNTIME_DB ?? join(homedir(), '.local', 'share', 'genesis-runtime-v2', 'runtime.sqlite3');
const WAKE_DIRECTORY = process.env.APERTURE_CITY_WAKE_DIR ?? join(homedir(), '.local', 'share', 'aperture', 'city', 'genesis-wakes');
const PYTHON = process.env.GENESIS_PYTHON_BIN ?? '/run/current-system/sw/bin/python3';
const CLAUDE = process.env.GENESIS_CLAUDE_BIN ?? join(homedir(), '.local', 'bin', 'claude');
const SOURCE = 'aperture-city';
const RESIDENT_ID = 'resident:genesis:genesis';
const MAX_MESSAGE_CHARS = 8_000;
const MAX_CONTEXT_CHARS = 512;
const IDEMPOTENCY_PATTERN = /^city:[a-zA-Z0-9._:-]{8,240}$/;

type SqlRow = Record<string, unknown>;
type CountRow = { status: string; count: number };

interface WakeRecord extends GenesisWakeSnapshot {
  pid: number | null;
}

export class CityGenesisError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CityGenesisError';
  }
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const decoded: unknown = JSON.parse(value);
    return decoded && typeof decoded === 'object' && !Array.isArray(decoded)
      ? decoded as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function timestamp(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1_000).toISOString()
    : null;
}

function requiredTimestamp(value: unknown): string {
  return timestamp(value) ?? new Date(0).toISOString();
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function groupByEvent<T extends { eventId: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const current = grouped.get(item.eventId);
    if (current) current.push(item);
    else grouped.set(item.eventId, [item]);
  }
  return grouped;
}

function countByStatus(rows: unknown[]): Record<string, number> {
  return Object.fromEntries((rows as CountRow[]).map((row) => [row.status, row.count]));
}

function readRuntimeEvents(database: DatabaseSync): {
  events: GenesisCityEvent[];
  runtime: GenesisCitySnapshot['runtime'];
} {
  const eventRows = database.prepare(`
    SELECT * FROM events ORDER BY created_at DESC LIMIT 40
  `).all() as SqlRow[];
  const runRows = database.prepare(`
    WITH recent_events AS (SELECT id FROM events ORDER BY created_at DESC LIMIT 40)
    SELECT runs.* FROM runs JOIN recent_events ON recent_events.id = runs.event_id
    ORDER BY runs.started_at, runs.attempt
  `).all() as SqlRow[];
  const traceRows = database.prepare(`
    WITH recent_events AS (SELECT id FROM events ORDER BY created_at DESC LIMIT 40)
    SELECT traces.* FROM traces JOIN recent_events ON recent_events.id = traces.event_id
    ORDER BY traces.created_at, traces.id
  `).all() as SqlRow[];
  const deliveryRows = database.prepare(`
    WITH recent_events AS (SELECT id FROM events ORDER BY created_at DESC LIMIT 40)
    SELECT deliveries.* FROM deliveries JOIN recent_events ON recent_events.id = deliveries.event_id
    ORDER BY deliveries.created_at, deliveries.id
  `).all() as SqlRow[];

  const runs = runRows.map((row): GenesisRunSnapshot & { eventId: string } => ({
    eventId: stringValue(row.event_id),
    id: stringValue(row.id),
    attempt: numberValue(row.attempt),
    workerId: stringValue(row.worker_id),
    status: stringValue(row.status) as GenesisRunSnapshot['status'],
    model: nullableString(row.model),
    startedAt: requiredTimestamp(row.started_at),
    finishedAt: timestamp(row.finished_at),
    latencyMs: nullableNumber(row.latency_ms),
    costUsd: nullableNumber(row.cost_usd),
    errorCode: nullableString(row.error_code),
    errorDetail: nullableString(row.error_detail),
    result: parseObject(row.result_json),
  }));
  const traces = traceRows.map((row): GenesisTraceSnapshot & { eventId: string } => ({
    eventId: stringValue(row.event_id),
    id: numberValue(row.id),
    runId: stringValue(row.run_id),
    sequence: numberValue(row.seq),
    kind: stringValue(row.kind),
    data: parseObject(row.data_json) ?? {},
    createdAt: requiredTimestamp(row.created_at),
  }));
  const deliveries = deliveryRows.map((row): GenesisDeliverySnapshot & { eventId: string } => ({
    eventId: stringValue(row.event_id),
    id: stringValue(row.id),
    runId: stringValue(row.run_id),
    kind: stringValue(row.kind) as GenesisDeliverySnapshot['kind'],
    channel: stringValue(row.channel),
    target: stringValue(row.target),
    status: stringValue(row.status) as GenesisDeliverySnapshot['status'],
    attempts: numberValue(row.attempts),
    payload: parseObject(row.payload_json) ?? {},
    createdAt: requiredTimestamp(row.created_at),
    updatedAt: requiredTimestamp(row.updated_at),
    sentAt: timestamp(row.sent_at),
    lastError: nullableString(row.last_error),
  }));
  const runsByEvent = groupByEvent(runs);
  const tracesByEvent = groupByEvent(traces);
  const deliveriesByEvent = groupByEvent(deliveries);

  const events = eventRows.map((row): GenesisCityEvent => {
    const payload = parseObject(row.payload_json) ?? {};
    const provenance = parseObject(row.provenance_json) ?? {};
    return {
      id: stringValue(row.id),
      idempotencyKey: stringValue(row.idempotency_key),
      source: stringValue(row.source),
      sourceId: nullableString(row.source_id),
      text: stringValue(payload.text),
      context: stringValue(provenance.conversation_context) || 'general',
      trust: stringValue(provenance.trust) || 'unknown',
      status: stringValue(row.status) as GenesisCityEvent['status'],
      attempts: numberValue(row.attempts),
      maxAttempts: numberValue(row.max_attempts),
      createdAt: requiredTimestamp(row.created_at),
      updatedAt: requiredTimestamp(row.updated_at),
      terminalAt: timestamp(row.terminal_at),
      decision: parseObject(row.decision_json),
      runs: runsByEvent.get(stringValue(row.id)) ?? [],
      traces: tracesByEvent.get(stringValue(row.id)) ?? [],
      deliveries: deliveriesByEvent.get(stringValue(row.id)) ?? [],
    };
  });

  const metadata = database.prepare("SELECT value FROM metadata WHERE key='schema_version'").get() as SqlRow | undefined;
  return {
    events,
    runtime: {
      schemaVersion: metadata ? stringValue(metadata.value) : null,
      events: countByStatus(database.prepare('SELECT status, COUNT(*) AS count FROM events GROUP BY status').all()),
      runs: countByStatus(database.prepare('SELECT status, COUNT(*) AS count FROM runs GROUP BY status').all()),
      deliveries: countByStatus(database.prepare('SELECT status, COUNT(*) AS count FROM deliveries GROUP BY status').all()),
    },
  };
}

function publicWake(record: WakeRecord): GenesisWakeSnapshot {
  const { pid: _pid, ...snapshot } = record;
  return snapshot;
}

function wakePath(wakeId: string): string {
  return join(WAKE_DIRECTORY, `${wakeId}.json`);
}

async function writeWake(record: WakeRecord): Promise<void> {
  await mkdir(WAKE_DIRECTORY, { recursive: true, mode: 0o700 });
  const target = wakePath(record.wakeId);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(temporary, target);
}

async function readWake(wakeId: string): Promise<WakeRecord> {
  const decoded: unknown = JSON.parse(await readFile(wakePath(wakeId), 'utf8'));
  if (!decoded || typeof decoded !== 'object') throw new Error(`Invalid wake record: ${wakeId}`);
  return decoded as WakeRecord;
}

function processAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function reconcileWake(record: WakeRecord, events: Map<string, GenesisCityEvent>): Promise<WakeRecord> {
  if (!['starting', 'started'].includes(record.status)) return record;
  const event = events.get(record.requestedEventId);
  const latestRun = event?.runs.at(-1) ?? null;
  if (event?.status === 'succeeded') {
    const next: WakeRecord = {
      ...record,
      status: 'succeeded',
      finishedAt: latestRun?.finishedAt ?? event.terminalAt ?? new Date().toISOString(),
      runId: latestRun?.id ?? null,
      exitCode: record.exitCode ?? 0,
    };
    await writeWake(next);
    return next;
  }
  if (event?.status === 'dead_letter' || (!processAlive(record.pid) && latestRun && latestRun.status !== 'running')) {
    const next: WakeRecord = {
      ...record,
      status: 'failed',
      finishedAt: latestRun?.finishedAt ?? new Date().toISOString(),
      runId: latestRun?.id ?? null,
      exitCode: record.exitCode,
      error: latestRun?.errorDetail ?? (event?.status === 'dead_letter' ? 'Event reached dead letter.' : 'Transient wake exited before the event succeeded.'),
    };
    await writeWake(next);
    return next;
  }
  if (record.status === 'starting' && !processAlive(record.pid)) {
    const next: WakeRecord = {
      ...record,
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: record.error ?? 'Transient wake did not start.',
    };
    await writeWake(next);
    return next;
  }
  return { ...record, runId: latestRun?.id ?? record.runId };
}

async function readWakes(events: GenesisCityEvent[]): Promise<GenesisWakeSnapshot[]> {
  await mkdir(WAKE_DIRECTORY, { recursive: true, mode: 0o700 });
  const names = (await readdir(WAKE_DIRECTORY)).filter((name) => name.endsWith('.json')).sort().reverse().slice(0, 40);
  const eventMap = new Map(events.map((event) => [event.id, event]));
  const records = await Promise.all(names.map(async (name) => {
    try {
      return await reconcileWake(await readWake(name.slice(0, -5)), eventMap);
    } catch {
      return null;
    }
  }));
  return records.filter((record): record is WakeRecord => record !== null).map(publicWake);
}

function unavailableSnapshot(error: string): GenesisCitySnapshot {
  return {
    observedAt: new Date().toISOString(),
    adapter: {
      id: 'genesis-runtime-v2',
      version: '1',
      sourceName: 'Genesis runtime v2',
      health: 'unavailable',
      limitation: 'Messages and wakes are disabled until the durable runtime database is readable.',
    },
    resident: {
      id: RESIDENT_ID,
      name: 'Genesis',
      state: 'unavailable',
      summary: 'Genesis runtime v2 is unavailable.',
      blocker: error,
    },
    runtime: { schemaVersion: null, events: {}, runs: {}, deliveries: {} },
    events: [],
    wakes: [],
    error,
  };
}

export async function readGenesisSnapshot(): Promise<GenesisCitySnapshot> {
  if (!existsSync(RUNTIME_DB)) return unavailableSnapshot('Runtime database does not exist.');
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(RUNTIME_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');
    const { events, runtime } = readRuntimeEvents(database);
    const wakes = await readWakes(events);
    const hasDeadLetter = (runtime.events.dead_letter ?? 0) > 0 || (runtime.deliveries.dead_letter ?? 0) > 0;
    const hasRunning = (runtime.events.running ?? 0) > 0;
    const hasQueued = (runtime.events.queued ?? 0) > 0;
    const state = hasDeadLetter ? 'attention' : hasRunning ? 'working' : hasQueued ? 'queued' : 'idle';
    return {
      observedAt: new Date().toISOString(),
      adapter: {
        id: 'genesis-runtime-v2',
        version: '1',
        sourceName: 'Genesis runtime v2',
        health: hasDeadLetter ? 'degraded' : 'healthy',
        limitation: 'Runtime v2 remains monitor-only. City may enqueue trusted operator messages and explicitly start one transient wake; it cannot grant capabilities or deliver externally.',
      },
      resident: {
        id: RESIDENT_ID,
        name: 'Genesis',
        state,
        summary: state === 'idle' ? 'Durable inbox connected; no event is waiting.' : `Durable runtime state: ${state}.`,
        blocker: hasDeadLetter ? 'At least one event or delivery requires operator attention.' : null,
      },
      runtime,
      events,
      wakes,
      error: null,
    };
  } catch (cause) {
    return unavailableSnapshot(cause instanceof Error ? cause.message : String(cause));
  } finally {
    database?.close();
  }
}

function validateIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !IDEMPOTENCY_PATTERN.test(value)) {
    throw new CityGenesisError('idempotencyKey must start with city: and contain 8-240 safe characters.', 400);
  }
  return value;
}

async function runGenesis(args: string[]): Promise<Record<string, unknown>> {
  const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(PYTHON, args, {
      cwd: GENESIS_ROOT,
      timeout: 15_000,
      maxBuffer: 1_048_576,
      env: process.env,
    }, (error, stdout, stderr) => error ? reject(Object.assign(error, { stdout, stderr })) : resolve({ stdout, stderr }));
  }).catch((cause: unknown) => {
    const detail = cause && typeof cause === 'object' && 'stderr' in cause && typeof cause.stderr === 'string'
      ? cause.stderr.trim()
      : cause instanceof Error ? cause.message : String(cause);
    throw new CityGenesisError(`Genesis runtime command failed: ${detail || 'unknown error'}`, 503);
  });
  try {
    const decoded: unknown = JSON.parse(result.stdout);
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('non-object output');
    return decoded as Record<string, unknown>;
  } catch {
    throw new CityGenesisError('Genesis runtime returned invalid JSON.', 503);
  }
}

export async function enqueueGenesisMessage(input: {
  text: unknown;
  context: unknown;
  idempotencyKey: unknown;
}): Promise<GenesisMessageReceipt> {
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const context = typeof input.context === 'string' ? input.context.trim() : '';
  if (!text || text.length > MAX_MESSAGE_CHARS) {
    throw new CityGenesisError(`text must contain 1-${MAX_MESSAGE_CHARS} characters.`, 400);
  }
  if (!context || context.length > MAX_CONTEXT_CHARS) {
    throw new CityGenesisError(`context must contain 1-${MAX_CONTEXT_CHARS} characters.`, 400);
  }
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const result = await runGenesis([
    '-m', 'runtime_v2', '--db', RUNTIME_DB, 'enqueue',
    '--idempotency-key', idempotencyKey,
    '--source', SOURCE,
    '--source-id', RESIDENT_ID,
    '--text', text,
    '--provenance', JSON.stringify({
      source_class: 'operator_command',
      trust: 'trusted_operator',
      observed_at: new Date().toISOString(),
      conversation_context: context,
      adapter: 'aperture-city/genesis-runtime-v2@1',
    }),
  ]);
  const eventId = stringValue(result.event_id);
  if (!eventId) throw new CityGenesisError('Genesis runtime did not return an event ID.', 503);
  return {
    kind: 'message.send',
    eventId,
    created: result.created === true,
    status: 'queued',
    idempotencyKey,
  };
}

export async function startGenesisWake(input: {
  eventId: unknown;
  idempotencyKey: unknown;
}): Promise<GenesisWakeReceipt> {
  const eventId = typeof input.eventId === 'string' ? input.eventId.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw new CityGenesisError('eventId must be a UUID.', 400);
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const digest = createHash('sha256').update(idempotencyKey).digest('hex');
  const wakeId = `wake-${digest.slice(0, 32)}`;
  await mkdir(WAKE_DIRECTORY, { recursive: true, mode: 0o700 });
  if (existsSync(wakePath(wakeId))) {
    const existing = await readWake(wakeId);
    if (existing.requestedEventId !== eventId) {
      throw new CityGenesisError('idempotencyKey is already bound to a different event.', 409);
    }
    return { kind: 'resident.wake', eventId, wakeId, status: existing.status, created: false };
  }

  const snapshot = await readGenesisSnapshot();
  if (snapshot.adapter.health === 'unavailable') throw new CityGenesisError(snapshot.error ?? 'Genesis runtime is unavailable.', 503);
  const event = snapshot.events.find((item) => item.id === eventId);
  if (!event) throw new CityGenesisError('Event not found.', 404);
  if (event.source !== SOURCE) throw new CityGenesisError('City may wake only an Aperture City event.', 403);
  if (event.status !== 'queued') throw new CityGenesisError(`Event is already ${event.status}.`, 409);
  const initial: WakeRecord = {
    wakeId,
    idempotencyKey,
    requestedEventId: eventId,
    status: 'starting',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    runId: null,
    exitCode: null,
    error: null,
    pid: null,
  };
  try {
    await writeFile(wakePath(wakeId), `${JSON.stringify(initial, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'EEXIST') {
      const existing = await readWake(wakeId);
      if (existing.requestedEventId !== eventId) {
        throw new CityGenesisError('idempotencyKey is already bound to a different event.', 409);
      }
      return { kind: 'resident.wake', eventId, wakeId, status: existing.status, created: false };
    }
    throw cause;
  }

  const activeWake = snapshot.wakes.find((wake) => ['starting', 'started'].includes(wake.status));
  if (activeWake) {
    const failed = { ...initial, status: 'failed' as const, finishedAt: new Date().toISOString(), error: `Wake ${activeWake.wakeId} is already active.` };
    await writeWake(failed);
    throw new CityGenesisError(`Wake ${activeWake.wakeId} is already active.`, 409);
  }

  const child = spawn(PYTHON, [
    '-m', 'runtime_v2', '--db', RUNTIME_DB, 'work-once',
    '--worker-id', `aperture-city-${wakeId}`,
    '--claude-bin', CLAUDE,
  ], {
    cwd: GENESIS_ROOT,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
  } catch (cause) {
    const failed: WakeRecord = {
      ...initial,
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: cause instanceof Error ? cause.message : String(cause),
    };
    await writeWake(failed);
    throw new CityGenesisError(`Transient Genesis wake failed to start: ${failed.error}`, 503);
  }

  const started: WakeRecord = { ...initial, status: 'started', pid: child.pid ?? null };
  await writeWake(started);
  child.once('exit', (code) => {
    void readWake(wakeId).then((record) => writeWake({
      ...record,
      exitCode: code,
      finishedAt: record.finishedAt ?? new Date().toISOString(),
    })).catch(() => undefined);
  });
  child.unref();
  return { kind: 'resident.wake', eventId, wakeId, status: 'started', created: true };
}
