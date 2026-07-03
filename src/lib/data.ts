import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const RESOURCE_ALERT_STATE_PATH = '/home/merulox/.cache/aperture-resource-alert.json';
const RESOURCE_ALERT_COOLDOWN_MS = 15 * 60 * 1000;
const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const BACKUP_REPOSITORY = 'Cloudflare R2 / navi-backup';
const BACKUP_REPOSITORY_URL =
  's3:https://85fd3bf83c5ee32ce2e3353fa0a58409.r2.cloudflarestorage.com/navi-backup';
const BACKUP_ROOTS = ['/etc/nixos', '/home/merulox'];
const BACKUP_EXCLUDES = [
  '/home/merulox/games',
  '/home/merulox/torrenting',
  '/home/merulox/Downloads',
  '/home/merulox/ISOs',
  '/home/merulox/plex',
  '/home/merulox/media',
  '/home/merulox/videos',
  '/home/merulox/.local/share/Steam',
  '/home/merulox/.local/share/PrismLauncher',
  '/home/merulox/.local/share/bottles',
  '/home/merulox/.local/share/lutris',
  '/home/merulox/.local/share/flatpak',
  '/home/merulox/.local/share/osu',
  '/home/merulox/.local/share/Trash',
  '/home/merulox/.local/share/containers',
  '/home/merulox/.local/share/baloo',
  '*/node_modules',
  '*/__pycache__',
  '*/.venv',
];

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

export type SystemProcess = {
  pid: number;
  ppid: number;
  user: string;
  stat: string;
  cpu: number;
  memPercent: number;
  rssBytes: number;
  swapBytes: number;
  elapsed: string;
  command: string;
  args: string;
  risk: 'critical' | 'warning' | 'normal';
  reason: string;
  manageable: boolean;
};

export type SwapGroup = {
  command: string;
  count: number;
  swapBytes: number;
  rssBytes: number;
};

export type SystemResources = {
  ts: string;
  memory: {
    totalBytes: number;
    availableBytes: number;
    usedBytes: number;
    pressurePercent: number;
  };
  swap: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    pressurePercent: number;
    top: SystemProcess[];
    byCommand: SwapGroup[];
  };
  pressure: {
    cpuSome: number | null;
    memorySome: number | null;
    memoryFull: number | null;
    ioSome: number | null;
    ioFull: number | null;
  };
  alert: ResourceAlert;
  top: SystemProcess[];
  flagged: SystemProcess[];
};

export type ResourceAlert = {
  level: 'normal' | 'warning' | 'critical';
  reasons: string[];
  summary: string;
};

export type BackupStatus = {
  lastRun: string;
  nextRun: string;
  ok: boolean;
  exitCode: number | null;
  repository: string;
  repositoryUrl: string;
  roots: string[];
  excludes: string[];
  recentSnapshots: BackupSnapshot[];
};

export type BackupSnapshot = {
  id: string;
  started: string;
  ended: string;
  paths: string[];
  files: number | null;
  bytes: number | null;
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
  backup: BackupStatus;
  system: SystemResources;
};

