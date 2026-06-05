# Aperture — Project Context

Last updated: 2026-06-05
Updated by: architect (AP-01 reviewed + accepted)

---

## Current state summary

AP-01 dashboard is DONE — SSR Astro app, Basic Auth (m/st), 5 sections rendering live from state files (health, genesis live-state, vitals, mode + pending decisions). Verified live by architect: 401 without auth, 200 with m:st, all sections populated with real data. Committed at 15afd3f. Not yet deployed (needs cloudflared tunnel — out of scope for AP-01).

---

## What was just completed

- AP-01: full dashboard (src/middleware.ts, src/lib/data.ts, src/styles/global.css, src/pages/index.astro)
- Reviewed against live state — PASS. Build clean, auth gate works, all 5 sections live.
- .astro/ added to gitignore during review

## What is in flight

- Nothing

## What is next (candidates — need PO direction)

1. **Deploy**: expose port 8788 via cloudflared tunnel to aperture.merulox.com, run `npm start` as a systemd --user service
2. **Auto-refresh**: dashboard is currently load-time only; add periodic refresh (meta refresh or fetch poll)
3. **More data**: realm vitals has more fields (vision/society, timespace, infra) not yet surfaced

---

## How to run

```bash
cd ~/projects/aperture
npm run build
npm start    # serves on port 8788, auth m:st
```

---

## Resume instructions

1. Read PROJECT.md open decisions — get PO answers
2. Read ~/projects/genesis/ambient-interface-vision.md for design tone
3. Read ~/projects/genesis/.agent/CONTEXT.md for genesis state
4. Then write AP-01 brief
