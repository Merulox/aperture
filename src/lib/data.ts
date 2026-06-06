import { readFile } from 'node:fs/promises';

const HEALTH_PATH = '/home/merulox/obsidian/knowledge/projects/genesis/health.json';
const LIVE_STATE_PATH = '/home/merulox/obsidian/knowledge/projects/genesis/live-state.md';
// vitals.json was archived 2026-06-05 (stale since April). Kept as historical fallback;
// the live signal is the monitor feed below.
const VITALS_PATH = '/home/merulox/projects/realm/_archive/commons-stale/vitals.json';
const MODE_PATH = '/home/merulox/projects/realm/mode.json';
// LIVE telemetry — the crown jewel (written continuously by realm monitor hooks)
const MONITOR_HEALTH_PATH = '/home/merulox/projects/realm/monitor/service-health.jsonl';
const MONITOR_AUDIT_PATH = '/home/merulox/projects/realm/monitor/genesis-audit.jsonl';

export type HealthStatus =
  | 'ACTIVE'
  | 'OK'
  | 'FROZEN_PIVOT'
  | 'FROZEN'
  | 'CRITICAL'
  | 'ERROR'
  | string;

export type PendingDecision = {
  item: string;
  urgency: string;
  last_raised: string;
};

export type HealthData = {
  tick: number;
  updated: string;
  status: HealthStatus;
  phase: string;
  cost_usd: number;
  cost_limit_usd: number;
  runway_days: number;
  pipeline: {
    sent: number;
    replied: number;
    note?: string;
  };
  pending_decisions: PendingDecision[];
};

export type GenesisState = {
  updated: string;
  tick: number;
  activeRule: string;
  latestEntry: string;
};

export type VitalsData = {
  ts: string;
  realm: {
    agents_active: number;
  };
  logic: {
    critical_failpoints: number;
  };
  knowledge: {
    vault_claims: number;
    open_conflicts: number;
  };
  ambitions: Array<{
    id: string;
    label: string;
    score: number;
  }>;
};

export type ModeData = {
  current: string;
  modes: Record<
    string,
    {
      goal: string;
    }
  >;
};

export type ServiceHealth = {
  service: string;
  status: string;
  ts: string;
  action?: string;
};

export type BugLedgerItem = {
  id: string;
  text: string;
};

type GenesisAudit = {
  ts?: string;
  services?: Record<string, string>;
  kill_switches?: Record<string, boolean | string>;
  pending_items?: string[];
};

export type MonitorData = {
  ts: string;
  services: ServiceHealth[];
  killSwitches: Record<string, boolean | string>;
  pendingItems: BugLedgerItem[];
};

export type DashboardData = {
  health: HealthData;
  genesis: GenesisState;
  vitals: VitalsData;
  mode: {
    current: string;
    goal: string;
  };
  monitor: MonitorData;
};

export async function getDashboardData(): Promise<DashboardData> {
  const [health, liveState, vitals, mode, monitor] = await Promise.all([
    readJson<HealthData>(HEALTH_PATH),
    readLiveState(),
    readJson<VitalsData>(VITALS_PATH),
    readJson<ModeData>(MODE_PATH),
    readMonitorData(),
  ]);

  return {
    health,
    genesis: liveState,
    vitals,
    mode: {
      current: mode.current,
      goal: mode.modes[mode.current]?.goal ?? '—',
    },
    monitor,
  };
}

async function readJson<T>(path: string): Promise<T> {
  const contents = await readFile(path, 'utf8');
  return JSON.parse(contents) as T;
}

async function readLiveState(): Promise<GenesisState> {
  const contents = await readFile(LIVE_STATE_PATH, 'utf8');
  const lines = contents.split(/\r?\n/);

  const updated = matchLine(lines, /^\*\*Updated:\*\*\s*(.+)$/) ?? 'unknown';
  const tickText = matchLine(lines, /^\*\*Tick:\*\*\s*(\d+)$/);
  const activeRule = matchLine(lines, /^\*\*Active rule:\*\*\s*(.+)$/) ?? 'unknown';
  const tick = tickText ? Number(tickText) : 0;
  const tickEntry =
    lines.find((line) => line.startsWith('**Tick ') && line.includes(':**')) ?? '';

  return {
    updated,
    tick,
    activeRule,
    latestEntry: firstSentences(stripTickPrefix(tickEntry), 2),
  };
}

async function readMonitorData(): Promise<MonitorData> {
  const [audit, liveServices] = await Promise.all([
    readLatestJsonLine<GenesisAudit>(MONITOR_AUDIT_PATH),
    readLatestServiceHealth(),
  ]);
  const services = new Map<string, ServiceHealth>();

  for (const [service, status] of Object.entries(audit?.services ?? {})) {
    services.set(service, {
      service,
      status,
      ts: audit?.ts ?? '',
    });
  }

  for (const service of liveServices) {
    services.set(normalizeServiceName(service.service), {
      ...service,
      service: normalizeServiceName(service.service),
    });
  }

  return {
    ts: audit?.ts ?? '',
    services: [...services.values()].sort((a, b) => a.service.localeCompare(b.service)),
    killSwitches: audit?.kill_switches ?? {},
    pendingItems: (audit?.pending_items ?? [])
      .map(parseLedgerItem)
      .filter((item): item is BugLedgerItem => item !== undefined),
  };
}

async function readLatestServiceHealth(): Promise<ServiceHealth[]> {
  const entries = await readJsonLines<ServiceHealth>(MONITOR_HEALTH_PATH);
  const latest = new Map<string, ServiceHealth>();

  for (const entry of entries) {
    if (entry.service && entry.status) {
      latest.set(normalizeServiceName(entry.service), entry);
    }
  }

  return [...latest.values()];
}

async function readLatestJsonLine<T>(path: string): Promise<T | undefined> {
  const entries = await readJsonLines<T>(path);
  return entries.at(-1);
}

async function readJsonLines<T>(path: string): Promise<T[]> {
  try {
    const contents = await readFile(path, 'utf8');
    return contents
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as T];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function normalizeServiceName(service: string): string {
  return service.replace(/\.service$/, '');
}

function parseLedgerItem(row: string): BugLedgerItem | undefined {
  const match = row.match(/^\|\s*([BMVAR]\d+)\s*\|\s*(.*?)\s*\|\s*[^|]*\|$/);
  if (!match) {
    return undefined;
  }

  return {
    id: match[1],
    text: match[2].replace(/\*\*/g, '').replace(/`/g, ''),
  };
}

function matchLine(lines: string[], pattern: RegExp): string | undefined {
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return undefined;
}

function stripTickPrefix(line: string): string {
  return line.replace(/^\*\*Tick\s+\d+\s+\([^)]+\):\*\*\s*/, '').trim();
}

function firstSentences(text: string, count: number): string {
  const matches = text.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (!matches) {
    return text;
  }
  return matches.slice(0, count).join(' ').replace(/\s+/g, ' ').trim();
}
