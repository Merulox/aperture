import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import {
  finalizeOmpRun,
  listOmpRuns,
  parseOmpOutput,
  readOmpRun,
  updateOmpRun,
  type OmpRunRecord,
} from '../../lib/omp';

const execFileAsync = promisify(execFile);
const PODMAN = '/run/current-system/sw/bin/podman';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function reconcileRun(run: OmpRunRecord): Promise<void> {
  if (!['queued', 'running', 'cancelling'].includes(run.status)) return;
  try {
    const { stdout } = await execFileAsync(PODMAN, [
      'inspect', '--format', '{{.State.Running}} {{.State.ExitCode}}', run.containerName,
    ]);
    const [running, exitCode] = stdout.trim().split(/\s+/);
    if (running === 'false') await finalizeOmpRun(run.runId, Number(exitCode));
  } catch {
    const current = await readOmpRun(run.runId);
    if (current.status === 'cancelling') return;
    const output = await parseOmpOutput(run.logPath);
    await updateOmpRun(run.runId, (record) => !['queued', 'running'].includes(record.status) ? record : {
      ...record,
      status: 'failed',
      finishedAt: record.finishedAt ?? new Date().toISOString(),
      sessionId: output.sessionId,
      stopReason: output.stopReason,
      finalMessage: output.finalMessage,
      failureClass: 'missing_runtime',
      failureDetail: 'The recorded worker container no longer exists, so its exit status cannot be proven.',
    });
  }
}

export const GET: APIRoute = async () => {
  const before = await listOmpRuns();
  await Promise.all(before.map(reconcileRun));
  const runs = (await listOmpRuns()).map((run) => ({
    ...run,
    finalMessage: run.finalMessage?.slice(-4000) ?? null,
  }));
  return jsonResponse({ runs });
};

export const DELETE: APIRoute = async ({ request }) => {
  const payload: unknown = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || !('runId' in payload) || typeof payload.runId !== 'string') {
    return jsonResponse({ error: 'runId is required.' }, 400);
  }

  let run;
  try {
    run = await readOmpRun(payload.runId);
  } catch {
    return jsonResponse({ error: 'Run not found.' }, 404);
  }
  if (!['queued', 'running', 'cancelling'].includes(run.status)) {
    return jsonResponse({ error: `Run is already ${run.status}.` }, 409);
  }
  if (run.status !== 'cancelling') {
    run = await updateOmpRun(run.runId, (current) => ({
      ...current,
      status: 'cancelling',
      failureClass: 'operator_cancelled',
      failureDetail: 'Cancellation requested through the authenticated Aperture shadow-run API.',
    }));
  }

  let stopped = false;
  for (let attempt = 0; attempt < 30 && !stopped; attempt += 1) {
    try {
      await execFileAsync(PODMAN, ['stop', '--time', '10', run.containerName]);
      stopped = true;
    } catch {
      const current = await readOmpRun(run.runId);
      if (!['queued', 'running', 'cancelling'].includes(current.status)) return jsonResponse({ run: current });
      await delay(100);
    }
  }
  if (!stopped) {
    const current = await readOmpRun(run.runId);
    if (!['queued', 'running', 'cancelling'].includes(current.status)) return jsonResponse({ run: current });
    return jsonResponse({ error: 'Worker container could not be stopped; cancellation remains pending.', run: current }, 500);
  }

  let exitCode: number | null = null;
  try {
    const { stdout } = await execFileAsync(PODMAN, ['inspect', '--format', '{{.State.ExitCode}}', run.containerName]);
    exitCode = Number(stdout.trim());
  } catch {
    // The detached launch listener may already have finalized and removed the container.
  }
  await finalizeOmpRun(run.runId, exitCode);
  await execFileAsync(PODMAN, ['rm', run.containerName]).catch(() => undefined);
  return jsonResponse({ run: await readOmpRun(run.runId) });
};
