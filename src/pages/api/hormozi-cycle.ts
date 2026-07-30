import type { APIRoute } from 'astro';
import {
  getHormoziCycleState,
  resolveHormoziOperatorAction,
  runHormoziCycleNow,
  setHormoziCycleConfig,
} from '../../lib/boreal';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

export const GET: APIRoute = async () => json(getHormoziCycleState());

export const POST: APIRoute = async ({ request }) => {
  let body: {
    action?: string;
    actionId?: number;
    status?: 'done' | 'dismissed';
    enabled?: boolean;
    intervalHours?: number;
    maxActionsPerRun?: number;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json({ ok: false, error: 'invalid JSON' }, 400);
  }

  try {
    if (body.action === 'run_now') {
      const result = await runHormoziCycleNow();
      return json(result, result.ok ? 200 : 502);
    }
    if (body.action === 'resolve') {
      if (!Number.isInteger(body.actionId) || (body.actionId ?? 0) < 1) {
        return json({ ok: false, error: 'actionId must be a positive integer' }, 400);
      }
      if (body.status !== 'done' && body.status !== 'dismissed') {
        return json({ ok: false, error: "status must be 'done' or 'dismissed'" }, 400);
      }
      const result = await resolveHormoziOperatorAction(body.actionId!, body.status);
      return json(result, result.ok ? 200 : 409);
    }

    const update: {
      enabled?: boolean;
      intervalHours?: number;
      maxActionsPerRun?: number;
    } = {};
    if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
    if (body.intervalHours !== undefined) {
      if (!Number.isInteger(body.intervalHours) || body.intervalHours < 1 || body.intervalHours > 168) {
        return json({ ok: false, error: 'intervalHours must be an integer between 1 and 168' }, 400);
      }
      update.intervalHours = body.intervalHours;
    }
    if (body.maxActionsPerRun !== undefined) {
      if (!Number.isInteger(body.maxActionsPerRun) || body.maxActionsPerRun < 1 || body.maxActionsPerRun > 10) {
        return json({ ok: false, error: 'maxActionsPerRun must be an integer between 1 and 10' }, 400);
      }
      update.maxActionsPerRun = body.maxActionsPerRun;
    }
    if (Object.keys(update).length === 0) {
      return json({ ok: false, error: 'no valid config fields or action provided' }, 400);
    }

    const result = await setHormoziCycleConfig(update);
    return json(result, result.ok ? 200 : 502);
  } catch (cause) {
    return json({ ok: false, error: String(cause) }, 502);
  }
};
