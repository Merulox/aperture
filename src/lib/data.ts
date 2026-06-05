import { readFile } from 'node:fs/promises';

const HEALTH_PATH = '/home/merulox/obsidian/knowledge/projects/genesis/health.json';
const LIVE_STATE_PATH = '/home/merulox/obsidian/knowledge/projects/genesis/live-state.md';
const VITALS_PATH = '/home/merulox/projects/realm/commons/vitals.json';
const MODE_PATH = '/home/merulox/projects/realm/mode.json';

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

export type DashboardData = {
  health: HealthData;
  genesis: GenesisState;
  vitals: VitalsData;
  mode: {
    current: string;
    goal: string;
  };
};

export async function getDashboardData(): Promise<DashboardData> {
  const [health, liveState, vitals, mode] = await Promise.all([
    readJson<HealthData>(HEALTH_PATH),
    readLiveState(),
    readJson<VitalsData>(VITALS_PATH),
    readJson<ModeData>(MODE_PATH),
  ]);

  return {
    health,
    genesis: liveState,
    vitals,
    mode: {
      current: mode.current,
      goal: mode.modes[mode.current]?.goal ?? '—',
    },
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
