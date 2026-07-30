import type { APIRoute } from 'astro';
import { getSignalerPipelineConfig, runSignalerCycleNow, setSignalerPipelineConfig } from '../../lib/signaler';

export const GET: APIRoute = async () => {
  const result = getSignalerPipelineConfig();
  return new Response(JSON.stringify(result), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  let body: { action?: string; enabled?: boolean; intervalHours?: number; maxProposalsPerRun?: number };
  try {
    body = await request.json() as typeof body;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid JSON' }), { status: 400 });
  }

  try {
    if (body.action === 'run_now') {
      const result = await runSignalerCycleNow();
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    const update: { enabled?: boolean; intervalHours?: number; maxProposalsPerRun?: number } = {};
    if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
    if (typeof body.intervalHours === 'number') {
      if (!Number.isFinite(body.intervalHours) || body.intervalHours < 1) {
        return new Response(JSON.stringify({ ok: false, error: 'intervalHours must be >= 1' }), { status: 400 });
      }
      update.intervalHours = body.intervalHours;
    }
    if (typeof body.maxProposalsPerRun === 'number') {
      if (!Number.isFinite(body.maxProposalsPerRun) || body.maxProposalsPerRun < 1 || body.maxProposalsPerRun > 20) {
        return new Response(JSON.stringify({ ok: false, error: 'maxProposalsPerRun must be between 1 and 20' }), { status: 400 });
      }
      update.maxProposalsPerRun = body.maxProposalsPerRun;
    }
    if (Object.keys(update).length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'no valid config fields or action provided' }), { status: 400 });
    }

    const result = await setSignalerPipelineConfig(update);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (cause) {
    return new Response(JSON.stringify({ ok: false, error: String(cause) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
};
