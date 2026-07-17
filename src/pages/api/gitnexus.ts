import type { APIRoute } from 'astro';
import { getGitnexusStatus } from '../../lib/gitnexus';

export const GET: APIRoute = async () => {
  const status = await getGitnexusStatus();
  return new Response(JSON.stringify(status), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
