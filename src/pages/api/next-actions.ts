import type { APIRoute } from 'astro';
import { getNextActions } from '../../lib/actions';

export const GET: APIRoute = async () => {
  return Response.json(await getNextActions(), {
    headers: { 'cache-control': 'no-store' },
  });
};
