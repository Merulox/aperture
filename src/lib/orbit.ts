import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();
const ORBIT_LOOPS = join(HOME, 'projects/orbit/loops');
const ORBIT_FROZEN = join(HOME, '.orbit-frozen');
const ORBIT_EVENTS = join(HOME, 'projects/orbit/events.jsonl');

export interface LoopTick {
  tick_id: string;
  ts: string;
  dur_s: number;
  ok: boolean;
  err: string | null;
  in_tokens: number;
  cache_new?: number;
  cache_read?: number;
  out_tokens: number;
  model: string;
  prompt_hash: string;
  dry_run: boolean;
  blocks: Record<string, number>;
}

export interface PendingAsk {
  id: string;
  question: string;
  asked_ts: number;
  policy: string;
  timeout_hours: number;
  answer?: string;
}

export interface LoopState {
  pace: string;
  consecutive_failures: number;
  pending_asks: PendingAsk[];
  summary: string;
  paused: boolean;
  tokens_today: { date: string; total: number };
  last_tick_ts?: number;
}

export interface LoopSpec {
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | string;
  model: string;
  pace: string;
  active_hours?: string;
  timeout?: number;
}

export interface OrbitLoop {
  name: string;
  spec: LoopSpec;
  state: LoopState;
  lastTick: LoopTick | null;
  recentTicks: LoopTick[];
  tokensToday: number;
  pendingAsks: PendingAsk[];
  nextTickTs: number | null;
  error?: string;
}

export interface OrbitEvent {
  ts: string;
  loop: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface OrbitStatus {
  loops: OrbitLoop[];
  recentEvents: OrbitEvent[];
  frozen: boolean;
  totalAsks: number;
  generatedAt: string;
}

function parseTomlSimple(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) break;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let raw = trimmed.slice(eq + 1).trim();
    let val: string;
    if (raw.startsWith('"') || raw.startsWith("'")) {
      const q = raw[0];
      const end = raw.indexOf(q, 1);
      val = end > 0 ? raw.slice(1, end) : raw.slice(1);
    } else {
      const commentIdx = raw.indexOf(' #');
      val = (commentIdx >= 0 ? raw.slice(0, commentIdx) : raw).trim();
    }
    result[key] = val;
  }
  return result;
}

function paceToSeconds(pace: string): number {
  const n = parseInt(pace, 10);
  return pace.endsWith('h') ? n * 3600 : n * 60;
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as T); } catch {}
  }
  return out;
}

export function getOrbitStatus(): OrbitStatus {
  const loops: OrbitLoop[] = [];

  if (existsSync(ORBIT_LOOPS)) {
    for (const entry of readdirSync(ORBIT_LOOPS, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(ORBIT_LOOPS, entry.name);
      const tomlPath = join(dir, 'loop.toml');
      if (!existsSync(tomlPath)) continue;

      try {
        const parsed = parseTomlSimple(readFileSync(tomlPath, 'utf-8'));
        const spec: LoopSpec = {
          name: parsed.name || entry.name,
          status: parsed.status || 'DRAFT',
          model: parsed.model || 'unknown',
          pace: parsed.pace || '30m',
          active_hours: parsed.active_hours,
          timeout: parsed.timeout ? parseInt(parsed.timeout, 10) : undefined,
        };

        let state: LoopState = {
          pace: spec.pace,
          consecutive_failures: 0,
          pending_asks: [],
          summary: '',
          paused: false,
          tokens_today: { date: '', total: 0 },
        };
        const statePath = join(dir, 'state.json');
        if (existsSync(statePath)) {
          state = JSON.parse(readFileSync(statePath, 'utf-8')) as LoopState;
        }

        const allTicks = readJsonl<LoopTick>(join(dir, 'ticks.jsonl'));
        const _n = new Date();
        const today = `${_n.getFullYear()}-${String(_n.getMonth() + 1).padStart(2, '0')}-${String(_n.getDate()).padStart(2, '0')}`;
        const tokensToday = allTicks
          .filter(t => t.ts.startsWith(today))
          .reduce((s, t) => s + (t.in_tokens || 0) + (t.cache_new || 0) + (t.out_tokens || 0), 0);

        const lastTick = allTicks.at(-1) ?? null;
        const recentTicks = allTicks.slice(-48);

        const pendingAsks = (state.pending_asks ?? []).filter(a => !a.answer);
        const currentPace = state.pace || spec.pace;
        const nextTickTs = state.last_tick_ts
          ? state.last_tick_ts + paceToSeconds(currentPace)
          : null;

        loops.push({ name: spec.name, spec, state, lastTick, recentTicks, tokensToday, pendingAsks, nextTickTs });
      } catch (e) {
        loops.push({
          name: entry.name,
          spec: { name: entry.name, status: 'ERROR', model: '', pace: '' },
          state: { pace: '', consecutive_failures: 0, pending_asks: [], summary: '', paused: false, tokens_today: { date: '', total: 0 } },
          lastTick: null, recentTicks: [], tokensToday: 0, pendingAsks: [], nextTickTs: null,
          error: String(e),
        });
      }
    }
  }

  const recentEvents = readJsonl<OrbitEvent>(ORBIT_EVENTS).slice(-50);

  return {
    loops,
    recentEvents,
    frozen: existsSync(ORBIT_FROZEN),
    totalAsks: loops.reduce((s, l) => s + l.pendingAsks.length, 0),
    generatedAt: new Date().toISOString(),
  };
}
