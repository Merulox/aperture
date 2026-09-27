import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HOME = homedir();
const CONTROL_ROOT = process.env.APERTURE_JAILBREAK_CONTROL_ROOT
  ?? join(HOME, 'projects/realm/flagship_control');
const EVAL_BANK_PATH = join(CONTROL_ROOT, 'eval_bank.json');
const FLAGSHIP_BIN = process.env.APERTURE_JAILBREAK_FLAGSHIP_BIN
  ?? join(CONTROL_ROOT, 'omp-flagship');
const REALM_ROOT = process.env.APERTURE_REALM_ROOT ?? join(HOME, 'projects/realm');
const STATE_ROOT = process.env.APERTURE_JAILBREAK_EVAL_STATE_ROOT
  ?? join(HOME, '.local/state/aperture/jailbreak-eval');
const RESULTS_PATH = join(STATE_ROOT, 'results.jsonl');
const PYTHON = process.env.APERTURE_JAILBREAK_LEDGER_PYTHON ?? '/run/current-system/sw/bin/python3';
const WORKSTREAM_ID = 'aperture:jailbreak-eval';
const ROUTE = 'sol';
const TIMEOUT_SECONDS = 45;
const COOLDOWN_SECONDS = 60;
const PROCESS_TIMEOUT_MS = 55_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEDGER_RECEIPT_PREVIEW_CHARS = 1024;
export const JAILBREAK_EVAL_LEDGER_RECEIPT_MAX_BYTES = 32 * 1024;
const PINNED_CASES: Record<string, { promptSha256: string; expectedOutput: string }> = {
  'schema.exact.01': {
    promptSha256: '792032f9ac0291479cb158bca4a53cdeaae19a71b024ded2d4ee304283e4295c',
    expectedOutput: 'FLAGSHIP_PROFILE_OK',
  },
};

interface EvalBankCase {
  id: string;
  stage: string;
  mode: string;
  prompt?: string;
  assertions?: {
    exit_status?: number;
    exact_trimmed_output?: string;
  };
}

interface EvalBank {
  method_id: string;
  cases: EvalBankCase[];
}

export interface AllowedEvalCase {
  id: string;
  stage: string;
  mode: 'no-tools';
  expectedOutput: string;
}

interface ResolvedAllowedEvalCase extends AllowedEvalCase {
  prompt: string;
}

export interface JailbreakEvalResult {
  schemaVersion: 1;
  runId: string;
  requestId: string;
  caseId: string;
  route: 'sol';
  mode: 'no-tools';
  startedAt: string;
  finishedAt: string;
  timeoutSeconds: number;
  commandPolicy: {
    print: true;
    noSession: true;
    noTools: true;
    noLsp: true;
    arbitraryPrompt: false;
  };
  exitStatus: number | null;
  output: string;
  error: string | null;
  expectedOutput: string;
  passed: boolean;
  attemptId: string;
}

export interface JailbreakEvalSnapshot {
  cases: AllowedEvalCase[];
  results: JailbreakEvalResult[];
  policy: {
    route: 'sol';
    timeoutSeconds: number;
    cooldownSeconds: number;
    noTools: true;
    noSession: true;
    arbitraryPrompt: false;
    appendOnlyResults: true;
  };
}

export class JailbreakEvalError extends Error {
  readonly status: number;
  readonly result: JailbreakEvalResult | undefined;

  constructor(message: string, status = 400, result?: JailbreakEvalResult) {
    super(message);
    this.status = status;
    this.result = result;
  }
}

export function parseJailbreakEvalRequest(payload: unknown): { caseId: string; requestId: string } | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const body = payload as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  if (
    keys.length !== 2
    || keys[0] !== 'caseId'
    || keys[1] !== 'requestId'
    || typeof body.caseId !== 'string'
    || typeof body.requestId !== 'string'
  ) {
    return null;
  }
  return { caseId: body.caseId, requestId: body.requestId };
}

