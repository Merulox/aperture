# Task AP-32: Agentic QA Learning Tab

Status: done
Written by: architect, 2026-07-24
Review: `docs/reviews/AP-32-learning-tab-review.md` — PASS, 2026-07-24

<!-- gates: depends=[]; inputs=[]; confirms=[] -->

Read `~/kernel/agents/executor.md` before starting.

---

## GOAL

Aperture exposes a production Learning tab backed by the canonical kernel Agentic QA curriculum.

## WHY

The Agentic QA research produced an ordered operator curriculum. It needs a visible re-entry surface so learning work compounds alongside the kernel gauntlet build instead of remaining buried in a report.

## PREREQUISITE

The canonical research report exists at `~/kernel/docs/research/agentic-qa-gauntlets-2026-07-24.md`.

## FILES IT OWNS

```text
src/lib/nav.ts                  — register the Learning route
src/pages/learning.astro        — render the filesystem-backed curriculum
~/kernel/project/LEARNING.json  — canonical ordered curriculum and status
```

## DO NOT TOUCH

- Existing Aperture routes or navigation semantics
- Aperture authentication middleware
- The research report's claims or sources
- Cloudflare tunnel configuration

## DONE LOOKS LIKE

1. The global Aperture navigation contains `learning`; `/learning` renders it as the current tab.
2. The page renders all 13 researched skills in priority order across Foundation, Assurance, and Autonomy phases.
3. Behavioral specification and oracle design is the only active skill; formal methods literacy is explicitly later.
4. Skill content is loaded from `~/kernel/project/LEARNING.json` at request time rather than duplicated in the page.
5. Every skill exposes why it matters, target competency, tools, and a first exercise.
6. The desktop layout is legible and the 390px layout has no horizontal overflow.
7. `npm run build` passes and the production `aperture.service` serves the page.

## VERIFY WITH

```bash
cd ~/projects/aperture && npm run build
systemctl --user is-active aperture.service
```

Then authenticate to `http://127.0.0.1:8788/learning` in a real browser and verify:

- document title is `Learning · Aperture`
- the page includes the first and thirteenth skills
- exactly 13 skill disclosures render
- the first disclosure is expanded
- `document.documentElement.scrollWidth === document.documentElement.clientWidth` at 390px
- desktop and mobile screenshots show no overlap, clipping, or unreadable content

## OUT OF SCOPE

- Editing curriculum state from the browser
- Automated lesson delivery
- Learning analytics or persistence beyond the canonical JSON file
- Implementing the Agentic QA gauntlet itself

## EXECUTOR

either
