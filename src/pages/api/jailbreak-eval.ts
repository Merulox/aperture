import type { APIRoute } from 'astro';
import {
  JailbreakEvalError,
  getJailbreakEvalSnapshot,
  parseJailbreakEvalRequest,
  runJailbreakEval,
} from '../../lib/jailbreak-eval';

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

export const GET: APIRoute = async () => json(await getJailbreakEvalSnapshot());

export const POST: APIRoute = async ({ request }) => {
  const body = parseJailbreakEvalRequest(await request.json().catch(() => null));
  if (!body) {
    return json({ error: 'Only string caseId and requestId fields are accepted.' }, 400);
  }

  try {
    return json({ result: await runJailbreakEval(body.caseId, body.requestId) });
  } catch (cause) {
    if (cause instanceof JailbreakEvalError) {
      return json({ error: cause.message, result: cause.result ?? null }, cause.status);
    }
    console.error('jailbreak evaluation failed', cause);
    return json({ error: 'Evaluation failed unexpectedly.' }, 500);
  }
};
