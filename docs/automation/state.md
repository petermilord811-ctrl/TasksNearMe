# Autopilot state

**Updated:** 2026-11-10 (autopilot setup)
**Phase:** 1 — Foundation
**Codex:** UI-002 (shells and navigation): launching now via `scripts/codex-run.mjs UI-002`

## Next steps
1. Start the Codex run for UI-002 (background) and confirm it's running (`automation/runs/UI-002.json`).
2. Database: decide Docker Postgres+PostGIS vs PGlite. Then Drizzle setup, the core schema (blueprint 08 §3), migrations, and seeds from `src/fixtures`.
3. Auth and session: Better Auth email codes with a dev mail outbox; dev "sign in as"; `getViewer()` / `getShellViewer()`.
4. Prepare UI-003 (public pages): contracts, fixtures, ticket. Launch it when UI-002 is merged.
5. When UI-002 is handed off: merge, review, wire the route-group layouts with the shells, and add `setMode` / `signOut` server actions.

## Open issues
- None.