const LEDGER_BRIDGE = String.raw`
import base64
import json
import secrets
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[1])
from commons.event_ledger import attempt_status, connect, record_outcome, start_attempt

action = sys.argv[2]
workstream_id = sys.argv[3]
connection = connect()

if action == "status":
    prefix = sys.argv[4]
    status, latest = attempt_status(connection, workstream_id, prefix)
    print(json.dumps({"status": status, "attemptId": latest["id"] if latest else None}))
elif action == "start":
    prefix, request_id, case_id, nonce = sys.argv[4:8]
    status, latest = attempt_status(connection, workstream_id, prefix)
    if status != "none":
        print(json.dumps({"status": status, "attemptId": latest["id"] if latest else None}))
        raise SystemExit(0)
    event = start_attempt(
        connection,
        "omp_flagship_eval",
        f"sol:{case_id}",
        idempotency_key=prefix,
        workstream_id=workstream_id,
        effect_class="irreversible_remote",
        auth_state="valid",
        context={"request_id": request_id, "case_id": case_id, "mode": "no-tools", "nonce": nonce},
    )
    if event["payload"].get("nonce") != nonce:
        print(json.dumps({"status": "unresolved", "attemptId": event["id"]}))
    else:
        print(json.dumps({"status": "started", "attemptId": event["id"]}))
elif action == "outcome":
    attempt_id, outcome, detail, receipt_b64 = sys.argv[4:8]
    event = record_outcome(
        connection,
        attempt_id,
        outcome,
        detail=detail,
        conflict_state="none",
        workstream_id=workstream_id,
        receipt=base64.b64decode(receipt_b64),
        media_type="application/json",
    )
    print(json.dumps({"status": "recorded", "eventId": event["id"]}))
else:
    raise SystemExit("unknown ledger action")
`;

const COOLDOWN_BRIDGE = String.raw`
import json
import os
import sqlite3
import sys
import time

db_path, action, case_id, cooldown_ms_text, lease_token = sys.argv[1:6]
cooldown_ms = int(cooldown_ms_text)
connection = sqlite3.connect(db_path, timeout=5.0, isolation_level=None)
try:
    os.chmod(db_path, 0o600)
    connection.execute(
        "CREATE TABLE IF NOT EXISTS cooldowns "
        "(case_id TEXT PRIMARY KEY, acquired_at_ms INTEGER NOT NULL, lease_token TEXT NOT NULL)"
    )
    connection.execute("BEGIN IMMEDIATE")
    if action == "acquire":
        now_ms = time.time_ns() // 1_000_000
        row = connection.execute(
            "SELECT acquired_at_ms FROM cooldowns WHERE case_id = ?",
            (case_id,),
        ).fetchone()
        elapsed_ms = max(0, now_ms - row[0]) if row else cooldown_ms
        if row and elapsed_ms < cooldown_ms:
            connection.execute("ROLLBACK")
            remaining_seconds = max(1, (cooldown_ms - elapsed_ms + 999) // 1000)
            print(json.dumps({"status": "cooldown", "remainingSeconds": remaining_seconds}))
        else:
            connection.execute(
                "INSERT INTO cooldowns(case_id, acquired_at_ms, lease_token) VALUES (?, ?, ?) "
                "ON CONFLICT(case_id) DO UPDATE SET "
                "acquired_at_ms = excluded.acquired_at_ms, lease_token = excluded.lease_token",
                (case_id, now_ms, lease_token),
            )
            connection.execute("COMMIT")
            print(json.dumps({"status": "acquired"}))
    elif action == "release":
        cursor = connection.execute(
            "DELETE FROM cooldowns WHERE case_id = ? AND lease_token = ?",
            (case_id, lease_token),
        )
        connection.execute("COMMIT")
        print(json.dumps({"status": "released" if cursor.rowcount == 1 else "not_owner"}))
    else:
        connection.execute("ROLLBACK")
        raise SystemExit("unknown cooldown action")
finally:
    connection.close()
`;

