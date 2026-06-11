# Aperture

Autonomous systems become dangerous and useless in the same way: their internal state becomes harder to see than their outputs.

Aperture is a self-hosted ops dashboard for a personal AI agent stack. It reads live files directly from the filesystem — no API layer, no database, no polling service — and surfaces what the system is actually doing.

Live at [aperture.merulox.com](https://aperture.merulox.com) (auth-gated).

## What it shows

| Section | What it tells you |
|---------|------------------|
| **Mode** | Current operating mode and goal |
| **Health** | Agent status, cost runway, pipeline metrics |
| **Genesis state** | Latest agent tick, active rule |
| **Tasks** | Full task board — EX and SYNTRA queues, per-task briefs, Codex launch buttons |
| **Codex instances** | Running jobs, live log tail |
| **Service monitor** | Live systemd service states from the realm monitor feed |

The `/tasks` page is a React SPA built with [merulox's kernel](https://github.com/merulox/meruloxs-kernel). Briefed tasks have a "Send to Codex" button that spawns a Codex job, streams the log live, and tracks exit state.

## Stack

Astro SSR · Node adapter · Basic auth middleware · reads local filesystem

Data paths in `src/lib/data.ts` are hardcoded to `/home/merulox/...`. To run on a different machine, update those paths.

## Setup

```bash
npm install && cp .env.example .env
npm run build
node dist/server/entry.mjs
```

## Related

- [meruloxs-kernel](https://github.com/merulox/meruloxs-kernel) — the operating model Aperture is built under
- Genesis, Realm — private
