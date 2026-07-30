import type { APIRoute } from 'astro';
import { getBorealChatHistory, sendBorealChatMessage } from '../../lib/boreal';

function isResident(value: unknown): value is 'hormozi' | 'ogilvy' {
  return value === 'hormozi' || value === 'ogilvy';
}

export const GET: APIRoute = async ({ url }) => {
  const resident = url.searchParams.get('resident');
  if (!isResident(resident)) {
    return new Response(JSON.stringify({ history: [], error: "resident must be 'hormozi' or 'ogilvy'" }), { status: 400 });
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

  if (!isResident(body.resident)) {
    return new Response(JSON.stringify({ ok: false, error: "resident must be 'hormozi' or 'ogilvy'" }), { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return new Response(JSON.stringify({ ok: false, error: 'text is required' }), { status: 400 });
  }
  if (text.length > 4_000) {
    return new Response(JSON.stringify({ ok: false, error: 'text too long (max 4000 chars)' }), { status: 400 });
  }

  try {
    const result = await sendBorealChatMessage(body.resident, text);
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