async function readBank(): Promise<EvalBank> {
  const parsed = JSON.parse(await readFile(EVAL_BANK_PATH, 'utf8')) as EvalBank;
  if (!parsed || !Array.isArray(parsed.cases)) throw new Error('Evaluation bank is malformed.');
  return parsed;
}

async function resolveAllowedJailbreakEvalCases(): Promise<ResolvedAllowedEvalCase[]> {
  const bank = await readBank();
  return bank.cases.flatMap((item) => {
    const pin = PINNED_CASES[item.id];
    const expected = item.assertions?.exact_trimmed_output;
    const prompt = typeof item.prompt === 'string' ? item.prompt : '';
    const promptSha256 = createHash('sha256').update(prompt).digest('hex');
    if (
      !pin
      || item.stage !== 'A'
      || item.mode !== 'no-tools'
      || item.assertions?.exit_status !== 0
      || expected !== pin.expectedOutput
      || promptSha256 !== pin.promptSha256
    ) {
      return [];
    }
    return [{
      id: item.id,
      stage: item.stage,
      mode: 'no-tools' as const,
      expectedOutput: pin.expectedOutput,
      prompt,
    }];
  });
}

export async function listAllowedJailbreakEvalCases(): Promise<AllowedEvalCase[]> {
  return (await resolveAllowedJailbreakEvalCases()).map(({ prompt: _prompt, ...item }) => item);
}

export function buildJailbreakEvalArgs(prompt: string): string[] {
  return [
    'launch', ROUTE, '--', '-p', '--no-session', '--no-tools', '--no-lsp',
    '--max-time', String(TIMEOUT_SECONDS), prompt,
  ];
}

export function scoreJailbreakEval(exitStatus: number | null, output: string, expectedOutput: string): boolean {
  return exitStatus === 0 && output.trim() === expectedOutput;
}

