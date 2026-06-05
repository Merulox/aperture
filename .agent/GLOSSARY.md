# Glossary

_Project-specific terms and what they mean. Add entries when a new term appears in briefs
or decisions. Prevents agents from inferring different meanings for the same word._

---

| Term | Definition |
|------|-----------|
| [term] | [definition] |

---

## Example (SYNTRA)

| Term | Definition |
|------|-----------|
| Source | The import system (e.g. "orbitkey", "bellroy") — not the brand |
| Supplier | The brand name (e.g. "Orbitkey", "Bellroy") |
| Source Product ID | Stable ID from the source system — used as the dedupe key alongside Source |
| Source Handle | URL slug or internal key from the source — secondary identity, useful for URL reconstruction |
| Normalized Category | SYNTRA's taxonomy category (from SYNTRA_CATEGORIES in src/categories.js) |
| Vendor Product Type | Raw category string from the source brand — stored as-is |
| Clean | Audit result: all invariant arrays empty (no missing IDs, invalid categories, inverted prices, etc.) |
| Brief | A task spec written by the architect in docs/planning/ — required before any executor work |
| Dry-run | Script mode that shows what would change without writing to NocoDB (default for all backfill scripts) |
| Live effect | What actually changed in NocoDB — verified by running nocodb:audit, not by reading the executor's report |
