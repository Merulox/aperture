import type { APIRoute } from 'astro';
import { getSignalerChatHistory, sendSignalerChatMessage } from '../../lib/signaler';

export const GET: APIRoute = async () => {
  const history = getSignalerChatHistory();
  return new Response(JSON.stringify(history), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  let body: { text?: string };
  try {
    body = await request.json() as { text?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid JSON' }), { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return new Response(JSON.stringify({ ok: false, error: 'text is required' }), { status: 400 });
  }
  if (text.length > 4_000) {
    return new Response(JSON.stringify({ ok: false, error: 'text too long (max 4000 chars)' }), { status: 400 });
  }

  try {
    const result = await sendSignalerChatMessage(text);
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
