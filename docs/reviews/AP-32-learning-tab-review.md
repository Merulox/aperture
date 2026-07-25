# Review Report: AP-32 — Agentic QA Learning Tab

Reviewer: independent reviewer agent `ReviewAP32Learning`
Date: 2026-07-24
Brief: `docs/planning/AP-32-learning-tab.md`

---

## DONE LOOKS LIKE — criterion check

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Global Learning navigation and current state | PASS | Authenticated Chromium DOM reported `learning` as the current non-link tab at `/learning`. |
| 2 | All 13 skills render in priority and phase order | PASS | 13 disclosures observed: Foundation 1–4, Assurance 5–8, Autonomy 9–13; order and status matched canonical JSON. |
| 3 | One active skill and formal methods later | PASS | Vitals showed active `1`, complete `0`; priority 1 was active and priority 13 was later. |
| 4 | Runtime canonical JSON backing | PASS | DOM-to-file comparison matched metadata, phase titles/objectives, 13 skills, and every ordered skill field/tool; mismatch list was empty. |
| 5 | Every skill exposes required learning fields | PASS | All 13 disclosures contained why, competency, first exercise, and a non-empty tool list. |
| 6 | Desktop and 390px layouts are legible | PASS | At 390px: `scrollWidth=390`, `clientWidth=390`, out-of-bounds scan `[]`; desktop/mobile screenshots showed no clipping or overlap. |
| 7 | Build and live production service pass | PASS | `npm run build` exited 0; `systemctl --user is-active aperture.service` returned `active`; authenticated live page checks passed. |

## Verify commands run

### `npm run build`

```text
> aperture@0.1.0 build
> astro build

11:41:50 [@astrojs/node] Enabling sessions with filesystem storage
11:41:50 [content] Syncing content
11:41:50 [content] Synced content
11:41:50 [types] Generated 33ms
11:41:50 [build] output: "server"
11:41:50 [build] mode: "server"
11:41:50 [build] directory: /home/merulox/projects/aperture/dist/
11:41:50 [build] adapter: @astrojs/node
11:41:50 [build] Collecting build info...
11:41:50 [build] ✓ Completed in 65ms.
11:41:50 [build] Building server entrypoints...
11:41:51 [vite] ✓ built in 1.12s
11:41:51 [build] ✓ Completed in 1.15s.

 building client (vite)
11:41:51 [vite] transforming...
11:41:53 [vite] ✓ 1083 modules transformed.
11:41:53 [vite] rendering chunks...
11:41:53 [vite] computing gzip size...
11:41:53 [vite] dist/client/_astro/jsx-runtime.D_zvdyIk.js                                       0.73 kB │ gzip:  0.46 kB
11:41:53 [vite] dist/client/_astro/Nav.Bv7mAYY0.js                                               1.01 kB │ gzip:  0.48 kB
11:41:53 [vite] dist/client/_astro/CodeGraph.CqCmRC6U.js                                         2.45 kB │ gzip:  1.21 kB
11:41:53 [vite] dist/client/_astro/LeadConsole.Dw9HZvJQ.js                                       4.54 kB │ gzip:  2.04 kB
11:41:53 [vite] dist/client/_astro/index.astro_astro_type_script_index_0_lang.CD-fSXDI.js        5.71 kB │ gzip:  1.95 kB
11:41:53 [vite] dist/client/_astro/CodePanel.astro_astro_type_script_index_0_lang.DV1ZIusB.js    7.82 kB │ gzip:  2.57 kB
11:41:53 [vite] dist/client/_astro/index.DRLpaEKk.js                                             7.98 kB │ gzip:  3.11 kB
11:41:53 [vite] dist/client/_astro/OrbitPanel.D89F89Cz.js                                       14.47 kB │ gzip:  5.49 kB
11:41:53 [vite] dist/client/_astro/BorealPanel.jsIONbci.js                                      24.12 kB │ gzip:  7.62 kB
11:41:53 [vite] dist/client/_astro/Taskboard.DVfisc8Y.js                                        25.40 kB │ gzip:  5.29 kB
11:41:53 [vite] dist/client/_astro/client.CPtVzK63.js                                          186.79 kB │ gzip: 58.56 kB
11:41:53 [vite] dist/client/_astro/react-force-graph-2d.6boV2abh.js                            186.98 kB │ gzip: 61.43 kB
11:41:53 [vite] ✓ built in 1.63s

 prerendering static routes
11:41:53 ✓ Completed in 18ms.

11:41:53 [build] Rearranging server assets...
11:41:53 [build] Server built in 2.87s
11:41:53 [build] Complete!
```

Exit: `0` — PASS.

### `systemctl --user is-active aperture.service`

```text
active
```

Exit: `0` — PASS.

### Authenticated browser checks

```json
{
  "title": "Learning · Aperture",
  "skillDisclosures": 13,
  "activeDisclosures": 1,
  "firstDisclosureOpen": true,
  "viewport": {
    "innerWidth": 390,
    "clientWidth": 390,
    "scrollWidth": 390,
    "outOfBoundsElements": []
  },
  "canonicalFieldMismatches": []
}
```

Result: PASS.

## File scope check

Owned implementation files observed:

- `src/lib/nav.ts`
- `src/pages/learning.astro`
- `~/kernel/project/LEARNING.json`

Architect bookkeeping outside the implementation ownership list:

- `.agent/CONTEXT.md`
- `.agent/TASKS.md`
- `docs/planning/AP-32-learning-tab.md`
- `docs/reviews/AP-32-learning-tab-review.md`

The reviewer found no provable executor scope violation. Unrelated existing workspace changes were not attributed to AP-32.

## Issues found

None.

## FINAL VERDICT

**PASS** — all seven criteria met. Independent reviewer confidence: `0.99`.