export function buildJailbreakEvalLedgerReceipt(result: JailbreakEvalResult): string {
  const errorText = result.error ?? '';
  const payload = {
    schemaVersion: result.schemaVersion,
    runId: result.runId,
    requestId: result.requestId,
    caseId: result.caseId,
    route: result.route,
    mode: result.mode,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    timeoutSeconds: result.timeoutSeconds,
    commandPolicy: result.commandPolicy,
    exitStatus: result.exitStatus,
    expectedOutput: result.expectedOutput,
    passed: result.passed,
    attemptId: result.attemptId,
    outputPreview: result.output.slice(0, LEDGER_RECEIPT_PREVIEW_CHARS),
    outputSha256: createHash('sha256').update(result.output).digest('hex'),
    outputTruncated: result.output.length > LEDGER_RECEIPT_PREVIEW_CHARS,
    errorPreview: errorText.slice(0, LEDGER_RECEIPT_PREVIEW_CHARS),
    errorSha256: createHash('sha256').update(errorText).digest('hex'),
    errorTruncated: errorText.length > LEDGER_RECEIPT_PREVIEW_CHARS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  if (Buffer.byteLength(encoded) > JAILBREAK_EVAL_LEDGER_RECEIPT_MAX_BYTES) {
    throw new Error('Evaluation ledger receipt exceeds its argv-safe bound.');
  }
  return encoded;
}

async function executeFlagship(args: string[]): Promise<{ stdout: string; stderr: string }> {
  type ExecutionError = Error & { code?: number | string; stdout?: string; stderr?: string };
  const { promise, resolve, reject } = Promise.withResolvers<{ stdout: string; stderr: string }>();
  const child = spawn(FLAGSHIP_BIN, args, {
    cwd: REALM_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let stdout = '';
  let stderr = '';
  let outputBytes = 0;
  let settled = false;
  let timer: NodeJS.Timeout | undefined;
  let killTimer: NodeJS.Timeout | undefined;
  let termination: { code: string; message: string } | null = null;
  let directClosed = false;
  let killConfirmationDeadline = 0;

  const signalProcessGroup = (signal: NodeJS.Signals): void => {
    if (!child.pid) return;
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ESRCH') return;
      try {
        child.kill(signal);
      } catch {
        // The close event remains the completion authority.
      }
    }
  };
  const fail = (error: ExecutionError): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    clearTimeout(killTimer);
    error.stdout = stdout;
    error.stderr = stderr;
    reject(error);
  };
  const processGroupIsAlive = (): boolean => {
    if (!child.pid) return false;
    if (process.platform === 'win32') return !directClosed;
    try {
      process.kill(-child.pid, 0);
      return true;
    } catch (cause) {
      return (cause as NodeJS.ErrnoException).code !== 'ESRCH';
    }
  };
  const finishTerminationWhenExited = (): void => {
    if (processGroupIsAlive() && Date.now() < killConfirmationDeadline) {
      killTimer = setTimeout(finishTerminationWhenExited, 50);
      return;
    }
    const error = new Error(termination.message) as ExecutionError;
    error.code = termination.code;
    fail(error);
  };
  const terminate = (code: string, message: string): void => {
    if (settled || termination) return;
    termination = { code, message };
    clearTimeout(timer);
    signalProcessGroup('SIGTERM');
    killTimer = setTimeout(() => {
      signalProcessGroup('SIGKILL');
      killConfirmationDeadline = Date.now() + 3_000;
      finishTerminationWhenExited();
    }, 2_000);
  };

  timer = setTimeout(() => {
    terminate('ETIMEDOUT', `Flagship evaluation exceeded ${PROCESS_TIMEOUT_MS} ms.`);
  }, PROCESS_TIMEOUT_MS);

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    if (termination) return;
    outputBytes += Buffer.byteLength(chunk);
    stdout += chunk;
    if (outputBytes > MAX_OUTPUT_BYTES) {
      terminate('EOUTPUTLIMIT', 'Flagship evaluation exceeded its output budget.');
    }
  });
  child.stderr.on('data', (chunk: string) => {
    if (termination) return;
    outputBytes += Buffer.byteLength(chunk);
    stderr += chunk;
    if (outputBytes > MAX_OUTPUT_BYTES) {
      terminate('EOUTPUTLIMIT', 'Flagship evaluation exceeded its output budget.');
    }
  });
  child.once('error', (cause) => fail(cause));
  child.once('close', (code) => {
    if (settled) return;
    directClosed = true;
    if (termination) return;
    settled = true;
    clearTimeout(timer);
    clearTimeout(killTimer);
    if (code === 0) {
      resolve({ stdout, stderr });
      return;
    }
    const error = new Error(`Flagship evaluation exited with status ${code ?? 'unknown'}.`) as ExecutionError;
    if (typeof code === 'number') error.code = code;
    error.stdout = stdout;
    error.stderr = stderr;
    reject(error);
  });
  return promise;
}

type CooldownResponse = { status?: string; remainingSeconds?: number };

async function invokeCooldownBridge(
  action: 'acquire' | 'release',
  caseId: string,
  leaseToken: string,
): Promise<CooldownResponse> {
  await mkdir(STATE_ROOT, { recursive: true, mode: 0o700 });
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(PYTHON, [
      '-c',
      COOLDOWN_BRIDGE,
      join(STATE_ROOT, 'cooldown.sqlite3'),
      action,
      caseId,
      String(COOLDOWN_SECONDS * 1000),
      leaseToken,
    ], { timeout: 7_000, maxBuffer: 64 * 1024 }));
  } catch (cause) {
    throw new JailbreakEvalError(
      `Evaluation cooldown state is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`,
      503,
    );
  }
  try {
    return JSON.parse(stdout) as CooldownResponse;
  } catch {
    throw new JailbreakEvalError('Evaluation cooldown state returned an invalid response.', 503);
  }
}

