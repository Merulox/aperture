import type { APIRoute } from 'astro';
import { intentEvidenceExists, listOmpIntents, listOmpRuns } from '../../lib/omp';

export const GET: APIRoute = async () => {
  const [intents, runs] = await Promise.all([listOmpIntents(), listOmpRuns()]);
  const latestByWorkId = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latestByWorkId.has(run.workId)) latestByWorkId.set(run.workId, run);
  }
  const result = await Promise.all(intents.map(async (intent) => {
    const latestRun = latestByWorkId.get(intent.workId);
    const evidenceExists = await intentEvidenceExists(intent);
    const alreadySucceeded = latestRun?.status === 'succeeded' || evidenceExists;
    return {
      ...intent,
      evidenceExists,
      runnable: intent.valid
        && intent.status === 'ready'
        && intent.mode === 'direct'
        && !alreadySucceeded
        && !['queued', 'running', 'cancelling'].includes(latestRun?.status ?? ''),
      latestRunStatus: latestRun?.status ?? null,
      latestRunId: latestRun?.runId ?? null,
    };
  }));

  return new Response(JSON.stringify({ intents: result }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
