import type { APIRoute } from 'astro';
import { readClients, addClient, removeClient, getBorealServiceHealth } from '../../lib/boreal';
import type { BorealClient } from '../../lib/boreal';

export const GET: APIRoute = async () => {
  const clients = readClients();
  const services = getBorealServiceHealth();
  return new Response(JSON.stringify({ clients, services }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  let body: { phone?: string } & Partial<BorealClient>;
  try {
    body = await request.json() as { phone?: string } & Partial<BorealClient>;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
  }

  const phone = (body.phone ?? '').trim();
  if (!phone.match(/^\+\d{7,15}$/)) {
    return new Response(JSON.stringify({ error: 'phone must be E.164 format e.g. +15141234567' }), { status: 400 });
  }

  const client: BorealClient = {
    name: (body.name ?? '').trim(),
    owner: (body.owner ?? '').trim(),
    trade: (body.trade ?? '').trim(),
    city: (body.city ?? '').trim(),
    business_type: (body.business_type ?? '').trim(),
    notes: (body.notes ?? '').trim(),
  };

  if (!client.name) {
    return new Response(JSON.stringify({ error: 'name is required' }), { status: 400 });
  }

  addClient(phone, client);
  return new Response(JSON.stringify({ ok: true, phone, client }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

export const DELETE: APIRoute = async ({ request }) => {
  let body: { phone?: string };
  try {
    body = await request.json() as { phone?: string };
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
  }

  const phone = (body.phone ?? '').trim();
  if (!phone) {
    return new Response(JSON.stringify({ error: 'phone required' }), { status: 400 });
  }

  const removed = removeClient(phone);
  if (!removed) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  }

  return new Response(JSON.stringify({ ok: true, removed: phone }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
