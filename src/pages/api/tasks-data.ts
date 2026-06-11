import type { APIRoute } from 'astro';
import { getTaskboardData } from '../../lib/tasks';

export const GET: APIRoute = async () => {
  const data = await getTaskboardData();
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
