import type { APIRoute } from 'astro';
import {
  CityGenesisError,
  enqueueGenesisMessage,
  readGenesisSnapshot,
  startGenesisWake,
} from '../../lib/city-genesis';

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

export const GET: APIRoute = async () => json(await readGenesisSnapshot());

export const POST: APIRoute = async ({ request }) => {
  const payload: unknown = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json({ error: 'A JSON object is required.' }, 400);
  }
  const command = payload as Record<string, unknown>;
  try {
    if (command.kind === 'message.send') {
      const receipt = await enqueueGenesisMessage({
        text: command.text,
        context: command.context,
        idempotencyKey: command.idempotencyKey,
      });
      return json(receipt, receipt.created ? 202 : 200);
    }
    if (command.kind === 'resident.wake') {
      const receipt = await startGenesisWake({
        eventId: command.eventId,
        idempotencyKey: command.idempotencyKey,
      });
      return json(receipt, receipt.created ? 202 : 200);
    }
    return json({ error: 'kind must be message.send or resident.wake.' }, 400);
  } catch (cause) {
    if (cause instanceof CityGenesisError) return json({ error: cause.message }, cause.status);
    console.error('city-genesis command failed', cause);
    return json({ error: 'Genesis command failed unexpectedly.' }, 500);
  }
};
