import type { APIRoute } from 'astro';
import { getBorealChatHistory, sendBorealChatMessage, type BorealAgentId } from '../../lib/boreal';

// Canonical agent ids (agents/registry.toml in ~/projects/boreal). The City UI still sends its
// old resident keys until its owner migrates it; they are translated here and never persisted.
const PENDING_CITY_KEYS: Record<string, BorealAgentId> = { hormozi: 'sales', ogilvy: 'marketing' };

function toAgentId(value: unknown): BorealAgentId | null {
  if (value === 'sales' || value === 'marketing') return value;
  return typeof value === 'string' && Object.hasOwn(PENDING_CITY_KEYS, value) ? PENDING_CITY_KEYS[value] : null;
}

export const GET: APIRoute = async ({ url }) => {
  const resident = toAgentId(url.searchParams.get('resident'));
  if (!resident) {
    return new Response(JSON.stringify({ history: [], error: "resident must be 'sales' or 'marketing'" }), { status: 400 });
  }
  const history = getBorealChatHistory(resident);
  return new Response(JSON.stringify(history), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  let body: { resident?: string; text?: string };
  try {
    body = await request.json() as { resident?: string; text?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid JSON' }), { status: 400 });
  }

  const resident = toAgentId(body.resident);
  if (!resident) {
    return new Response(JSON.stringify({ ok: false, error: "resident must be 'sales' or 'marketing'" }), { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return new Response(JSON.stringify({ ok: false, error: 'text is required' }), { status: 400 });
  }
  if (text.length > 4_000) {
    return new Response(JSON.stringify({ ok: false, error: 'text too long (max 4000 chars)' }), { status: 400 });
  }

  try {
    const result = await sendBorealChatMessage(resident, text);
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