export async function acquireJailbreakEvalCooldown(caseId: string): Promise<string> {
  const leaseToken = randomUUID();
  const response = await invokeCooldownBridge('acquire', caseId, leaseToken);
  if (response.status === 'acquired') return leaseToken;
  if (response.status === 'cooldown') {
    throw new JailbreakEvalError(
      `Evaluation case is cooling down for ${response.remainingSeconds ?? COOLDOWN_SECONDS} more seconds.`,
      429,
    );
  }
  throw new JailbreakEvalError('Evaluation cooldown could not be acquired.', 503);
}

async function releaseJailbreakEvalCooldown(caseId: string, leaseToken: string): Promise<void> {
  const response = await invokeCooldownBridge('release', caseId, leaseToken);
  if (response.status !== 'released' && response.status !== 'not_owner') {
    throw new JailbreakEvalError('Evaluation cooldown could not be released.', 503);
  }
}

function ledgerAttemptPrefix(caseId: string, requestId: string): string {
  return `jailbreak-eval:${caseId}:request:${requestId}`;
}

async function assertLedgerAttemptAvailable(caseId: string, requestId: string): Promise<void> {
  const prefix = ledgerAttemptPrefix(caseId, requestId);
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(PYTHON, [
      '-c', LEDGER_BRIDGE, REALM_ROOT, 'status', WORKSTREAM_ID, prefix,
    ], { timeout: 10_000, maxBuffer: 256 * 1024 }));
  } catch (cause) {
    throw new JailbreakEvalError(`Evaluation ledger is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`, 503);
  }
  let response: { status?: string };
  try {
    response = JSON.parse(stdout) as { status?: string };
  } catch {
    throw new JailbreakEvalError('Evaluation ledger returned an invalid response.', 503);
  }
  if (response.status !== 'none') {
    throw new JailbreakEvalError(`Evaluation request is already ${response.status ?? 'unresolved'}.`, 409);
  }
}

async function startLedgerAttempt(caseId: string, requestId: string): Promise<string> {
  const nonce = randomUUID();
  const prefix = ledgerAttemptPrefix(caseId, requestId);
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(PYTHON, [
      '-c', LEDGER_BRIDGE, REALM_ROOT, 'start', WORKSTREAM_ID,
      prefix, requestId, caseId, nonce,
    ], { timeout: 10_000, maxBuffer: 256 * 1024 }));
  } catch (cause) {
    throw new JailbreakEvalError(`Evaluation ledger is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`, 503);
  }
  let response: { status?: string; attemptId?: string };
  try {
    response = JSON.parse(stdout) as { status?: string; attemptId?: string };
  } catch {
    throw new JailbreakEvalError('Evaluation ledger returned an invalid response.', 503);
  }
  if (response.status !== 'started' || !response.attemptId) {
    throw new JailbreakEvalError(`Evaluation request is already ${response.status ?? 'unresolved'}.`, 409);
  }
  return response.attemptId;
}

async function recordLedgerOutcome(
  attemptId: string,
  outcome: 'success' | 'failure' | 'unknown',
  detail: string,
  result: JailbreakEvalResult,
): Promise<void> {
  try {
    const receipt = buildJailbreakEvalLedgerReceipt(result);
    await execFileAsync(PYTHON, [
      '-c', LEDGER_BRIDGE, REALM_ROOT, 'outcome', WORKSTREAM_ID,
      attemptId, outcome, detail, receipt,
    ], { timeout: 10_000, maxBuffer: 256 * 1024 });
  } catch (cause) {
    // The provider invocation already happened. Preserve its primary result/error.
    console.error('jailbreak evaluation ledger outcome failed', cause);
  }
}

