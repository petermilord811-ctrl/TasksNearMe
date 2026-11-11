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

## 2026-11-11 — iteration 2 (Phase 1: auth, people, shells)
- Codex: UI-002 handed off (22 min) and merged; UI-003 launched at 06:17 UTC and handed off at 06:33 UTC.
- Auth: Better Auth (email one-time codes, Drizzle adapter, prefixed ids), dev email outbox (`/dev/outbox`), `getViewer()`, `setMode`, `signOut`, staff two-step dev check, `/dev/sign-in`, optimistic `/app` redirect in `src/proxy.ts`. Migration `0002_accounts_profiles_dev_outbox`.
- People: users, staff roles, helper profiles, and services seeded from the canonical fixtures (Maya, Chris, Ruth, Ben, Ana, Jordan, Sam, Lee, Priya, five staff).
- UI-002 wired: route groups `(public)`, `(app)/app`, `admin/(gated)` render the Codex shells with the viewer.
- Fixed: parallel e2e sign-ins replaced each other's codes (now serialized per email); placeholder pages no longer nest `<main>`; `typecheck` runs `next typegen` first.
- Checks: `check` 126 tests, `test:db` 9, `e2e` 8 (mobile and desktop), `build` pass.

## 2026-11-11 — iteration 3 (public site, sign-in, content)
- UI-003 wired: fee engine (`modules/payments/fees`), cached market, category, and helper queries, seven public routes, metadata, and 12 e2e tests.
- UI-004 (Codex, 32 min) merged and wired:
  - `/sign-in`: server-driven steps, phone verification with a fake SMS provider, DB rate limits.
  - `/waitlist`, `/help`, `/help/[article]`, `/legal/[doc]`, with 8 help articles and 7 legal drafts.
  - 16 e2e tests.
- The runner's independent check failed only on environment problems: no `.env.local` in the worktree, and the harness timing out with 116+ previews. Fixed with an env copy, `/dev/ui` readiness, and a sharded harness.
- Mistake: `npm ci` in the main checkout while the dev server ran. Windows file locks left `node_modules` half-deleted. Recovered by stopping the server and reinstalling; added a runbook rule.
- UI-005 (board, public task, helper profile, `PublicShell` promise fix) launched at 07:20 UTC.
- Checks: `check` 277, `test:db` 15, `e2e` 36, `build` pass.
