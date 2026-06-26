import type { APIRoute } from 'astro';

const CC_URL = 'http://localhost:8800/api/followup-preview';
const CC_AUTH = Buffer.from('mrlx.012:XW#nxFneh1#%S$XzwnM9AeDv').toString('base64');

export const GET: APIRoute = async () => {
  try {
    const r = await fetch(CC_URL, {
      headers: { Authorization: `Basic ${CC_AUTH}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return Response.json([], { headers: { 'cache-control': 'no-store' } });
    const data = await r.json() as unknown[];
    return Response.json(data, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json([]);
  }
};
