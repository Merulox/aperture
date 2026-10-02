# Recovery

## Repository and state

- Path: `/home/merulox/projects/aperture`
- Branch: `main`; obtain the current commit and upstream relation with `git status --short --branch`.
- Current sources: `.agent/CONTEXT.md`, `.agent/TASKS.md`, `README.md`, and `docs/city/`.

## Resume sequence

1. Run `dev context aperture`, `dev review aperture`, and `git status --short --branch`; preserve the existing City economy/style worktree changes.
2. Read `.agent/CONTEXT.md`, `.agent/TASKS.md`, `.agent/DECISIONS.md`, `.agent/RISKS.md`, `README.md`, and `docs/city/README.md`.
3. Check `systemctl --user is-active aperture.service` and `systemctl --user is-enabled boreal-tunnel.service`. Runtime state overrides old prose.
4. Probe the local auth gate without credentials: `curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8788/`; expected HTTP status is `401` when the server and Basic-auth middleware respond.
5. Before editing a symbol, follow `AGENTS.md`: inspect the relevant GitNexus execution flow and upstream impact. Before committing, run staged `detect-changes` against `main`.
6. Use GET-only checks during recovery. Do not POST to City endpoints unless the durable message/wake side effect is explicitly intended.

## Restored state

A restored Aperture projects source-system truth without becoming its authority; fixture-backed interactions remain labelled. No repository-specific backup checkpoint is recorded here. Recover tracked task-owned files from an explicitly selected commit only after inspecting the dirty worktree.
