import type { APIRoute } from 'astro';
import { setLeadOwnerName } from '../../lib/crm';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const phone = String(body?.phone || '').trim();
  const ownerName = String(body?.owner_name ?? '').trim();
  if (!phone) return new Response(JSON.stringify({ ok: false, error: 'phone required' }), { status: 400 });
  await setLeadOwnerName(phone, ownerName);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
