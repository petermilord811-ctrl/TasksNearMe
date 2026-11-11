# Autopilot log

One entry per iteration, newest last.

## 2026-11-10 — setup
- Installed the Codex CLI (0.167.1, signed in through ChatGPT). A smoke test of an unattended run passed: sandboxed writes and network work; npm's cache needed an explicit `--add-dir`.
- Added `scripts/codex-run.mjs`. It runs a ticket in worktree `../TasksNearMe-ui` on port 3100, re-checks the result with `check:ui`, commits on the ticket branch, and writes `automation/runs/<ticket>.json`.
- Added this runbook (`AUTOPILOT.md`) and the state, decisions, and blocked files. `AGENTS.md` now has unattended-run rules; Codex no longer edits `docs/ui/progress.md`.
- Environment: Docker is installed but the daemon is stopped; no local Postgres. The database decision is the next Phase 1 step.
