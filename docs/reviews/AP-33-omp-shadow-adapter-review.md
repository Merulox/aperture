# Review Report: AP-33 — Kernel v2 OMP Shadow Adapter

Verifier: accountable lead `omp-kernel-v2-adapter`
Date: 2026-07-25
Brief: `docs/planning/AP-33-omp-shadow-adapter.md`
Kernel contract: `~/kernel/v2/tasks/K2-AD01-omp-shadow-adapter.md`
Independent oracle: not required by the approved contract

---

## FINAL VERDICT

**PASS** — the opt-in shadow adapter works end to end and remains contained. This verdict does not approve a default OMP/Kernel v2 cutover; K2-P02/K2-P03 and explicit Product Owner cutover approval remain pending.

## Acceptance check

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Existing Codex default unchanged | PASS | `/tasks` loaded in authenticated Chromium with the existing task sections and `Send to Codex` actions. `git diff --exit-code -- src/pages/api/launch-codex.ts` exited 0; SHA-256 is `80bd6702f031e2cb28a4befced51f09576c6a8844d53a1544b6cb4e6c3d2d1d5`. |
| 2 | Explicit opt-in only | PASS | `/omp` exposes separate launch buttons and states “No automatic merge, commit, restart, deploy, or Codex cutover.” No worker remained after verification. |
| 3 | Contract allowlist | PASS | Missing path and out-of-root requests returned 400; invalid evidence contracts returned 422; proposed status and completed evidence returned 409; symlink escape returned 400. |
| 4 | Disposable workspace | PASS | Successful run `d323fb22-f49f-4f85-a3bc-cbe16d6191b3` used `/home/merulox/.local/share/aperture/omp-runs/workspaces/<run-id>` and changed only its clone. |
| 5 | Protected host filesystem | PASS | Worker mounts were limited to its clone (only writable repository mount), immutable run artifacts, OMP/native binaries, and read-only Nix toolchains. Home, canonical checkout, Kernel, Obsidian, Podman socket, and verifier storage were absent. |
| 6 | Credential indirection | PASS | Worker had no credential store or token mount. Gateway state contains no `agent.db`. OpenAI Codex broker-backed credential and completion probes passed. |
| 7 | Limited network | PASS | Worker had only `aperture-omp-shadow=10.89.0.3`; gateway port 49555 was reachable and direct `1.1.1.1:443` was blocked. Both adapter networks are internal with validated `/24` subnets. |
| 8 | Typed evidence | PASS | Host JSON records contain contract/runtime identity, clone, PID, timestamps, status, exit, session, model, paths, diff, and structured failure details. |
| 9 | Ownership enforcement | PASS | Boundary-mutant run `de7e72e0-dfd3-4d49-8f1a-8ea21e27d2af` exited 0 at the worker layer but the host marked it `failed`, `failureClass=ownership_violation`, and listed `.aperture-shadow-violation.txt`. |
| 10 | Cancellation | PASS | Immediate launch/duplicate/cancel exercise returned 202/409/200. Run `f19b8b76-9b34-4e0f-ac2a-722731edb7b0` ended `cancelled` with `operator_cancelled` evidence. Unknown and terminal cancellation returned 404 and 409. |
| 11 | No automatic promotion | PASS | Successful diff is retained at the run artifact path; `.aperture-shadow-proof.txt` is absent from the canonical Aperture checkout. |
| 12 | Real UI and service health | PASS | Authenticated desktop and 390px Chromium checks passed with no horizontal overflow. `/tasks` still loaded. Aperture, broker, and gateway units are active/running/success. |

## Deterministic gates

### Build

`npm run build` exited 0 after the final cancellation-state repair. Astro generated the server and client bundles successfully in 3.60 seconds.

Raw captured output: `artifact://250`

### Service health

```text
Id=aperture.service
ActiveState=active
SubState=running
Result=success
Id=omp-auth-broker.service
ActiveState=active
SubState=running
Result=success
Id=omp-auth-gateway.service
ActiveState=active
SubState=running
Result=success
```

Raw captured output: `artifact://267`

Tracked deploy unit files are byte-identical to the installed user units (`cmp` exit 0 for broker and gateway).

### Network policy

```text
aperture-omp-control internal=true 10.89.1.0/24 gateway=10.89.1.1
aperture-omp-shadow internal=true 10.89.0.0/24 gateway=10.89.0.1
```

The broker is control-only. The gateway joins control, shadow, and public Podman networks. The worker joins shadow only. Broker startup validates both subnets, preventing an existing wrong network from being silently reused.

### Credential health

`podman exec aperture-omp-gateway /usr/local/bin/omp auth-gateway check --strict --json` observed:

