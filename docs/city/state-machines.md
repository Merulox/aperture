# City State Machines

Normalized states let the City compare heterogeneous sources without pretending their native lifecycles are identical. Every transition is caused by an immutable event and retains the original source status.

## Freshness

```text
unknown → fresh → aging → stale
            ↑        │
            └────────┘ on new observation
```

- `fresh`: within the adapter's declared freshness window.
- `aging`: still usable, but approaching the stale threshold.
- `stale`: do not present state as current; preserve the last observation and timestamp.
- `unknown`: the adapter has never produced valid evidence.

A stale resident may visually appear offline, but stale data never authoritatively changes the source resident's state.

## Resident presence

```text
unknown ──observation──> offline | idle | active | waiting | blocked | degraded
                             └──────────── new observation ────────────┘
```

Presence is derived from heartbeat, source state, active workers, approvals, and failures:

- `offline`: source explicitly reports stopped/unavailable.
- `idle`: healthy, no active execution.
- `active`: at least one current worker or source reports execution.
- `waiting`: intentionally waiting for schedule, input, or delivery.
- `blocked`: cannot continue without named input/dependency.
- `degraded`: alive but unhealthy or repeatedly failing.
- `unknown`: no fresh authoritative observation.

City commands do not set presence directly.

## Worker

```text
discovered → queued → running → waiting → running
                         │        │
                         ├──────> blocked ──> running
                         ├──────> succeeded
                         ├──────> failed
                         └──────> cancelled

running | waiting | blocked ──lost freshness──> stale
stale ──reconciled──> any source-authoritative state
```

Rules:

1. Terminal workers are `succeeded | failed | cancelled`.
2. Retries create a new worker/run identity when the source does so; they do not rewrite evidence.
3. `stale` is an observation condition, not a source terminal state.
4. A worker cannot create or expand mission-level goals.

## Goal

```text
proposed → active → paused → active
              │        │
              ├──────> achieved
              ├──────> abandoned
              └──────> superseded
```

- Mission goals require operator activation.
- Resident objectives require an active parent mission and mandate fit.
- Worker tasks require a parent objective and bounded contract.
- Changing success criteria creates a new version and an event.

## Work item

```text
proposed → ready → active → evidence_ready → verified → closed
              │       │  ├───────────────> rework ──> active
              │       │  ├───────────────> blocked ─> active
              │       │  └───────────────> needs_input ─> ready|active
              └───────┴──────────────────> cancelled
```

The City stores the normalized state and native `sourceStatus`. A mapping may be lossy; inspectors must reveal the native value.

## Approval

Approval intent and delivery are separate state machines.

### Approval state

```text
pending → response_pending → approved | rejected
   │             │
   ├────────────> expired
   └────────────> cancelled

response_pending ──delivery/reconciliation failure──> pending + attention
```

### Response command state

```text
draft → authorized → queued → delivering → acknowledged
  │         │          │          ├──────> failed_retryable ──> queued
  │         │          │          └──────> failed_terminal
  └─────────┴──────────┴─────────────────> cancelled | expired
```

Invariants:

1. UI acceptance creates a command; it does not immediately claim source approval.
2. Consequential commands require explicit operator authorization and exact option payload.
3. Commands have idempotency keys and finite retry policy.
4. `acknowledged` requires source receipt or reconciled source state.
5. The same command ID cannot carry two answers.
6. Expiry prevents new delivery but never erases audit evidence.

## Message

```text
draft → queued → delivering → delivered → read → responded
           │          ├──────> failed_retryable ──> queued
           │          └──────> failed_terminal
           └─────────────────> cancelled | expired
```

Wake policy is independent:

```text
none | next_scheduled_wake | immediate_requested
```

Sending a message never implies immediate wake. An immediate wake is a separate authorized command linked by correlation ID.

## Facility

```text
unknown ↔ healthy ↔ degraded ↔ failed
             └───────────────> stopped
```

`stopped` is healthy only when desired state is stopped. Desired state remains source-owned.

## Adapter health

```text
initializing → healthy → degraded → unavailable
                    ↑         │
                    └─────────┘
```

An unavailable adapter must not clear its entities. The City retains the last snapshot, marks it stale, and creates attention only when the affected entity is operationally relevant.

## Event ordering

- Each adapter emits monotonically ordered cursors inside its own stream.
- Global wall-clock order is best effort; `occurredAt` and `observedAt` remain distinct.
- Commands use correlation and causation IDs to link UI intent, adapter dispatch, source receipt, and resulting observations.
- Duplicate source events collapse by adapter ID plus source event ID or declared idempotency key.
- Late events remain evidence and must not regress a newer source version.
