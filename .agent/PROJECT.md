# Project: Aperture (Genesis Web Interface)

| Field | Value |
|-------|-------|
| Name | Aperture |
| Owner | merulox |
| Architect | Claude |
| Executor | Codex |
| Stack | Astro, Cloudflare Pages |
| Repo | ~/projects/aperture/ (git initialized, no remote yet) |
| Target domain | aperture.merulox.com |
| Started | 2026-06-05 |
| Status | scaffold — not yet built |

---

## Goal

Web interface layer for Genesis. Shows realm vitals, Genesis operational state, pending decisions, and health signals. Dark, minimal, ambient — mirrors the personality of Genesis itself.

## Design direction

- Ground: near-black (#0a0a0a), monospace font
- No decorative chrome — data is the interface
- Inspired by the "listening" nature of Genesis — quiet until relevant
- Should feel like a terminal you can read at a glance, not a dashboard you manage

## Sections (v1 — decide before briefing)

The following are candidates — confirm with product owner before building:

- [ ] **Vital signs** — realm-vitals.json: momentum scores per track
- [ ] **Genesis state** — live-state.md current summary
- [ ] **Health** — health.json five partnership signals
- [ ] **Pending decisions** — open escalations needing PO input
- [ ] **Mode** — what mode Genesis thinks you're in right now

## Key resources

| Resource | Location |
|----------|----------|
| Source | ~/projects/aperture/ |
| Genesis live state | ~/obsidian/knowledge/projects/genesis/live-state.md |
| Realm vitals | ~/projects/realm/commons/vitals.json |
| Health | ~/obsidian/knowledge/projects/genesis/health.json |
| Genesis project | ~/projects/genesis/ |

---

## Open decisions needing Product Owner input

- [ ] What sections go in v1? (see candidates above)
- [ ] Static (reads files at build time) or dynamic (fetches live state via API)?
- [ ] Deploy as subdomain of merulox.com or standalone?
- [ ] Auth required or local-only?