async function appendResult(result: JailbreakEvalResult): Promise<void> {
  await mkdir(STATE_ROOT, { recursive: true, mode: 0o700 });
  await appendFile(RESULTS_PATH, `${JSON.stringify(result)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export async function listJailbreakEvalResults(limit = 20): Promise<JailbreakEvalResult[]> {
  const text = await readFile(RESULTS_PATH, 'utf8').catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === 'ENOENT') return '';
    throw cause;
  });
  return text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      const value = JSON.parse(line) as JailbreakEvalResult;
      return value.schemaVersion === 1 ? [value] : [];
    } catch {
      return [];
    }
  }).slice(-Math.max(1, Math.min(limit, 100))).reverse();
}

export async function getJailbreakEvalSnapshot(): Promise<JailbreakEvalSnapshot> {
  return {
    cases: await listAllowedJailbreakEvalCases(),
    results: await listJailbreakEvalResults(),
    policy: {
      route: ROUTE,
      timeoutSeconds: TIMEOUT_SECONDS,
      noTools: true,
      cooldownSeconds: COOLDOWN_SECONDS,
      noSession: true,
      arbitraryPrompt: false,
      appendOnlyResults: true,
    },
  };
}

export async function runJailbreakEval(caseId: string, requestId: string): Promise<JailbreakEvalResult> {
  if (!REQUEST_ID.test(requestId)) throw new JailbreakEvalError('requestId must be a UUID.', 400);
  const selected = (await resolveAllowedJailbreakEvalCases()).find((item) => item.id === caseId);
  if (!selected) throw new JailbreakEvalError('caseId is not an allowlisted no-tools evaluation.', 403);
  await assertLedgerAttemptAvailable(caseId, requestId);
  const cooldownLease = await acquireJailbreakEvalCooldown(caseId);
  let attemptId: string;
  try {
    attemptId = await startLedgerAttempt(caseId, requestId);
  } catch (cause) {
    await releaseJailbreakEvalCooldown(caseId, cooldownLease).catch((releaseCause) => {
      console.error('jailbreak evaluation cooldown release failed', releaseCause);
    });
    throw cause;
  }
  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  let stdout: string;
  try {
    ({ stdout } = await executeFlagship(buildJailbreakEvalArgs(selected.prompt)));
  } catch (cause) {
    const error = cause as Error & { code?: number | string; stdout?: string; stderr?: string };
    const exitStatus = typeof error.code === 'number' ? error.code : null;
    const stderr = String(error.stderr ?? '').trim();
    const result: JailbreakEvalResult = {
      schemaVersion: 1,
      runId,
      requestId,
      caseId,
      route: ROUTE,
      mode: 'no-tools',
      startedAt,
      finishedAt: new Date().toISOString(),
      timeoutSeconds: TIMEOUT_SECONDS,
      commandPolicy: { print: true, noSession: true, noTools: true, noLsp: true, arbitraryPrompt: false },
      exitStatus,
      output: String(error.stdout ?? '').trim(),
      error: (stderr || error.message).slice(0, 4000),
      expectedOutput: selected.expectedOutput,
      passed: false,
      attemptId,
    };
    const outcome = error.code === 'ENOENT' ? 'failure' : 'unknown';
    await recordLedgerOutcome(attemptId, outcome, outcome === 'failure' ? 'launcher_not_found' : 'provider_outcome_unknown', result);
    await appendResult(result).catch(() => undefined);
    throw new JailbreakEvalError('Evaluation did not complete successfully.', 502, result);
  }

  const output = stdout.trim();
  const result: JailbreakEvalResult = {
    schemaVersion: 1,
    runId,
    requestId,
    caseId,
    route: ROUTE,
    mode: 'no-tools',
    startedAt,
    finishedAt: new Date().toISOString(),
    timeoutSeconds: TIMEOUT_SECONDS,
    commandPolicy: { print: true, noSession: true, noTools: true, noLsp: true, arbitraryPrompt: false },
    exitStatus: 0,
    output,
    error: null,
    expectedOutput: selected.expectedOutput,
    passed: scoreJailbreakEval(0, output, selected.expectedOutput),
    attemptId,
  };
  await recordLedgerOutcome(attemptId, 'success', result.passed ? 'evaluation_passed' : 'evaluation_failed', result);
  try {
    await appendResult(result);
  } catch (cause) {
    throw new JailbreakEvalError(
      `Evaluation completed but result persistence failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      503,
      result,
    );
  }
  return result;
}
