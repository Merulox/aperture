import type { APIRoute } from 'astro';
import { getLeadNotes, saveLeadNotes } from '../../lib/crm';

export const GET: APIRoute = async ({ url }) => {
  const phone = url.searchParams.get('phone') ?? '';
  if (!phone) return Response.json({ ok: false, error: 'phone required' }, { status: 400 });
  return Response.json({ ok: true, notes: getLeadNotes(phone) });
};

export const POST: APIRoute = async ({ request }) => {
  let body: { phone?: string; notes?: string };
  try {
    body = await request.json() as { phone?: string; notes?: string };
  } catch {
    return Response.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes : '';
  if (!phone) return Response.json({ ok: false, error: 'phone required' }, { status: 400 });

  try {
    saveLeadNotes(phone, notes);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
};
