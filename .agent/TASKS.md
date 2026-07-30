# Tasks

_Append new tasks at the bottom. Move status forward as work progresses.
Never delete rows — mark as done or cancelled._

## Status legend

| Status | Meaning |
|--------|---------|
| `backlog` | Identified, not yet briefed |
| `briefed` | Brief written, ready for executor |
| `in_progress` | Executor is working on it |
| `review` | Awaiting reviewer |
| `done` | Verified complete (live state confirmed) |
| `cancelled` | Dropped with reason |
| `blocked` | Cannot proceed — see Notes |

## Safety flags

| Flag | Meaning |
|------|---------|
| `[DATA]` | Writes or deletes data — requires Reviewer |
| `[SCHEMA]` | Changes database schema — requires Product Owner approval |
| `[DEPLOY]` | Touches production — requires Product Owner approval |
| `[MONEY]` | Spends money or changes billing — requires Product Owner approval |

---

## Task queue

| ID | Status | Priority | Safety | Title | Brief | Notes |
|----|--------|----------|--------|-------|-------|-------|
| T-00 | `done` | — | — | Template row | — | Replace with real tasks |
| AP-32 | `done` | P1 | `[DATA][DEPLOY]` | Agentic QA Learning tab | `docs/planning/AP-32-learning-tab.md` | Independent review PASS 2026-07-24; build, live service, desktop, 390px, and canonical-data parity verified |
| AP-34 | `done` | P1 | `[DATA][DEPLOY]` | Live Genesis City bridge | `docs/city/README.md` | Verified 2026-07-25: authenticated GET snapshot, idempotent message enqueue, detached wake, persisted succeeded run/trace/decision, durable wake receipt, desktop, and 390px |

---

## Example (SYNTRA)

| ID | Status | Priority | Safety | Title | Brief | Notes |
|----|--------|----------|--------|-------|-------|-------|
| T-01 | `done` | P1 | — | Source identity backfill | task-01-source-identity.md | Verified clean 2026-06-05 |
| T-02 | `done` | P1 | `[DATA]` | Category normalization | task-02-category-normalization.md | 107/107 rows resolved |
| T-03 | `done` | P1 | `[DATA]` | Source facts backfill | task-03-source-facts.md | Decimal type fix required |
| B-01 | `briefed` | P1 | — | Bellroy API probe | task-b1-bellroy-probe.md | Read-only, no NocoDB |
| B-02 | `backlog` | P1 | `[DATA]` | Bellroy normalize + ingest | — | Depends on B-01 output |
