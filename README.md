# Aperture

**An ops dashboard for an autonomous AI agent stack.**

Aperture is a self-hosted, server-rendered dashboard that surfaces live state from a personal autonomous agent system — agent health, active operating mode, pending decisions, cost runway, service status, and an ongoing bug/audit ledger. It's the single place to check what the system is doing and what it needs.

Live at [aperture.merulox.com](https://aperture.merulox.com) (auth-gated).

---

## The idea

Autonomous systems become dangerous and useless in the same way: their internal
state becomes harder to see than their outputs.

Aperture exists to keep the operation observable. It favors evidence over
confidence, explicit failure state over reassuring status, and direct views of
the files agents actually write over a second database pretending to be truth.

It is deliberately read-only. Aperture does not become the control plane merely
because it can see the system. Observation, authority, and actuation remain
separate.

---

## What it shows

| Section | Source | What it tells you |
|---------|--------|------------------|
| **Mode** | `realm/mode.json` | Current operating mode and its goal |
| **Health** | `obsidian/genesis/health.json` | Agent status, cost runway, pipeline metrics |
| **Genesis state** | `obsidian/genesis/live-state.md` | Latest agent tick, active rule, last entry |
| **Service monitor** | `realm/monitor/service-health.jsonl` | Live systemd service states |
| **Audit ledger** | `realm/monitor/genesis-audit.jsonl` | Standing bug register — open/resolved items |
| **Vitals** | realm commons | Vault claims, agent count, open conflicts |
| **Pending decisions** | genesis health | Urgent decisions waiting on the operator |

The dashboard is read-only. It doesn't control anything — it observes and surfaces.

---

## Stack

- **[Astro](https://astro.build)** — SSR, zero client-side JS, fast cold renders
- **Node adapter** — runs as a standalone server process
- **Basic auth middleware** — single gate, no session management needed
- **No database** — reads live files directly from the local filesystem

This is an intentional architecture: the agent stack writes structured JSONL/Markdown to disk; Aperture reads it. No API layer, no polling service, no database migration. If the file exists, the data is current.

---

## Self-hosting

**Requirements:** Node 18+, the agent stack running on the same machine (or shared filesystem).

```bash
git clone https://github.com/Merulox/aperture
cd aperture
npm install
cp .env.example .env
# Edit .env — set BASIC_AUTH_USER and BASIC_AUTH_PASS
npm run build
node dist/server/entry.mjs
```

The data paths in `src/lib/data.ts` are hardcoded to `/home/merulox/...`. To use this on your own stack, update those paths to point at your agent's output files.

**Running as a service:**

```ini
# ~/.config/systemd/user/aperture.service
[Unit]
Description=Aperture ops dashboard

[Service]
WorkingDirectory=/path/to/aperture
ExecStart=node dist/server/entry.mjs
EnvironmentFile=/path/to/aperture/.env
Restart=on-failure

[Install]
WantedBy=default.target
```

---

## Data contract

Aperture expects its sources in these shapes:

**`health.json`**
```json
{
  "tick": 42,
  "updated": "2026-06-05T18:00:00Z",
  "status": "FROZEN_PIVOT",
  "phase": "outreach",
  "cost_usd": 12.40,
  "cost_limit_usd": 50.00,
  "runway_days": 18,
  "pipeline": { "sent": 535, "replied": 76 },
  "pending_decisions": [
    { "item": "affiliate program selection", "urgency": "MED", "last_raised": "2026-06-05" }
  ]
}
```

**`service-health.jsonl`** — one JSON object per line, appended by a monitor script:
```json
{"ts":"2026-06-05T18:00:00Z","services":{"aperture":"active","genesis-core":"inactive",...}}
```

**`live-state.md`** — Markdown with structured fields:
```
**Updated:** 2026-06-05 18:00
**Tick:** 42
**Active rule:** cost-gate
**Tick 42 (2026-06-05):** Checked pipeline metrics. Outreach paused pending reply analysis.
```

---

## Context

Aperture is part of a personal autonomous agent system. The other components:

- **Genesis** — the agent daemon ([Merulox/genesis](https://github.com/Merulox/genesis))
- **Realm** — the state substrate and monitor that Genesis operates within (private)
- **Agent Infra** — the methodology layer that governs how the system is built ([Merulox/agent-infra](https://github.com/Merulox/agent-infra))
