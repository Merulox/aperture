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

Enabled Genesis v1 commands:

- `message.send` persists a trusted-operator event in the durable Genesis inbox with a client-owned idempotency key;
- `resident.wake` explicitly starts one detached `work-once` process and returns a durable wake receipt without holding the HTTP request open;
- `approval.respond` remains unavailable. The APV-1042 card is an isolated UI fixture.

Constraints:

- legacy production and runtime v2 remain distinct sources until their own cutover;
- City must reveal which runtime produced an observation;
- runtime v2 is Tier 2 and currently monitor-only; the City cannot silently grant external delivery or mutation capability;
- current capability-broker work is source-owned and integrated only after its contract stabilizes.

Implemented observation boundary:

- `GET /api/city-genesis` reads runtime-v2 SQLite in read-only mode and normalizes recent events, runs, traces, deliveries, counts, decisions, and Aperture-owned wake receipts;
- `POST /api/city-genesis` accepts only the two declared commands above;
- message retries reconcile through Genesis event idempotency; wake retries return the existing deterministic receipt even after the event leaves `queued`;
- City starts Python from the canonical Genesis repository and never waits for the Claude subprocess in the browser request;
- no command grants capabilities, invokes arbitrary tools, writes legacy Genesis state, or enables external delivery.

### Victorique

**Identity:** one persistent resident, `resident:victorique:victorique`.

Observed inputs:

- phase/autonomy level and project context;
- SQLite/LanceDB health when implemented;
- index freshness, note/entity/theme/project/open-loop counts;
- citations, recommendations, contradictions, research questions, and approval candidates;
- audit events.

Initial commands: none. Victorique is currently autonomy Level 0, a read-only mirror. The adapter must not fabricate chat, write, approve, or external-action capability. Future `message.send` and `approval.respond` capabilities appear only when Victorique's own phase and safety contract provide them. **Deliberate exception (2026-07-26):** when live chat was added as the default resident capability for Hormozi/Ogilvy/Signaler (see Boréal/Signaler sections below), Victorique was NOT included — this boundary predates that work and is a standing safety decision, not an oversight; it stays in force until Victorique's own project supplies the phase/safety contract this section requires.

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

### Boréal

Boréal Numérique's sales operations do not yet have a normalized City adapter — the live surface today is the pre-existing `BorealPanel`/`/api/boreal-clients` route (source-owned, not City-normalized). The panel observes:

- `missed-call-bot`, `sms-inbox`, `sms-webhook`, `boreal-tunnel`, `boreal-campaign`, `boreal-followup` as systemd facilities (`systemctl --user is-active`);
- `resident:boreal:hormozi` (`~/projects/boreal/scripts/hormozi.py`), the shared sales-conversation generation library called by `missed-call-bot`, `reply-agent`, and `close-agent`. Promoted from facility to **resident** 2026-07-25 with real, non-fabricated fields:
  - **mandate** — `hormozi.MANDATE` / `boreal.ts:HORMOZI_MANDATE`, surfaced verbatim in `BorealPanel`.
  - **goals/memory** — `learning_actions` rows (`actor='hormozi'`, `action_type='hypothesis_proposed'`), the same table/review mechanism the Forge learning dashboard already uses (`requires_review`/`reviewed_at`, via `crm_lib.log_learning_action`/`acknowledge_learning_action`). No new schema was invented.
  - **conversation** — `GET/POST /api/hormozi` (`getHormoziProposals`/`reviewHormoziProposal`): a human approves or declines a pending hypothesis; the decision is appended as its own idempotently-keyed `learning_actions` row (`hypothesis_approved`/`hypothesis_declined`), never a silent overwrite. Approving records intent only — it does **not** auto-create or auto-activate an experiment; launching a real A/B test against `SALES_DOCTRINE` remains a separate, deliberate human step (`crm_lib.create_experiment` + `set_experiment_status`), per the 2026-07-21 sales-learning governance decision. `hormozi` never self-promotes.
  - **Live chat (2026-07-26):** `GET/POST /api/boreal-chat?resident=hormozi` (`getBorealChatHistory`/`sendBorealChatMessage`) → `~/scripts/boreal-chat`, a genuine synchronous LLM turn — Hormozi answers as itself (its own mandate/pending hypotheses), never generating lead-facing SMS here (that stays `hormozi.generate_reply`/`generate_missed_call_text`/`generate_close_followup`, unchanged). Every turn persists to a new `crm.db.resident_chat_messages` row (`resident`, `role`, `body`) BEFORE the model call, so a failed reply never loses or fabricates the operator's message. Distinct write path from `learning_actions`/proposal review — chat and proposal decisions remain two separate mechanisms in the same chat tab.
  - Health/activity is still observed from `crm.db.message_variants` (`prompt_version LIKE 'hormozi-%'`) rather than a systemd unit, since the library has no daemon of its own — model-derived state (`trust: 'model_inference'`).
  - **City graph visibility (2026-07-25):** `CityPrototype.tsx` renders `hormozi`/`ogilvy` as two more hardcoded map entities (same pattern as its existing `city-hall`/`genesis`/`victorique`/`genesis-worker`/`genesis-site` literals) in a new "boréal" district — health/pending-count polled from `/api/boreal-clients` + `/api/hormozi` + `/api/ogilvy` every 5s, with a real approve/decline UI in the chat tab (calls the same review endpoints `BorealPanel` uses, not a duplicate). **Deliberately NOT populated** (not fabricated to look domain-model-complete): `activeWorkerIds` — Hormozi has no bounded execution/session model of its own, it runs inline inside the caller's process; `homePlaceId`/`districtIds` — no generic City place/district registry exists at all yet, for Genesis or any other resident; every entity's position is a hand-authored `EntityId` literal and CSS coordinate in `CityPrototype.tsx`, not a data-driven place lookup.
