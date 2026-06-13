import type { APIRoute } from 'astro';
import { getLeadThread, leadExists } from '../../lib/crm';

const PHONE = /^\+\d{10,15}$/;

export const GET: APIRoute = async ({ url }) => {
  const phone = url.searchParams.get('phone')?.trim() ?? '';
  if (!PHONE.test(phone)) {
    return new Response('A valid E.164 phone number is required.', { status: 400 });
  }
  if (!await leadExists(phone)) {
    return new Response('Lead not found.', { status: 404 });
  }
  return Response.json({ messages: await getLeadThread(phone) }, {
    headers: { 'cache-control': 'no-store' },
  });
};
