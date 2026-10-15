import type { APIRoute } from 'astro';
import { rankAttention } from '../../lib/attention';
import { getAttentionInputs } from '../../lib/crm';

// Read-only: derives "what does each lead need from me" from the CRM. Never writes.
export const GET: APIRoute = async () => {
  const items = rankAttention(await getAttentionInputs());
  const counts = { urgent: 0, needs_you: 0, waiting_on_them: 0, scheduled: 0 };
  for (const item of items) counts[item.level] += 1;
  return Response.json({ items, counts, generatedAt: new Date().toISOString() }, {
    headers: { 'cache-control': 'no-store' },
  });
};
