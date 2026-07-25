# City Adapter Contracts

## Boundary

Adapters translate source-native state into the City domain and translate a small declared command set back to the source. They do not contain map logic, invent unsupported certainty, or grant new authority.

```ts
interface CityAdapter {
  manifest(): AdapterManifest;
  snapshot(signal: AbortSignal): Promise<AdapterSnapshot>;
  events(cursor: string | null, signal: AbortSignal): AsyncIterable<AdapterEventPage>;
  dispatch?(command: CityCommand, signal: AbortSignal): Promise<DispatchReceipt>;
  reconcile?(receipt: DispatchReceipt, signal: AbortSignal): Promise<ReconciliationResult>;
}
```

## Manifest

```ts
interface AdapterManifest {
  id: string;
  version: string;
  sourceName: string;
  observes: Array<'residents' | 'workers' | 'facilities' | 'projects' | 'work' | 'goals' | 'resources' | 'relationships' | 'approvals' | 'conversations' | 'events'>;
  commands: CommandCapability[];
  freshness: { pollMs: number; agingAfterMs: number; staleAfterMs: number };
  authority: string[];
  limitations: string[];
}

interface CommandCapability {
  kind: 'approval.respond' | 'message.send' | 'resident.wake';
  riskTier: 0 | 1 | 2 | 3;
  requiredAuthority: string[];
  supportsIdempotency: boolean;
  supportsReconciliation: boolean;
}
```

## Snapshot rules

An `AdapterSnapshot` contains normalized entities, source versions, the next event cursor, and adapter health. Rules:

1. A missing source file is `unknown` or `unavailable`, not an empty healthy state.
2. Invalid records are isolated and reported; one malformed entity does not erase valid siblings.
3. Adapters preserve native status and raw references for deliberate reveal.
4. Secret material is redacted before normalization.
5. Model-derived state declares `trust=model_inference`.
6. Every observation includes `observedAt` and a source identifier.

## Event rules

- Events are immutable and deduplicated at ingestion.
- Cursor advancement occurs only after durable City acceptance.
- Event payloads use summaries plus protected raw references.
- An adapter must not synthesize command acknowledgements from optimistic UI state.

## Command rules

- Undeclared commands are rejected.
- Dispatch validates target, source version where applicable, authority, expiry, and idempotency key.
- Arbitrary shell or free-form tool execution is never a City adapter command.
- A command receipt distinguishes `accepted_for_delivery` from `acknowledged_by_source`.
- Retry policy is finite and source-safe.
- Reconciliation is mandatory when the transport cannot provide atomic/idempotent acknowledgement.

## Initial adapters

### Genesis

**Identity:** one persistent resident, `resident:genesis:genesis`.

Observed inputs:

- legacy Genesis live state, identity references, health, heartbeat, goals, and reports;
- runtime v2 SQLite events, runs, traces, deliveries, cost, latency, provenance, retry, and dead-letter state;
- systemd service health;
- future capability-broker declarations.

Normalized outputs:

- Genesis resident and home;
- active/terminal runtime workers;
- mission/objective state;
- compute, capability, memory, attention, artifact, and dependency resources;
- pending approvals and recent trails.

Candidate commands, enabled separately:

- `message.send` to a durable Genesis inbox;
- `resident.wake` as an explicit command;
- `approval.respond` only for Genesis-origin approvals.

Constraints:

- legacy production and runtime v2 remain distinct sources until their own cutover;
- City must reveal which runtime produced an observation;
- runtime v2 is Tier 2 and currently monitor-only; the City cannot silently grant external delivery or mutation capability;
- current capability-broker work is source-owned and integrated only after its contract stabilizes.

### Victorique

**Identity:** one persistent resident, `resident:victorique:victorique`.

Observed inputs:

- phase/autonomy level and project context;
- SQLite/LanceDB health when implemented;
- index freshness, note/entity/theme/project/open-loop counts;
- citations, recommendations, contradictions, research questions, and approval candidates;
- audit events.

Initial commands: none. Victorique is currently autonomy Level 0, a read-only mirror. The adapter must not fabricate chat, write, approve, or external-action capability. Future `message.send` and `approval.respond` capabilities appear only when Victorique's own phase and safety contract provide them.

### OMP

OMP is an execution substrate represented through workers, not a resident.

Observed inputs:

- active top-level sessions and claimed components;
- OMP child workers/jobs, status, model, worktree, parent, typed result, and artifacts when exposed;
- todo/run state and evidence references;
- session lifecycle and errors.

Initial commands: none. Future cancellation or steering requires a separate authority and delivery contract; City chat cannot be routed to arbitrary worker stdin by implication.

### Orbit

Orbit loops are deterministic/agentic routines represented as facilities unless a specific loop later satisfies resident identity criteria.

Observed inputs already available in Aperture include loop spec/state, current pace, failures, ticks, model/token use, pending asks, next tick, evidence, events, and frozen state.

Candidate command: `approval.respond` for an exact pending ask, using the existing Orbit command path only after idempotency and acknowledgement semantics are normalized.

### Aperture permission bus

Existing permission requests under `~/obsidian/claude-bus/permission-requests` become approval observations. The current `/api/respond` endpoint writes a response file and redirects; a City adapter must add idempotent command receipts and reconciliation rather than treating file creation as source acknowledgement.

### systemd and project state

Systemd units, databases, repositories, and taskboards normalize as facilities, resources, projects, and work items. They are context for residents and workers, not additional citizens.

## Adapter acceptance contract

Every production adapter must demonstrate:

- valid, missing, malformed, stale, and partial source behavior;
- deterministic ID mapping across restarts;
- secret redaction;
- freshness transitions;
- duplicate event handling;
- native status preservation;
- declared command rejection;
- idempotent dispatch or safe reconciliation;
- no source mutation from snapshot/event reads;
- exact audit evidence for every command attempt.
