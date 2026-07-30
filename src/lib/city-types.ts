export type GenesisEventStatus = 'queued' | 'running' | 'succeeded' | 'dead_letter';
export type GenesisRunStatus = 'running' | 'succeeded' | 'failed' | 'timed_out';
export type GenesisWakeStatus = 'starting' | 'started' | 'succeeded' | 'failed';

export interface GenesisRunSnapshot {
  id: string;
  attempt: number;
  workerId: string;
  status: GenesisRunStatus;
  model: string | null;
  startedAt: string;
  finishedAt: string | null;
  latencyMs: number | null;
  costUsd: number | null;
  errorCode: string | null;
  errorDetail: string | null;
  result: Record<string, unknown> | null;
}

export interface GenesisTraceSnapshot {
  id: number;
  runId: string;
  sequence: number;
  kind: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface GenesisDeliverySnapshot {
  id: string;
  runId: string;
  kind: 'ack' | 'notification';
  channel: string;
  target: string;
  status: 'pending' | 'sending' | 'sent' | 'dead_letter';
  attempts: number;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  lastError: string | null;
}

export interface GenesisCityEvent {
  id: string;
  idempotencyKey: string;
  source: string;
  sourceId: string | null;
  text: string;
  context: string;
  trust: string;
  status: GenesisEventStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  terminalAt: string | null;
  decision: Record<string, unknown> | null;
  runs: GenesisRunSnapshot[];
  traces: GenesisTraceSnapshot[];
  deliveries: GenesisDeliverySnapshot[];
}

export interface GenesisWakeSnapshot {
  wakeId: string;
  idempotencyKey: string;
  requestedEventId: string;
  status: GenesisWakeStatus;
  startedAt: string;
  finishedAt: string | null;
  runId: string | null;
  exitCode: number | null;
  error: string | null;
}

export interface GenesisCitySnapshot {
  observedAt: string;
  adapter: {
    id: 'genesis-runtime-v2';
    version: '1';
    sourceName: 'Genesis runtime v2';
    health: 'healthy' | 'unavailable' | 'degraded';
    limitation: string;
  };
  resident: {
    id: 'resident:genesis:genesis';
    name: 'Genesis';
    state: 'unavailable' | 'idle' | 'queued' | 'working' | 'attention';
    summary: string;
    blocker: string | null;
  };
  runtime: {
    schemaVersion: string | null;
    events: Record<string, number>;
    runs: Record<string, number>;
    deliveries: Record<string, number>;
  };
  events: GenesisCityEvent[];
  wakes: GenesisWakeSnapshot[];
  error: string | null;
}

export interface GenesisMessageReceipt {
  kind: 'message.send';
  eventId: string;
  created: boolean;
  status: 'queued';
  idempotencyKey: string;
}

export interface GenesisWakeReceipt {
  kind: 'resident.wake';
  eventId: string;
  wakeId: string;
  status: 'starting' | 'started' | 'succeeded' | 'failed';
  created: boolean;
}
