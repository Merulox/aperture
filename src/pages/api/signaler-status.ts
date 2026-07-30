import type { APIRoute } from 'astro';
import { getSignalerStatus } from '../../lib/signaler';

export const GET: APIRoute = async () => {
  const status = getSignalerStatus();
  return new Response(JSON.stringify(status), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
