# Context

## Objective

Aperture is the self-hosted, auth-gated interface that makes the personal agent stack's live internal state visible. The City surface normalizes `notice → inspect → understand → converse → decide → deliver → observe changed state` without taking authority from Genesis, Realm, Orbit, Boréal, OMP, or other source systems.

## Current state

- Working behavior: the Astro SSR dashboard is deployed at `https://aperture.merulox.com` and projects mode, health, Genesis, tasks/Codex, services, learning, workflows, City, OMP, Orbit, Boréal, code, red-team, and jailbreak state. Realm's generated MANIFEST records `aperture.service` running.
- City behavior: the Genesis vertical slice reads runtime-v2 state, durably persists `message.send`, performs explicit asynchronous `resident.wake`, and reconciles event/run/trace/decision/wake receipts. Fixture interactions remain labelled simulation. Later committed surfaces include Realm workflow-atlas and bounded jailbreak control/evaluation.
- Active constraint: the app is host-bound to `/home/merulox/...`. City is a federation/projection, not a universal runtime; adapters preserve source authority/native status, secrets are never rendered, and only declared commands are accepted.
- Known blocker: none is recorded in current task/risk ledgers. The older tunnel-disabled warning is stale runtime prose; verify boot enablement directly instead of treating it as a current outage.

## Interfaces

- Production/local: `https://aperture.merulox.com`; `aperture.service` on `127.0.0.1:8788`; Basic auth on all routes.
- Implemented City bridge: authenticated `GET/POST /api/city-genesis` for declared `message.send` and `resident.wake` actions.
- Operator APIs include task/Codex/OMP, Boreal, Signaler, and City-economy surfaces. Protocol-only future endpoints must not be described as implemented.
- Current architecture sources: `README.md`, `docs/city/README.md`, `docs/city/adapters.md`, `.agent/TASKS.md`, and `.agent/RECOVERY.md`.

## Repository

Branch `main`; HEAD and recorded `origin/main` are `af6b634275c6b3dc360e2631ce588fa29fd78acc` at this update. Preserve the unrelated City economy/style worktree changes.