- `resident:boreal:ogilvy` (`~/projects/boreal/scripts/ogilvy.py`), the money-optimized content resident, promoted directly to **resident** 2026-07-25 (never a facility) — same governance and mechanism as `resident:boreal:hormozi`:
  - **mandate** — `ogilvy.MANDATE` / `boreal.ts:OGILVY_MANDATE`. Owns Boréal's Facebook/Instagram acquisition content, the top-of-funnel layer feeding leads into the funnel `hormozi` closes.
  - **goals/memory** — `learning_actions` rows (`actor='ogilvy'`, `action_type='content_proposed'`), the identical mechanism as Hormozi. No parallel content-specific schema was invented.
  - **conversation** — `GET/POST /api/ogilvy` (`getOgilvyProposals`/`reviewOgilvyProposal`) → `~/scripts/ogilvy-review`. Approving does **not** publish directly: it appends the post to `~/projects/boreal-outreach/04-content-batch.md` in the exact `### POST N` format `content-push`/`fb-post` already parse — Ogilvy is a strategy/memory layer around those existing publishers, never a second publisher. Idempotent via an `[ogilvy:<proposal_id>]` marker; a retried approval is a no-op, never a duplicate post.
  - **Attribution guardrail** — every proposal must carry a sanitized `campaign_code`; `append_post_to_batch` hard-rejects an approval whose copy is missing the exact `borealnumerique.ca/?src=<code>` link. Known limitation: `leads.source` has zero Facebook-attributed values despite 26 posts already published — this is directional attribution (a trackable link), not yet closed-loop measured back to bookings.
  - `hormozi-review`/`ogilvy-review` both validate `actor`/`action_type`/`action_key` namespace before acting — one resident's CLI cannot resolve another's (or an unrelated Forge review-queue) proposal.
  - Health/activity observed from `crm.db.message_variants` (`prompt_version LIKE 'ogilvy-%'`), same pattern as Hormozi; no daemon of its own.
  - **City graph visibility:** shares Hormozi's `CityPrototype.tsx` wiring above (same "boréal" district, same live poll, same approve/decline UI against `/api/ogilvy`).
  - **Live chat (2026-07-26):** shares Hormozi's `boreal-chat`/`resident_chat_messages` mechanism above, resident-discriminated (`--resident ogilvy`), against `/api/boreal-chat?resident=ogilvy`.
  - **Deliberately NOT populated**: same as Hormozi — no `activeWorkerIds`, real `homePlaceId`, or real `districtIds`.

### Signaler

