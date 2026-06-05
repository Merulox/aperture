# Aperture — Project Context

Last updated: 2026-06-05
Updated by: architect (AP-01 reviewed + accepted)

---

## Current state summary

AP-01 dashboard is DONE and DEPLOYED. Live at https://aperture.merulox.com (401 without auth, 200 with m/st). SSR Astro, 5 sections from live state files. Committed at 15afd3f.

## Deployment (2026-06-05)
- App runs as `aperture.service` (systemd --user), enabled, on 127.0.0.1:8788. Log: /tmp/aperture.log
- Exposed via existing `boreal-webhook` cloudflared tunnel (UUID 5d1b9c57...). Ingress rule added to ~/.cloudflared/config.yml: aperture.merulox.com → localhost:8788
- DNS: CNAME aperture.merulox.com → 5d1b9c57...cfargotunnel.com, proxied, created manually in Cloudflare dashboard (tunnel cert is scoped to borealnumerique.ca, so CLI route dns couldn't write the merulox.com record)
- Registered in commander as service `aperture`
- ⚠️ KNOWN GAP: `boreal-tunnel.service` is DISABLED (no auto-start on boot). After a reboot, aperture (+ commander, genesis) are unreachable until the tunnel is manually started. Enable with: systemctl --user enable boreal-tunnel.service

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
