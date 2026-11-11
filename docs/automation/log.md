# Autopilot log

One entry per iteration, newest last.

## 2026-11-10 — setup
- Installed the Codex CLI (0.167.1, signed in through ChatGPT). A smoke test of an unattended run passed: sandboxed writes and network work; npm's cache needed an explicit `--add-dir`.
- Added `scripts/codex-run.mjs`. It runs a ticket in worktree `../TasksNearMe-ui` on port 3100, re-checks the result with `check:ui`, commits on the ticket branch, and writes `automation/runs/<ticket>.json`.
- Added this runbook (`AUTOPILOT.md`) and the state, decisions, and blocked files. `AGENTS.md` now has unattended-run rules; Codex no longer edits `docs/ui/progress.md`.
- Environment: Docker is installed but the daemon is stopped; no local Postgres. The database decision is the next Phase 1 step.

## 2026-11-11 — iteration 1 (Phase 1: database)
- Codex: UI-002 started unattended at 05:50 UTC (worktree `../TasksNearMe-ui`, branch `ui/UI-002-shells-navigation`).
- Started Docker Desktop. Postgres 17.5 + PostGIS 3.5 runs in container `tasksnearme-db` (port 54329), with dev and test databases.
- Added Drizzle: `drizzle.config.ts`, `src/platform/db/{connect,client,schema,columns,ids}.ts`, and the schemas for markets, areas, categories, market categories, policies, feature flags, `audit_log`, `outbox_events`. Migrations `0000_postgis`, `0001_markets_audit_outbox`.
- Seeds: Austin market, 12 areas, 5 categories with price guidance, policy v1 (published) and v2 (draft), flags. Scripts: `db:up/down/generate/migrate/seed/reset`, `test:db`.
- Checks: `npm run check` (55 tests) and `npm run test:db` (4 tests) pass.
