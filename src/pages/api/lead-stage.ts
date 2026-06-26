import type { APIRoute } from 'astro';
import { updateLeadStage } from '../../lib/crm';

const VALID = new Set([
  'RESPONDED', 'BOOKED', 'WON', 'LOST', 'IGNORED', 'SKIPPED',
  'DRAFTED', 'POSTPONED', 'STOP', 'BANNED', 'SENT', 'FROID',
]);

export const POST: APIRoute = async ({ request }) => {
  let body: { phone?: string; stage?: string };
  try {
    body = await request.json() as { phone?: string; stage?: string };
  } catch {
    return Response.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const stage = typeof body.stage === 'string' ? body.stage.trim().toUpperCase() : '';

  if (!phone || !VALID.has(stage)) {
    return Response.json({ ok: false, error: 'phone and valid stage required' }, { status: 400 });
  }

  try {
    await updateLeadStage(phone, stage);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
};
