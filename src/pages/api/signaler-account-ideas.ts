import type { APIRoute } from 'astro';
import {
  decideSignalerAccountHandle,
  getSignalerAccountIdeas,
  getSignalerNiches,
  markSignalerAccountCreated,
  proposeSignalerAccountIdea,
} from '../../lib/signaler';

export const GET: APIRoute = async () => {
  const ideas = getSignalerAccountIdeas();
  const niches = getSignalerNiches();
  return new Response(JSON.stringify({
    ideas: ideas.ideas,
    niches: niches.niches,
    error: ideas.error ?? niches.error,
  }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  let body: {
    action?: 'propose' | 'decide' | 'create';
    nicheId?: number; platform?: string; handles?: string[]; bio?: string; notes?: string;
    ideaId?: number; handle?: string;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid JSON' }), { status: 400 });
  }

  let result: { ok: boolean; idea_id?: number; account_id?: number; error?: string };

  if (body.action === 'propose') {
    if (!Number.isInteger(body.nicheId) || (body.nicheId ?? 0) <= 0) {
      return new Response(JSON.stringify({ ok: false, error: 'nicheId must be a positive integer' }), { status: 400 });
    }
    if (!body.platform || !body.platform.trim()) {
      return new Response(JSON.stringify({ ok: false, error: 'platform is required' }), { status: 400 });
    }
    if (!Array.isArray(body.handles) || body.handles.filter((h) => h.trim()).length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'at least one candidate handle is required' }), { status: 400 });
    }
    result = proposeSignalerAccountIdea({
      nicheId: body.nicheId as number, platform: body.platform.trim(),
      handles: body.handles, bio: body.bio ?? '', notes: body.notes,
    });
  } else if (body.action === 'decide') {
    if (!Number.isInteger(body.ideaId) || (body.ideaId ?? 0) <= 0) {
      return new Response(JSON.stringify({ ok: false, error: 'ideaId must be a positive integer' }), { status: 400 });
    }
    if (!body.handle || !body.handle.trim()) {
      return new Response(JSON.stringify({ ok: false, error: 'handle is required' }), { status: 400 });
    }
    result = decideSignalerAccountHandle(body.ideaId as number, body.handle.trim());
  } else if (body.action === 'create') {
    if (!Number.isInteger(body.ideaId) || (body.ideaId ?? 0) <= 0) {
      return new Response(JSON.stringify({ ok: false, error: 'ideaId must be a positive integer' }), { status: 400 });
    }
    result = markSignalerAccountCreated(body.ideaId as number);
  } else {
    return new Response(JSON.stringify({ ok: false, error: "action must be 'propose', 'decide', or 'create'" }), { status: 400 });
  }

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 409,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
