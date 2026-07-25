# Task AP-33: Kernel v2 OMP Shadow Adapter

Status: done
Written by: architect, 2026-07-25
Review: `docs/reviews/AP-33-omp-shadow-adapter-review.md` — PASS, 2026-07-25
Kernel contract: `~/kernel/v2/tasks/K2-AD01-omp-shadow-adapter.md`

---

## GOAL

Aperture exposes an explicit, opt-in OMP execution path for ready Kernel v2 Direct contracts. Each run uses a disposable clone, gateway-only model access, pinned runtime inputs, host-owned typed evidence, and no automatic promotion to the canonical repository.

## SAFETY BOUNDARY

- Existing `/tasks` and `/api/launch-codex` remain the production default.
- The worker receives only its disposable clone, a read-only contract snapshot, a read-only model config, OMP, the pinned native addon, and the read-only Nix toolchain.
- OAuth databases and access/refresh tokens remain in the broker; workers call the gateway over the internal `aperture-omp-shadow` network.
- Success requires structured OMP completion plus a changed-path allowlist pass.
- Successful diffs remain evidence only. Nothing applies, commits, pushes, restarts, deploys, or cuts over automatically.

## ARCHITECTURE

```text
authenticated /omp
  -> POST /api/launch-omp with a Kernel task path
  -> host parses and validates the canonical intent contract
  -> host creates a local no-hardlink disposable clone + immutable artifacts
  -> rootless Podman worker on aperture-omp-shadow
  -> aperture-omp-gateway on shadow + control + public Podman networks
  -> aperture-omp-broker on control network only
  -> host finalizer records JSON lifecycle, structured output, diff, and ownership result
```

## OWNED IMPLEMENTATION

```text
package.json
package-lock.json
deploy/systemd/omp-auth-broker.service
deploy/systemd/omp-auth-gateway.service
deploy/systemd/omp-gateway-resolv.conf
src/lib/nav.ts
src/lib/omp.ts
src/components/omp/OmpPanel.tsx
src/pages/omp.astro
src/pages/api/omp-intents.ts
src/pages/api/launch-omp.ts
src/pages/api/omp-runs.ts
src/styles/global.css
docs/planning/AP-33-omp-shadow-adapter.md
```

Lead-owned host setup:

```text
~/.config/systemd/user/omp-auth-broker.service
~/.config/systemd/user/omp-auth-gateway.service
~/.local/share/aperture/omp-broker/
~/.local/share/aperture/omp-gateway/
~/.local/share/aperture/omp-runs/
```

Protected and unchanged:

```text
src/pages/api/launch-codex.ts
~/.omp/agent/agent.db
canonical target repositories
Kernel v2 verifier/oracle storage
```

## RUNTIME POLICY

- Supported contracts: files under `~/kernel/v2/tasks`, `status: ready`, `mode: direct`, model `openai-codex/gpt-5.6-sol`.
- Repository roots: `~/projects`, `~/kernel`, `~/syntra`, and `~/website`.
- Evidence is either the host-owned run-record sentinel or a repository-relative `.json`, `.md`, `.txt`, `.yaml`, or `.yml` path contained by the repository.
- Existing successful evidence, an earlier successful shadow run, or an active `queued|running|cancelling` run blocks relaunch.
- Cancellation transitions through `cancelling`, stops only the recorded Podman container, finalizes retained evidence, and ends at `cancelled`.
- Network names and subnets are fixed. Broker startup validates existing networks and fails before launch if either subnet differs.

## VERIFY WITH

```bash
cd ~/projects/aperture && npm run build
systemctl --user show aperture.service omp-auth-broker.service omp-auth-gateway.service --property=Id,ActiveState,SubState,Result
podman network inspect aperture-omp-control aperture-omp-shadow
podman exec aperture-omp-gateway /usr/local/bin/omp auth-gateway check --strict --json
```

Then use an authenticated real browser to exercise `/omp`, a successful disposable proof, ownership rejection, duplicate launch rejection, live cancellation, completed-evidence relaunch rejection, malformed/out-of-root/proposed/symlink/evidence traversal failures, `/tasks`, and desktop/390px layouts.

## ROLLBACK

1. Stop and disable `omp-auth-gateway.service` and `omp-auth-broker.service`.
2. Remove the `/omp` route, OMP API routes, adapter module, UI component, nav item, and styles.
3. Preserve `~/.local/share/aperture/omp-runs/` until evidence review is complete.
4. Existing Codex behavior needs no rollback because this adapter never changes or replaces it.

## OUT OF SCOPE

- Default OMP or Kernel v2 cutover.
- Automatic diff application, commit, push, merge, restart, or deploy.
- Fan-out, Mission, Routine, remote-host, or hidden-oracle execution.
- K2-P02/K2-P03 completion.
