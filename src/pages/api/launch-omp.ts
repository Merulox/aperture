import type { APIRoute } from 'astro';
import { appendFile, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  OMP_CLI,
  OMP_GATEWAY_URL,
  OMP_MODEL,
  OMP_NATIVE,
  OMP_NETWORK,
  OMP_RUNTIME_IMAGE,
  OMP_STATE_ROOT,
  OMP_WORKSPACES_ROOT,
  assertAdapterDependencies,
  finalizeOmpRun,
  intentEvidenceExists,
  listOmpRuns,
  loadOmpIntent,
  updateOmpRun,
  writeOmpRun,
  type OmpRunRecord,
} from '../../lib/omp';
 

const execFileAsync = promisify(execFile);
const PODMAN = '/run/current-system/sw/bin/podman';
const GIT = '/run/current-system/sw/bin/git';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}


export const POST: APIRoute = async ({ request }) => {
  const payload: unknown = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || !('contractPath' in payload) || typeof payload.contractPath !== 'string') {
    return jsonResponse({ error: 'contractPath is required.' }, 400);
  }

  let intent;
  try {
    intent = await loadOmpIntent(payload.contractPath);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
  if (!intent.valid) return jsonResponse({ error: 'Intent contract is invalid.', issues: intent.issues }, 422);
  if (intent.status !== 'ready') return jsonResponse({ error: 'Intent contract must have status: ready.' }, 409);
  if (intent.mode !== 'direct') return jsonResponse({ error: 'The shadow adapter currently supports direct mode only.' }, 409);
  if (intent.model !== OMP_MODEL) return jsonResponse({ error: `The shadow adapter currently permits only ${OMP_MODEL}.` }, 409);

  const runs = await listOmpRuns();
  const evidenceExists = await intentEvidenceExists(intent);
  const priorSuccess = runs.find((run) => run.workId === intent.workId && run.status === 'succeeded');
  if (evidenceExists || priorSuccess) {
    return jsonResponse({ error: `${intent.workId} already has successful evidence.`, runId: priorSuccess?.runId ?? null }, 409);
  }
  const existing = runs.find((run) => run.workId === intent.workId && ['queued', 'running', 'cancelling'].includes(run.status));
  if (existing) return jsonResponse({ error: `${intent.workId} already has an active shadow run.`, runId: existing.runId }, 409);

  try {
    await assertAdapterDependencies();
    const { stdout } = await execFileAsync(GIT, ['-C', intent.repository, 'rev-parse', '--is-inside-work-tree']);
    if (stdout.trim() !== 'true') throw new Error('Intent repository is not a Git work tree.');
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 503);
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const artifactRoot = join(OMP_STATE_ROOT, 'artifacts', runId);
  const workspace = join(OMP_WORKSPACES_ROOT, runId);
  const contractSnapshotPath = join(artifactRoot, 'intent.md');
  const modelConfigPath = join(artifactRoot, 'models.yml');
  const logPath = join(artifactRoot, 'omp.jsonl');
  const errorLogPath = join(artifactRoot, 'omp.stderr.log');
  const diffPath = join(artifactRoot, 'changes.patch');
  const containerName = `aperture-omp-run-${runId.slice(0, 12)}`;

  try {
    await mkdir(artifactRoot, { recursive: true, mode: 0o700 });
    await mkdir(OMP_WORKSPACES_ROOT, { recursive: true, mode: 0o700 });
    await execFileAsync(GIT, ['clone', '--local', '--no-hardlinks', intent.repository, workspace], { maxBuffer: 16 * 1024 * 1024 });
    await writeFile(contractSnapshotPath, await readFile(intent.contractPath, 'utf8'), { encoding: 'utf8', mode: 0o400 });
    await writeFile(modelConfigPath, [
      'providers:',
      '  openai-codex:',
      `    baseUrl: ${OMP_GATEWAY_URL}`,
      '    apiKey: isolated-shadow-gateway',
      '    transport: pi-native',
      '',
    ].join('\n'), { encoding: 'utf8', mode: 0o400 });
    await writeFile(logPath, '', { encoding: 'utf8', mode: 0o600 });
    await writeFile(errorLogPath, '', { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    return jsonResponse({ error: `Failed to prepare disposable workspace: ${error instanceof Error ? error.message : String(error)}` }, 500);
  }

  const record: OmpRunRecord = {
    schemaVersion: 1,
    runId,
    workId: intent.workId,
    title: intent.title,
    contractPath: intent.contractPath,
    contractSnapshotPath,
    repository: intent.repository,
    workspace,
    model: intent.model,
    runtimeImage: OMP_RUNTIME_IMAGE,
    runtimeIdentity: `${OMP_RUNTIME_IMAGE}; omp 17.0.5; shadow-v1`,
    networkPolicy: 'gateway-only-internal-network',
    containerName,
    pid: 0,
    status: 'queued',
    exitCode: null,
    startedAt,
    finishedAt: null,
    logPath,
    errorLogPath,
    diffPath,
    sessionId: null,
    stopReason: null,
    finalMessage: null,
    changedPaths: [],
    disallowedPaths: [],
    failureClass: null,
    failureDetail: null,
  };
  await writeOmpRun(record);

  const stdoutHandle = await open(logPath, 'a');
  const stderrHandle = await open(errorLogPath, 'a');
  const args = [
    'run', '--name', containerName,
    '--network', OMP_NETWORK,
    '--read-only', '--cap-drop=all', '--security-opt=no-new-privileges',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m',
    '--tmpfs', '/root:rw,nosuid,nodev,size=384m',
    '-e', 'HOME=/root',
    '-e', 'PATH=/run/current-system/sw/bin:/usr/local/bin:/usr/bin:/bin',
    '-e', `APERTURE_RUN_ID=${runId}`,
    '-v', `${OMP_CLI}:/usr/local/bin/omp:ro`,
    '-v', `${OMP_NATIVE}:/root/.omp/natives/17.0.5/pi_natives.linux-x64-modern.node:ro`,
    '-v', `${modelConfigPath}:/root/.omp/agent/models.yml:ro`,
    '-v', `${contractSnapshotPath}:/contract/intent.md:ro`,
    '-v', `${workspace}:/workspace:rw`,
    '-v', '/nix/store:/nix/store:ro',
    '-v', '/run/current-system/sw:/run/current-system/sw:ro',
    OMP_RUNTIME_IMAGE,
    '/usr/local/bin/omp', '-p', '--mode', 'json', '--no-session',
    '--cwd', '/workspace', '--model', intent.model,
    '--approval-mode', 'yolo', '--max-time', '60m',
    '@/contract/intent.md',
    'Execute the attached Kernel v2 intent contract. Stay inside its allowed paths. Return factual completion evidence through the structured OMP run.',
  ];

  let child;
  try {
    child = spawn(PODMAN, args, {
      detached: true,
      stdio: ['ignore', stdoutHandle.fd, stderrHandle.fd],
      env: { ...process.env, APERTURE_RUN_ID: runId },
    });
    await updateOmpRun(runId, (current) => ({ ...current, status: 'running', pid: child.pid ?? 0 }));
  } catch (error) {
    await Promise.all([stdoutHandle.close().catch(() => undefined), stderrHandle.close().catch(() => undefined)]);
    await updateOmpRun(runId, (current) => ({
      ...current,
      status: 'failed',
      finishedAt: new Date().toISOString(),
      failureClass: 'launch_failure',
      failureDetail: error instanceof Error ? error.message : String(error),
    }));
    return jsonResponse({ error: 'Failed to launch isolated OMP worker.', runId }, 500);
  }

  child.once('error', async (error) => {
    await appendFile(errorLogPath, `${error.message}\n`, 'utf8').catch(() => undefined);
    await finalizeOmpRun(runId, null).catch(() => undefined);
  });
  child.once('exit', (exitCode) => void finalizeOmpRun(runId, exitCode).catch(() => undefined));
  child.unref();
  await Promise.all([stdoutHandle.close().catch(() => undefined), stderrHandle.close().catch(() => undefined)]);

  return jsonResponse({ ok: true, runId, pid: child.pid, status: 'running' }, 202);
};
