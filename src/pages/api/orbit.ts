import type { APIRoute } from 'astro';
import { getOrbitStatus } from '../../lib/orbit';

export const GET: APIRoute = () => {
  try {
    const data = getOrbitStatus();
    return Response.json(data, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
};
