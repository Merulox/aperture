import type { APIRoute } from 'astro';
import { readSystemResources } from '../../lib/data';

export const GET: APIRoute = async () => {
  const data = await readSystemResources();

  return new Response(JSON.stringify(data), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};
