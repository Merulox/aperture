# Federated City Hall Protocol

## Purpose

City Hall is one operator-facing inbox and command surface over heterogeneous agents. It does not become the execution authority of every source system.

The protocol separates four facts:

1. the origin asks for authority;
2. the operator makes a decision;
3. City Hall attempts delivery;
4. the origin acknowledges or source reconciliation proves the resulting state.

## Authority split

| State | Authority |
|---|---|
| Origin request, runtime status, resulting action | Source system |
| Operator identity and explicit decision | City Hall |
| Delivery attempt and receipt evidence | City Hall outbox + adapter |
| Final source resolution | Source acknowledgement or reconciliation |
| Prioritization and attention | Derived City view |

## Command envelope

```ts
interface CityCommand {
  schemaVersion: 1;
  id: string;
  idempotencyKey: string;
  kind: 'approval.respond' | 'message.send' | 'resident.wake';
  actor: { id: 'operator:merulox'; authenticatedAt: string };
  target: { adapterId: string; entityId: string; sourceId: string };
  context: { type: string; refId?: string; correlationId: string };
  payload: Record<string, unknown>;
  riskTier: 0 | 1 | 2 | 3;
  requiredAuthority: string[];
  expectedSourceVersion?: string;
  createdAt: string;
  expiresAt?: string;
  causationId?: string;
}
```

Payloads are schema-defined per command kind. City Hall never accepts an arbitrary shell command or unbounded tool instruction.

## Approval response payload

```ts
interface ApprovalResponsePayload {
  approvalId: string;
  selectedOptionId: string;
  note?: string;
  exactQuestionHash: string;
}
```

The question hash prevents a stale UI from answering a materially changed request. Free-form notes supplement a selected structured option; they do not replace exact authorization.

## Message payload

```ts
interface MessagePayload {
  residentId: string;
  conversationId: string;
  context: {
    type: 'general' | 'project' | 'goal' | 'work_item' | 'worker' | 'approval';
    refId?: string;
  };
  body: string;
  wakePolicy: 'next_scheduled_wake' | 'none';
}
```

Immediate wake is a separate `resident.wake` command. This keeps message delivery and compute activation independently auditable.

## Durable outbox

City Hall owns a small durable outbox and append-only command audit. Required fields:

- command envelope;
- state and attempt count;
- lease owner/expiry;
- next attempt time;
- adapter receipt;
- error classification;
- created, delivered, acknowledged, and terminal timestamps;
- reconciliation evidence.

The sender uses leases, bounded exponential backoff, and idempotency keys. It never retries a transport with ambiguous non-idempotent side effects unless reconciliation proves the previous attempt did not apply.

## Request flow

```text
source request
  → adapter observation
  → normalized pending approval
  → City Hall attention item
  → operator reviews exact source, risk, options, and consequences
  → authorized command enters outbox
  → adapter dispatches
  → receipt: accepted_for_delivery
  → origin acknowledges or adapter reconciles
  → approval resolves
  → resulting source event updates resident/site/trail
```

## Message and wake flow

```text
operator message
  → durable message command
  → adapter delivers to resident inbox
  → delivered receipt
  → resident consumes on scheduled wake

optional urgent path:
operator separately requests wake
  → wake command authorization
  → adapter signals resident
  → wake acknowledgement/event
```

## API surface candidate

These are contract names, not implementation approval:

- `GET /api/city/snapshot`
- `GET /api/city/events?cursor=...`
- `POST /api/city/commands`
- `GET /api/city/commands/:id`

The command POST returns `202 Accepted` with a command ID when durably queued. It never returns success merely because the UI payload parsed.

## Security and disclosure

- Aperture authentication identifies the operator; mutating routes additionally require CSRF/origin protection.
- Command kinds and payloads are allowlisted and schema-validated.
- Target adapter capabilities are checked before queueing.
- Tier 2–3 commands require explicit confirmation showing consequences and exact target.
- Raw prompt/memory reveal is a separate audited read action.
- Secret values never enter snapshots, commands, logs, or browser state.
- Every command attempt is attributable to operator, target, source version, and UI context.

## Failure behavior

- Adapter unavailable: retain request, show stale/failure attention, do not claim delivery.
- Source request changed: reject stale response through source version/question hash.
- Delivery timeout: retry only under declared transport policy.
- Ambiguous delivery: stop and reconcile; do not blindly resend.
- Source rejects: preserve reason and restore approval to pending or terminal rejection according to source semantics.
- City restart: outbox resumes from durable leases without losing commands.
- Duplicate click: same idempotency key returns the existing command.

## First Genesis control-loop contract

The production first slice requires:

1. a real Genesis-origin approval with stable source ID, exact options, risk, and provenance;
2. City Hall and Genesis inspector showing the same normalized request;
3. one operator response creating one durable command;
4. Genesis adapter delivery to its approved inbox/control mechanism;
5. no implicit wake unless separately requested;
6. source acknowledgement or reconciled state;
7. one visible trail linking request, decision, delivery, and resulting state;
8. restart and duplicate-submit tests;
9. zero capability expansion beyond Genesis's source contract.