- `openai-codex`: OAuth credential `ok: true`, remote refresh enabled, completion probe `ok: true`.
- `anthropic`: refresh failed with broker HTTP 500. This provider is not permitted by the adapter's model allowlist and did not affect the exercised OpenAI path; it remains an operational limitation for any future Anthropic-enabled adapter.

## Real-system run evidence

### Successful model-backed proof

Run: `d323fb22-f49f-4f85-a3bc-cbe16d6191b3`

```text
status=succeeded
exitCode=0
sessionId=019f99c4-1ad9-7000-ab20-e63f57fffca0
changedPaths=[.aperture-shadow-proof.txt]
disallowedPaths=[]
failureClass=null
```

Artifacts:

- Record: `~/.local/share/aperture/omp-runs/d323fb22-f49f-4f85-a3bc-cbe16d6191b3.json`
- Contract snapshot: `~/.local/share/aperture/omp-runs/artifacts/d323fb22-f49f-4f85-a3bc-cbe16d6191b3/intent.md`
- JSONL: `~/.local/share/aperture/omp-runs/artifacts/d323fb22-f49f-4f85-a3bc-cbe16d6191b3/omp.jsonl`
- Diff: `~/.local/share/aperture/omp-runs/artifacts/d323fb22-f49f-4f85-a3bc-cbe16d6191b3/changes.patch`

The retained diff contains one new line: `OMP_SHADOW_PROOF_OK`. Relaunch was blocked in both the listing (`runnable=false`, latest `succeeded`) and authoritative POST route (409 with the prior run ID).

### Ownership boundary mutant

Run: `de7e72e0-dfd3-4d49-8f1a-8ea21e27d2af`

```text
worker exitCode=0
host status=failed
changedPaths=[.aperture-shadow-proof.txt,.aperture-shadow-violation.txt]
disallowedPaths=[.aperture-shadow-violation.txt]
failureClass=ownership_violation
```

### Cancellation

Run: `f19b8b76-9b34-4e0f-ac2a-722731edb7b0`

```text
launch=202
duplicate launch=409
cancel=200
status=cancelled
failureClass=operator_cancelled
changedPaths=[]
```

`podman ps --filter name=aperture-omp-run` returned no running worker containers after verification.

## Negative and boundary responses

| Case | Result |
|---|---|
| Missing `contractPath` | 400 `contractPath is required.` |
| `/etc/passwd` contract | 400 outside Kernel v2 task root |
| Symlink in task root to `/etc/passwd` | 400 outside Kernel v2 task root |
| Completed K2-QA01 evidence | 409 already has successful evidence |
| Successful shadow proof relaunch | 409 with prior run ID |
| `status: proposed` | 409 status must be ready |
| `evidence_path: ../outside.md` | 422 repository escape |
| Unsupported `evidence.bin` | 422 supported path/sentinel requirement |
| Broken Git-root fixture | 503 not a Git repository |
| Missing gateway | 503 gateway inspect failure; no worker launch |
| Duplicate active launch | 409 with active run ID |
| Unknown cancellation | 404 run not found |
| Terminal cancellation | 409 already cancelled |

Temporary validation contracts were removed after the checks. Proof, ownership, and cancellation contracts were archived under `~/kernel/v2/pilots/K2-AD01-shadow/`; immutable per-run contract snapshots remain with run artifacts.

## Browser evidence

Desktop:

```text
viewport=1440x1000
contracts=[K2-AD01,K2-QA01]
scrollWidth=1440
clientWidth=1440
horizontalOverflow=false
```

Screenshot: `~/.local/share/aperture/omp-runs/verification/omp-desktop.png`

Mobile:

```text
viewport=390x844
scrollWidth=390
clientWidth=390
outOfBoundsElements=[]
```

Screenshot: `~/.local/share/aperture/omp-runs/verification/omp-mobile-390.png`

## Repair history

1. A machine freeze interrupted an Astro build after it had replaced part of `dist/`, leaving `entry.mjs` pointing at a missing manifest. Aperture entered a restart loop. The service was stopped, no build/systemctl process remained, and a clean standalone build restored the service.
2. Evidence completion initially existed only in the listing route. The same check was moved into the authoritative launch path, successful run records were included, and repository-contained evidence paths became parser-enforced.
3. Immediate cancellation exposed a launch/stop/finalizer race. A typed `cancelling` state now records operator intent before signalling Podman; concurrent finalization preserves `cancelled` rather than misclassifying SIGTERM as worker failure. The exact immediate sequence then passed 202/409/200.

## Limitations and non-goals

- Shadow and opt-in only; no default cutover.
- Direct mode and `openai-codex/gpt-5.6-sol` only.
- No automatic promotion or protected hidden-oracle execution.
- No claim that K2-P02 or K2-P03 is complete.
- Anthropic broker refresh is currently unhealthy; the approved OpenAI model path is healthy.