`resident:signaler` (`~/projects/signaler/`), the standalone passive-income content agent, built 2026-07-26 — explicitly **not** a Boréal resident, and correspondingly given its own "signaler" City district rather than folded into "boréal":
- **mandate** — `SIGNALER_MANDATE` in `src/lib/signaler.ts`, sourced from `~/projects/signaler/CONTEXT.md`.
- **Setup-gap prompt (2026-07-26, same day):** the operator asked "why isn't it prompting me" — correctly: `SETUP.md` was inert documentation nothing ever read. Added `getSignalerCredentialGaps()` (checks `~/.secrets/signaler-*` files for the 4 v1 platforms — X, Reddit, Threads, Instagram — exist AND are non-empty after trim, matching the adapters' own `read_secret().strip()` behavior so a placeholder file can't silently clear the prompt) plus an `accountCount === 0` check, both real filesystem/DB reads, not simulated. Surfaces as: the `needs-attention` pulsing dot (same CSS City Hall's fixture-approval uses) on the map node, a `setup needed` toolbar suffix, the node's own state label switching to `"needs setup"` instead of a contradictory `"idle"`, and a detailed "now" tab card naming exactly which files are missing per platform. YouTube/TikTok are deliberately excluded — they're staged (blocked on the unbuilt video pipeline / TikTok verification), not a v1 setup gap; flagging them would train the operator to ignore a permanently-lit indicator.
- **goals/memory** — its OWN SQLite DB (`~/projects/signaler/signaler.db`), never Boréal's `crm.db`: `niches`, `accounts`, `content_proposals`, `review_decisions`, `post_log`, `affiliate_links` tables. Reuses the Hormozi/Ogilvy *pattern* (append-only proposals, `requires_review`/`reviewed_at`, idempotent decision rows), not their schema or data.
- **conversation** — `GET/POST /api/signaler` (`getSignalerProposals`/`reviewSignalerProposal`) → `~/scripts/signaler-review`. Same shell-out-to-CLI pattern as Hormozi/Ogilvy so the write logic (atomic `reviewed_at` guard + append-only `review_decisions` row) lives once, in `signaler_lib.py`, not duplicated in Aperture. Approving records intent only — actual posting is a separate, also human-triggered `signaler-publish --force` step; nothing here can post live content until real accounts/credentials exist (see `~/projects/signaler/SETUP.md`).
- **Live chat (2026-07-26):** `GET/POST /api/signaler-chat` (`getSignalerChatHistory`/`sendSignalerChatMessage`) → `~/scripts/signaler-chat`, same synchronous-LLM-turn pattern as Hormozi/Ogilvy — Signaler answers as itself, never generating a publishable post here (that stays `content_gen.generate_post`, gated by `signaler-review`). Persists to a new `signaler.db.chat_messages` table, operator turn written before the model call.
- **Scheduled pipeline (2026-07-26):** `~/scripts/signaler-cycle`, fired every 15 min by `signaler-cycle.timer` (plain `~/.config/systemd/user/` unit, matching the `boreal-campaign`/`boreal-followup` precedent, not NixOS-declared — this is business-domain automation, not system infra). The timer's 15-min cadence is a poll frequency, not the schedule: `signaler.db.pipeline_config` (single-row, `enabled`/`interval_hours`/`max_proposals_per_run`/`last_run_at`/`last_run_summary`) is the real, operator-owned schedule, disabled by default. Each due cycle: (1) re-runs `niche_research.build_candidates()` (no LLM call, idempotent), (2) generates exactly one proposal per niche with zero existing `content_proposals` rows (angle derived from the niche's own real vault-citation rationale, never invented), capped at `max_proposals_per_run` **model-call attempts** — not successes, so a run of exhausted-credit failures still can't exceed the configured spend ceiling. Never posts — every proposal still requires human review via `signaler-review`, unchanged. Configurable from the City "work" tab (toggle, interval, cap, "run now" bypassing due-ness but not the enabled gate) via `GET/POST /api/signaler-pipeline-config` (`getSignalerPipelineConfig`/`setSignalerPipelineConfig`/`runSignalerCycleNow`).
- Health/activity observed from `signaler.db` directly (`getSignalerStatus`) via a dedicated `/api/signaler-status` route — deliberately NOT folded into `/api/boreal-clients`, which is scoped to Boréal only.
- **City graph visibility (2026-07-26):** `CityPrototype.tsx` renders `signaler` as one more hardcoded map entity (`"VC"`, amber, distinct from Hormozi/Ogilvy's green) in its own "signaler" district — health/pending-count polled from `/api/signaler-status` + `/api/signaler` every 5s, with real approve/decline in the chat tab. Fixed a real, pre-existing clipping bug while adding this: `.city-hormozi`/`.city-ogilvy`'s `top: 80%`/`88%` positions overflowed `.city-map`'s `overflow: hidden` bottom edge on shorter viewports (reproduced at the reported 965×808) — pulled all three bottom-anchored entities up (74%/80%/82%) with headroom verified at that exact viewport.
- **Deliberately NOT populated**: same as Hormozi/Ogilvy — no `activeWorkerIds`, real `homePlaceId`, or real `districtIds`; no generic City place/district registry exists.

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
