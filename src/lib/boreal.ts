import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const HOME = process.env.HOME ?? '/home/merulox';
const CLIENTS_PATH = join(HOME, '.config/boreal/clients.json');

export interface BorealClient {
  name: string;
  owner: string;
  trade: string;
  city: string;
  business_type: string;
  notes: string;
}

export type ClientRegistry = Record<string, BorealClient>;

export function readClients(): ClientRegistry {
  try {
    return JSON.parse(readFileSync(CLIENTS_PATH, 'utf8')) as ClientRegistry;
  } catch {
    return {};
  }
}

export function writeClients(registry: ClientRegistry): void {
  mkdirSync(join(HOME, '.config/boreal'), { recursive: true });
  writeFileSync(CLIENTS_PATH, JSON.stringify(registry, null, 2));
}

export function addClient(phone: string, client: BorealClient): void {
  const registry = readClients();
  registry[phone] = client;
  writeClients(registry);
}

export function removeClient(phone: string): boolean {
  const registry = readClients();
  if (!(phone in registry)) return false;
  delete registry[phone];
  writeClients(registry);
  return true;
}

const BOREAL_SERVICES = [
  'missed-call-bot',
  'sms-inbox',
  'sms-webhook',
  'boreal-tunnel',
  'boreal-campaign',
  'boreal-followup',
];

export function getBorealServiceHealth(): { name: string; active: boolean }[] {
  return BOREAL_SERVICES.map((name) => {
    try {
      const out = execFileSync('systemctl', ['--user', 'is-active', name], {
        encoding: 'utf8',
        timeout: 2000,
      }).trim();
      return { name, active: out === 'active' };
    } catch {
      return { name, active: false };
    }
  });
}
