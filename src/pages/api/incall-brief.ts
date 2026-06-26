import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function getClient(): Anthropic {
  const apiKey = readFileSync(join(homedir(), '.secrets/anthropic-api-key.txt'), 'utf8').trim();
  return new Anthropic({ apiKey });
}

export const POST: APIRoute = async ({ request }) => {
  let body: { phone?: string; name?: string; template?: string; notes?: string; messages?: Array<{ direction: string; body: string }> };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  const name = body.name ?? body.phone ?? '';
  const template = body.template ?? '';
  const notes = body.notes ?? '';
  const messages = body.messages ?? [];

  const context = [
    `Lead: ${name}`,
    template ? `Template / Métier: ${template}` : '',
    notes ? `Notes CRM: ${notes}` : '',
    messages.length
      ? `Historique SMS (${messages.length} msgs): ${messages.slice(-4).map((m) => `${m.direction === 'out' ? 'Nous' : 'Eux'}: ${m.body}`).join(' | ')}`
      : 'Pas de conversation SMS encore.',
  ].filter(Boolean).join('\n');

  const prompt = `Tu es un coach de vente pour Boréal Numérique (agence d'automatisation IA pour PME québécoises).

Donne-moi en 3 blocs séparés par "---":

BLOC 1 — INTEL ENTREPRISE (5-7 bullets):
Ce que je dois savoir sur ce type d'entreprise avant d'appeler. Douleurs communes, taille typique, comment ils trouvent leurs clients, pourquoi l'automatisation les intéresse.

BLOC 2 — SCRIPT D'APPEL (verbatim):
Ouverture (15 sec), transition vers la douleur (1 question), mini-pitch (20 sec), close vers appel découverte.
Adapte au métier/ville du lead.

BLOC 3 — OBJECTIONS + RÉPONSES:
Top 3 objections probables + réponse de 1-2 phrases chacune.

CONTEXTE:
${context}`;

  try {
    const client = getClient();
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content.find((b) => b.type === 'text')?.text ?? '';
    return Response.json({ ok: true, brief: text });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
};
