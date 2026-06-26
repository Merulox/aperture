import type { APIRoute } from 'astro';
import { setLeadTags } from '../../lib/crm';

export const POST: APIRoute = async ({ request }) => {
  let body: { phone?: string; tags?: unknown };
  try {
    body = await request.json() as { phone?: string; tags?: unknown };
  } catch {
    return Response.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!phone) return Response.json({ ok: false, error: 'phone required' }, { status: 400 });

  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [];

  try {
    await setLeadTags(phone, tags);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
};
