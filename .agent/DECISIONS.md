# Decision Log — Aperture

_One entry per architectural or product decision. Append-only — never edit past decisions.
Mark superseded decisions with `[SUPERSEDED by D-NNN]` at the top._

---

## Template

### D-NNN: [Short title]

- **Date:** YYYY-MM-DD
- **Decided by:** [architect / product owner]
- **Status:** active | superseded | reversed

**Context:** What situation forced this decision?

**Decision:** What was decided, in one sentence.

**Alternatives considered:** What else was evaluated and why it was rejected.

**Consequences:** What this enables, what it forecloses.

---

## Example entries (SYNTRA)

### D-001: Dedupe by source + source_product_id

- **Date:** 2026-06-05
- **Decided by:** architect
- **Status:** active

**Context:** Multiple importers will write to the same NocoDB table. We need a stable dedupe key that works across runs and sources.

**Decision:** Use composite key `source + source_product_id`. Source = the import system (e.g. "orbitkey", "bellroy"). Source Product ID = the stable ID from that system.

**Alternatives considered:** URL-based dedupe — rejected because URLs are not guaranteed stable across regions or variants. Name-based — rejected as too ambiguous.

**Consequences:** Every importer must set both fields. Backfill required for records imported before the fields existed.

---

### D-002: Supplier field for brand identity (no Brand field in v1)

- **Date:** 2026-06-05
- **Decided by:** product owner
- **Status:** active

**Context:** Readiness doc recommended a dedicated Brand field. But NocoDB schema changes require manual intervention, and Supplier already carries brand name for Orbitkey.

**Decision:** Use Supplier = brand name for v1. No new Brand field.

**Alternatives considered:** Add Brand field — deferred; adds migration risk without clear discovery UI benefit for 2-brand v1.

**Consequences:** Supplier serves double duty as brand. Revisit if cross-brand filtering becomes a UX requirement.
