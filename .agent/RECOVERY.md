# Recovery

## Last known good state

- Branch and commit:
- Verified behavior:
- Verification command:
- Expected result:

## Resume

1. Read `PROJECT.md`, `CONTEXT.md`, `TASKS.md`, and `DECISIONS.md`.
2. Confirm the branch, worktree, and active task before editing.
3. Run the recorded verification command before changing state.

## Restore

- Backup or checkpoint:
- Restore command:
- Post-restore check:

## Agent handoffs

Handoffs are append-only. Every handoff records:

- Timestamp, source role, and destination role
- Summary of completed work
- Exact next action
- Blocker, or `none`
- Branch/commit and changed files
- Verification command and observed result
