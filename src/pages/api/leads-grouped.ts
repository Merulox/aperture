import type { APIRoute } from 'astro';
import { getLeadsGrouped } from '../../lib/crm';

export const GET: APIRoute = async () => {
  const groups = await getLeadsGrouped();
  return Response.json(groups, { headers: { 'cache-control': 'no-store' } });
};
