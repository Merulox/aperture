# Risk Register

_Known risks, mitigations, and owners. Review at the start of any task with a [DATA],
[SCHEMA], or [DEPLOY] flag._

---

## Risk levels

| Level | Meaning |
|-------|---------|
| LOW | Reversible, contained, no data loss |
| MED | Partially reversible, limited blast radius |
| HIGH | Irreversible or wide blast radius — requires PO sign-off |

---

## Active risks

| ID | Level | Description | Mitigation | Owner | Status |
|----|-------|-------------|-----------|-------|--------|
| R-00 | — | Template row — replace | — | — | — |

---

## Example entries (SYNTRA)

| ID | Level | Description | Mitigation | Owner | Status |
|----|-------|-------------|-----------|-------|--------|
| R-01 | MED | NocoDB field type mismatch (int vs decimal) causes silent data loss | Test with decimal values in dry-run before --write | architect | resolved 2026-06-05 |
| R-02 | LOW | Bellroy internal API may rate-limit or change without notice | 1 req/s throttle; dry-run first; no hard dependency on this API for core app | architect | monitoring |
| R-03 | HIGH | Running categories:apply --write on wrong env overwrites production NocoDB | Require explicit --write flag; audit shows effect before --write | executor | mitigated |

---

## Retired risks

Risks that are resolved or no longer relevant — keep for history.

| ID | Resolved | How |
|----|----------|-----|
| R-01 | 2026-06-05 | User changed NocoDB field type to Decimal; backfill re-run; 107 rows clean |
