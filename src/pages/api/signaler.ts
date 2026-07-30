import type { APIRoute } from 'astro';
import { getSignalerProposals, reviewSignalerProposal } from '../../lib/signaler';

export const GET: APIRoute = async () => {
  const proposals = getSignalerProposals();
  return new Response(JSON.stringify(proposals), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  let body: { actionId?: number; decision?: string; note?: string };
  try {
    body = await request.json() as { actionId?: number; decision?: string; note?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid JSON' }), { status: 400 });
  }

  const actionId = Number(body.actionId);
  if (!Number.isInteger(actionId) || actionId <= 0) {
    return new Response(JSON.stringify({ ok: false, error: 'actionId must be a positive integer' }), { status: 400 });
  }
  if (body.decision !== 'approved' && body.decision !== 'declined') {
    return new Response(JSON.stringify({ ok: false, error: "decision must be 'approved' or 'declined'" }), { status: 400 });
  }

  const result = reviewSignalerProposal(actionId, body.decision, (body.note ?? '').trim());
  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 409,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
