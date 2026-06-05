# Task AP-01: Aperture Dashboard — v1

Status: ready for a builder. Written by the architect 2026-06-05.
Read `~/agent-infra/agents/executor.md` first.

---

## GOAL

Build the Aperture dashboard: a dark, monospace, server-rendered web page that reads five local state files and presents them as a live ambient view of the Genesis/realm system. Protected by HTTP Basic Auth (m/st). Runs on port 8788, intended for cloudflared tunnel.

## WHY

Aperture is the web face of Genesis — a at-a-glance view of system state without opening a terminal. Reads live data at request time so it's always current. The design mirrors Genesis's personality: quiet, dense, informational, no chrome.

## PREREQUISITE

- Node.js and npm available
- Run `npm install` in ~/projects/aperture/ first
- The data files below must exist (they do on navi)

## FILES IT OWNS

```
src/middleware.ts          — Basic Auth gate
src/pages/index.astro      — main dashboard page (replace placeholder)
src/lib/data.ts            — file readers returning typed data
src/styles/global.css      — design tokens + layout
```

Create `docs/planning/` directory if it doesn't exist.

## DO NOT TOUCH

- `astro.config.mjs` — already configured for SSR + Node adapter
- `package.json` — already has correct scripts and deps
- `.agent/` — project memory, read-only

## DATA SOURCES

All files live on the local filesystem. Read them with Node.js `fs` at request time.

### 1. Health signals + pending decisions
**File:** `/home/merulox/obsidian/knowledge/projects/genesis/health.json`
**Format:** JSON
**Key fields to use:**
```json
{
  "tick": 7497,
  "updated": "2026-06-05T13:59:00",
  "status": "FROZEN_PIVOT",
  "phase": "AWAITING_PARTNER_LIFT",
  "cost_usd": 0.0,
  "cost_limit_usd": 5.0,
  "runway_days": 13,
  "pipeline": {
    "sent": 535,
    "replied": 76,
    "note": "..."
  },
  "pending_decisions": [
    { "item": "...", "urgency": "HIGH", "last_raised": "2026-06-03T11:24:00" }
  ]
}
```

### 2. Genesis live state
**File:** `/home/merulox/obsidian/knowledge/projects/genesis/live-state.md`
**Format:** Markdown — first ~5 lines after the `# Genesis Live State` heading
Extract: **Updated:** date, **Tick:**, **Active rule:**, first sentence of the tick log entry.

### 3. Vital signs
**File:** `/home/merulox/projects/realm/commons/vitals.json`
**Format:** JSON
**Key fields:**
```json
{
  "ts": "2026-04-12T...",
  "realm": { "agents_active": 58 },
  "logic": { "critical_failpoints": 1 },
  "knowledge": { "vault_claims": 942, "open_conflicts": 102 },
  "ambitions": [{ "id": "A1", "label": "...", "score": 0.333 }]
}
```

### 4. Current mode
**File:** `/home/merulox/projects/realm/mode.json`
**Format:** JSON
**Key fields:**
```json
{
  "current": "EARLY_STAGE",
  "modes": {
    "EARLY_STAGE": {
      "goal": "First 2 clients on retainer. $0 → $1,600 MRR."
    }
  }
}
```

## AUTH MIDDLEWARE

Create `src/middleware.ts`:

```ts
import type { MiddlewareHandler } from 'astro';

const USER = 'm';
const PASS = 'st';
const EXPECTED = 'Basic ' + btoa(`${USER}:${PASS}`);

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const auth = ctx.request.headers.get('authorization');
  if (auth !== EXPECTED) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="aperture"' },
    });
  }
  return next();
};
```

## DESIGN SPEC

**Palette:**
```css
--bg: #0a0a0a;
--surface: #111111;
--text: #e0e0e0;
--muted: #555;
--green: #4ade80;
--yellow: #f59e0b;
--red: #ef4444;
--blue: #60a5fa;
```

**Font:** `'Berkeley Mono', 'Fira Code', 'Cascadia Code', monospace`

**Layout:** single page, CSS grid, 2 columns on wide screens, 1 column on narrow.
No borders between sections — use `background: var(--surface)` + padding to delineate.
Small, tight spacing. Data-dense but readable. No decorative elements.

**Header:** `aperture` in small caps + current status badge (color by status) + tick number + timestamp.

**Sections:**

1. **MODE** (top left)
   - Current mode name in large-ish monospace
   - Goal sentence in muted text
   - Small label: "mode"

2. **HEALTH** (top right)
   - Status badge (color: green=ok, yellow=warning, red=frozen/critical)
   - phase string
   - runway_days + cost_usd / cost_limit_usd
   - pipeline: N sent / N replied

3. **GENESIS STATE** (full width)
   - "tick N · updated DATETIME · active rule: ..."
   - First ~2 sentences of the latest tick log entry
   - Muted, small — informational

4. **PENDING DECISIONS** (full width)
   - Count badge: "N pending"
   - List: `○ [urgency badge] item — last raised: date`
   - Urgency colors: HIGH=red, MED=yellow, LOW=muted
   - If empty: `— none —` in muted text

5. **VITAL SIGNS** (full width, bottom)
   - Inline: `agents 58 · claims 942 · conflicts 102 · failpoints 1`
   - Ambitions: A1 label · score 0.33 (progress bar optional but not required)
   - Vitals timestamp (note if stale: > 7 days = show in yellow)

**Status badge colors by `health.json.status`:**
- ACTIVE / OK → green
- FROZEN_PIVOT / FROZEN → yellow
- CRITICAL / ERROR → red
- anything else → muted

## DONE LOOKS LIKE

1. `npm install && npm run build` completes without errors
2. `npm start` starts the server on port 8788
3. Visiting `http://localhost:8788` shows a Basic Auth prompt; entering m/st unlocks the page
4. Dashboard renders with all 5 sections populated from the actual data files
5. Pending decisions list shows the real items from health.json
6. Genesis state shows the real tick + active rule text
7. Mode section shows EARLY_STAGE and the goal text
8. No broken layout, no placeholder text, no console errors

## VERIFY WITH

```bash
cd ~/projects/aperture
npm install
npm run build
npm start &
sleep 2
# should return 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:8788/
# should return 200
curl -s -o /dev/null -w "%{http_code}" -u m:st http://localhost:8788/
# kill test server
kill %1
```

Expected: first curl prints `401`, second prints `200`.

Provide a screenshot or HTML snippet of the rendered page in your report.

## OUT OF SCOPE

- Multiple pages, routing beyond index
- Real-time WebSocket / auto-refresh (manual page reload is fine for v1)
- cloudflared tunnel setup (that's a system config task, not a web build task)
- Editing any data file from the dashboard
- Mobile optimization (desktop-first is fine)
- Any change to genesis daemon or realm scripts