export async function getDashboardData(): Promise<DashboardData> {
  const [health, liveState, vitals, mode, monitor, system] = await Promise.all([
    readJson<HealthData>(HEALTH_PATH),
    readLiveState(),
    readJson<VitalsData>(VITALS_PATH),
    readJson<ModeData>(MODE_PATH),
    readMonitorData(),
    readSystemResources(),
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
    backup: readBackupStatus(),
    system,
  };
}

export function readProcessSnapshot(): SystemProcess[] {
  try {
    const swapByPid = readSwapByPid();
    const out = execFileSync(
      'ps',
      ['-eo', 'pid,ppid,user,stat,%cpu,%mem,rss,etime,comm,args', '--sort=-rss'],
      { encoding: 'utf8', timeout: 3000, maxBuffer: 2 * 1024 * 1024 },
    );

    return out
      .split('\n')
      .slice(1)
      .map((row) => parseProcessRow(row, swapByPid))
      .filter((process): process is SystemProcess => process !== undefined);
  } catch {
    return [];
  }
}

export function findManageableProcess(pid: number): SystemProcess | undefined {
  return readProcessSnapshot().find((process) => process.pid === pid && process.manageable);
}

export async function readSystemResources(): Promise<SystemResources> {
  const memory = await readMeminfo();
  const pressure = readPressure();
  const processes = readProcessSnapshot();
  const swapTop = processes
    .filter((process) => process.swapBytes > 0)
    .sort((a, b) => b.swapBytes - a.swapBytes)
    .slice(0, 16);
  const swapByCommand = groupSwapByCommand(processes).slice(0, 12);
  const flagged = processes
    .filter((process) => process.risk !== 'normal')
    .sort(
      (a, b) =>
        riskRank(a.risk) - riskRank(b.risk) ||
        b.swapBytes - a.swapBytes ||
        b.rssBytes - a.rssBytes,
    )
    .slice(0, 12);

  memory.swap.top = swapTop;
  memory.swap.byCommand = swapByCommand;
  const alert = classifyResourceAlert(memory, pressure);
  maybeSendResourceAlert(alert, memory.swap.byCommand, swapTop);

  return {
    ts: new Date().toLocaleString('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    memory,
    swap: memory.swap,
    pressure,
    alert,
    top: processes.slice(0, 12),
    flagged,
  };
}

function classifyResourceAlert(
  memory: Awaited<ReturnType<typeof readMeminfo>>,
  pressure: SystemResources['pressure'],
): ResourceAlert {
  const reasons: string[] = [];
  let level: ResourceAlert['level'] = 'normal';

  const mark = (next: ResourceAlert['level'], reason: string) => {
    reasons.push(reason);
    if (next === 'critical' || (next === 'warning' && level === 'normal')) {
      level = next;
    }
  };

  if (memory.totalBytes > 0) {
    if (memory.availableBytes <= 768 * MIB || memory.pressurePercent >= 97) {
      mark('critical', `RAM critical: ${formatBytes(memory.availableBytes)} available`);
    } else if (memory.availableBytes <= 2 * GIB || memory.pressurePercent >= 92) {
      mark('warning', `RAM low: ${formatBytes(memory.availableBytes)} available`);
    }
  }

  if (memory.swap.totalBytes > 0) {
    if (memory.swap.freeBytes <= 256 * MIB || memory.swap.pressurePercent >= 98) {
      mark('critical', `swap critical: ${formatBytes(memory.swap.freeBytes)} free`);
    } else if (memory.swap.freeBytes <= GIB || memory.swap.pressurePercent >= 90) {
      mark('warning', `swap low: ${formatBytes(memory.swap.freeBytes)} free`);
    }
  }

  if ((pressure.memoryFull ?? 0) >= 5) {
    mark('critical', `memory stall critical: full avg60 ${pressure.memoryFull}`);
  } else if ((pressure.memoryFull ?? 0) >= 1 || (pressure.memorySome ?? 0) >= 20) {
    mark('warning', `memory pressure elevated: some avg60 ${pressure.memorySome ?? 'n/a'}`);
  }

  return {
    level,
    reasons,
    summary: reasons.length ? reasons.join(' · ') : 'resources normal',
  };
}

function maybeSendResourceAlert(
  alert: ResourceAlert,
  swapGroups: SwapGroup[],
  swapTop: SystemProcess[],
) {
  if (alert.level === 'normal') {
    writeResourceAlertState({ level: 'normal', sentAt: 0 });
    return;
  }

  const now = Date.now();
  const state = readResourceAlertState();
  if (state.level === alert.level && now - state.sentAt < RESOURCE_ALERT_COOLDOWN_MS) return;

  const swapOffenders = swapGroups
    .slice(0, 3)
    .map((group) => `${group.command} ${formatBytes(group.swapBytes)}`)
    .join(', ');
  const processHint = swapTop
    .find((process) => process.manageable)
    ? `Open Aperture swap composition and terminate a manageable top swapped process if it is expendable.`
    : `Open Aperture swap composition to inspect top swapped processes.`;
  const body = [
    alert.summary,
    swapOffenders ? `Top swap: ${swapOffenders}` : 'No per-process swap attribution available.',
    processHint,
  ].join('\n');

  const urgency = alert.level === 'critical' ? 'critical' : 'normal';
  const title = alert.level === 'critical' ? 'Memory/swap critical' : 'Memory/swap warning';

  tryNotify(['dunstify', '-u', urgency, '-a', 'Aperture', title, body]) ||
    tryNotify(['notify-send', '-u', urgency, '-a', 'Aperture', title, body]);
  writeResourceAlertState({ level: alert.level, sentAt: now });
}

function readResourceAlertState(): { level: ResourceAlert['level']; sentAt: number } {
  try {
    const state = JSON.parse(readFileSync(RESOURCE_ALERT_STATE_PATH, 'utf8')) as {
      level?: ResourceAlert['level'];
      sentAt?: number;
    };
    return {
      level: state.level ?? 'normal',
      sentAt: state.sentAt ?? 0,
    };
  } catch {
    return { level: 'normal', sentAt: 0 };
  }
}

function writeResourceAlertState(state: { level: ResourceAlert['level']; sentAt: number }) {
  try {
    mkdirSync('/home/merulox/.cache', { recursive: true });
    writeFileSync(RESOURCE_ALERT_STATE_PATH, JSON.stringify(state));
  } catch {
    // Alert state is best-effort only; resource reporting must never fail on it.
  }
}

function tryNotify(args: string[]): boolean {
  try {
    execFileSync(args[0], args.slice(1), {
      timeout: 3000,
      stdio: 'ignore',
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ':0',
      },
    });
    return true;
  } catch {
    return false;
  }
}

function parseProcessRow(row: string, swapByPid: Map<number, number>): SystemProcess | undefined {
  const match = row.trim().match(
    /^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/,
  );
  if (!match) return undefined;

  const [, pidText, ppidText, user, stat, cpuText, memText, rssText, elapsed, command, args] = match;
  const pid = Number(pidText);
  const ppid = Number(ppidText);
  const cpu = Number(cpuText);
  const memPercent = Number(memText);
  const rssBytes = Number(rssText) * 1024;
  const swapBytes = swapByPid.get(pid) ?? 0;
  const fullArgs = args || command;
  const lower = `${command} ${fullArgs}`.toLowerCase();
  const isTranscription = lower.includes('whisper') || lower.includes('brain-ingest');
  const isHeavyMemory = rssBytes >= 1024 * 1024 * 1024 || memPercent >= 5;
  const isHeavySwap = swapBytes >= 512 * 1024 * 1024;
  const isHeavyCpu = cpu >= 100;
  const isLongLivedBusy = cpu >= 25 && elapsed.includes('-');
  const risk =
    isTranscription || isHeavyMemory || isHeavySwap || isHeavyCpu
      ? 'critical'
      : isLongLivedBusy || cpu >= 15 || rssBytes >= 512 * 1024 * 1024 || swapBytes > 0
        ? 'warning'
        : 'normal';
  const reason = isTranscription
    ? 'transcription job'
    : isHeavySwap
      ? 'high swap'
    : isHeavyMemory
      ? 'high memory'
      : isHeavyCpu
        ? 'multi-core CPU'
        : isLongLivedBusy
          ? 'long-lived CPU'
          : cpu >= 15
            ? 'CPU'
            : rssBytes >= 512 * 1024 * 1024
              ? 'memory'
              : swapBytes > 0
                ? 'swap'
              : 'normal';

  return {
    pid,
    ppid,
    user,
    stat,
    cpu,
    memPercent,
    rssBytes,
    swapBytes,
    elapsed,
    command,
    args: fullArgs,
    risk,
    reason,
    manageable: user === 'merulox' && pid !== process.pid,
  };
}

async function readMeminfo() {
  const fallback = {
    totalBytes: 0,
    availableBytes: 0,
    usedBytes: 0,
    pressurePercent: 0,
    swap: {
      totalBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      pressurePercent: 0,
      top: [],
      byCommand: [],
    },
  };

  try {
    const contents = await readFile('/proc/meminfo', 'utf8');
    const values = Object.fromEntries(
      contents.split('\n').flatMap((line) => {
        const match = line.match(/^([A-Za-z_()]+):\s+(\d+)\s+kB/);
        return match ? [[match[1], Number(match[2]) * 1024]] : [];
      }),
    ) as Record<string, number>;

    const totalBytes = values.MemTotal ?? 0;
    const availableBytes = values.MemAvailable ?? values.MemFree ?? 0;
    const usedBytes = Math.max(0, totalBytes - availableBytes);
    const swapTotal = values.SwapTotal ?? 0;
    const swapFree = values.SwapFree ?? 0;
    const swapUsed = Math.max(0, swapTotal - swapFree);

    return {
      totalBytes,
      availableBytes,
      usedBytes,
      pressurePercent: percent(usedBytes, totalBytes),
      swap: {
        totalBytes: swapTotal,
        freeBytes: swapFree,
        usedBytes: swapUsed,
        pressurePercent: percent(swapUsed, swapTotal),
        top: [],
        byCommand: [],
      },
    };
  } catch {
    return fallback;
  }
}

function readSwapByPid(): Map<number, number> {
  const result = new Map<number, number>();

  try {
    for (const entry of readdirSync('/proc', { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
      try {
        const status = readFileSync(`/proc/${entry.name}/status`, 'utf8');
        const match = status.match(/^VmSwap:\s+(\d+)\s+kB/m);
        const swapKb = match ? Number(match[1]) : 0;
        if (swapKb > 0) result.set(Number(entry.name), swapKb * 1024);
      } catch {
        // Processes can exit while the snapshot is being assembled.
      }
    }
  } catch {
    return result;
  }

  return result;
}

function groupSwapByCommand(processes: SystemProcess[]): SwapGroup[] {
  const groups = new Map<string, SwapGroup>();

  for (const process of processes) {
    if (process.swapBytes <= 0) continue;
    const current =
      groups.get(process.command) ??
      ({
        command: process.command,
        count: 0,
        swapBytes: 0,
        rssBytes: 0,
      } satisfies SwapGroup);
    current.count += 1;
    current.swapBytes += process.swapBytes;
    current.rssBytes += process.rssBytes;
    groups.set(process.command, current);
  }

  return [...groups.values()].sort((a, b) => b.swapBytes - a.swapBytes);
}

function readPressure(): SystemResources['pressure'] {
  return {
    cpuSome: readPressureValue('/proc/pressure/cpu', 'some'),
    memorySome: readPressureValue('/proc/pressure/memory', 'some'),
    memoryFull: readPressureValue('/proc/pressure/memory', 'full'),
    ioSome: readPressureValue('/proc/pressure/io', 'some'),
    ioFull: readPressureValue('/proc/pressure/io', 'full'),
  };
}

function readPressureValue(path: string, kind: 'some' | 'full'): number | null {
  try {
    const line = execFileSync('grep', [kind, path], { encoding: 'utf8', timeout: 1000 });
    const match = line.match(/avg60=([\d.]+)/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function percent(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const precision = size >= 10 || unit === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unit]}`;
}

function riskRank(risk: SystemProcess['risk']): number {
  if (risk === 'critical') return 0;
  if (risk === 'warning') return 1;
  return 2;
}

function readBackupStatus(): BackupStatus {
  const fallback: BackupStatus = {
    lastRun: 'unknown',
    nextRun: 'unknown',
    ok: true,
    exitCode: null,
    repository: BACKUP_REPOSITORY,
    repositoryUrl: BACKUP_REPOSITORY_URL,
    roots: BACKUP_ROOTS,
    excludes: BACKUP_EXCLUDES,
    recentSnapshots: [],
  };

  try {
    const timerOut = execSync(
      'systemctl --user show backup-r2.timer --property=LastTriggerUSec,NextElapseUSecRealtime',
      { encoding: 'utf8', timeout: 3000 },
    );
    const svcOut = execSync(
      'systemctl --user show backup-r2.service --property=ExecMainStatus,ActiveEnterTimestamp',
      { encoding: 'utf8', timeout: 3000 },
    );

    const lines = [...timerOut.split('\n'), ...svcOut.split('\n')];
    const props = Object.fromEntries(
      lines
        .filter((line) => line.includes('='))
        .map((line) => line.split('=', 2) as [string, string]),
    );

    const exitCode = props.ExecMainStatus ? Number(props.ExecMainStatus) : null;

    return {
      lastRun: parseSystemdTime(props.LastTriggerUSec ?? '0'),
      nextRun: parseSystemdTime(props.NextElapseUSecRealtime ?? '0'),
      ok: exitCode === null || exitCode === 0,
      exitCode,
      repository: BACKUP_REPOSITORY,
      repositoryUrl: BACKUP_REPOSITORY_URL,
      roots: BACKUP_ROOTS,
      excludes: BACKUP_EXCLUDES,
      recentSnapshots: readRecentBackupSnapshots(),
    };
  } catch {
    return {
      ...fallback,
      recentSnapshots: readRecentBackupSnapshots(),
    };
  }
}

function readRecentBackupSnapshots(): BackupSnapshot[] {
  try {
    const out = execFileSync(
      'bash',
      [
        '-lc',
        [
          'source ~/.secrets/r2-credentials',
          `export RESTIC_REPOSITORY=${BACKUP_REPOSITORY_URL}`,
          'export RESTIC_PASSWORD_FILE=/home/merulox/.secrets/restic-password',
          'restic snapshots --json',
        ].join('\n'),
      ],
      { encoding: 'utf8', timeout: 12_000, maxBuffer: 16 * 1024 * 1024 },
    );
    const snapshots = JSON.parse(out) as Array<{
      id?: string;
      short_id?: string;
      time?: string;
      paths?: string[];
      summary?: {
        backup_end?: string;
        total_files_processed?: number;
        total_bytes_processed?: number;
      };
    }>;

    return snapshots
      .filter((snapshot) => snapshot.time)
      .sort((a, b) => new Date(b.time ?? 0).getTime() - new Date(a.time ?? 0).getTime())
      .slice(0, 8)
      .map((snapshot) => ({
        id: snapshot.short_id ?? snapshot.id?.slice(0, 8) ?? 'unknown',
        started: formatDateTime(snapshot.time),
        ended: formatDateTime(snapshot.summary?.backup_end),
        paths: snapshot.paths ?? [],
        files: snapshot.summary?.total_files_processed ?? null,
        bytes: snapshot.summary?.total_bytes_processed ?? null,
      }));
  } catch {
    return [];
  }
}

function parseSystemdTime(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '0' || trimmed === 'n/a') return 'never';

  const numeric = Number(trimmed);
  if (numeric) return formatDateTime(new Date(numeric / 1000).toISOString());

  const withoutWeekday = trimmed.replace(/^[A-Z][a-z]{2}\s+/, '');
  const normalized = withoutWeekday.replace(/\s(EDT|EST)$/, '');
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${year}-${month}-${day}, ${hour}:${minute}`;
  }

  return trimmed;
}

function formatDateTime(value?: string): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
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
