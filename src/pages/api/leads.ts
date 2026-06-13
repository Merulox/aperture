import type { APIRoute } from 'astro';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getLeads } from '../../lib/crm';

const GATEWAY_PATH = join(homedir(), 'scripts/boreal-send');

export const GET: APIRoute = async () => {
  const [leads, gatewayInstalled] = await Promise.all([
    getLeads(),
    access(GATEWAY_PATH).then(() => true).catch(() => false),
  ]);
  return Response.json({ leads, gatewayInstalled }, {
    headers: { 'cache-control': 'no-store' },
  });
};
