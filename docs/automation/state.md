# Autopilot state

**Updated:** 2026-11-11 (iteration 1)
**Phase:** 1 — Foundation
**Codex:** UI-002 (shells and navigation) running since 05:50 UTC. See `automation/runs/UI-002.json`.
**Database:** Docker `tasksnearme-db` (Postgres 17.5 + PostGIS). Start with `npm run db:up` if stopped.

## Done in Phase 1
- Database infrastructure, markets schema, migrations, seeds, integration tests.

## Next steps
1. Auth and session: Better Auth (email one-time code; dev mail outbox page), Drizzle adapter, user fields (first/last name, phone, mode, status). Seed people from `src/fixtures` (Maya, Jordan, Sam, Lee, Priya, Chris, Ruth, staff). `getViewer()` / `getShellViewer()`. Dev-only "sign in as".
2. Profiles and staff-roles schema (helper_profiles, helper_services, staff_roles) in the same increment as the people seed.
3. Prepare UI-003 (public pages): contracts (`marketing`, categories view), fixtures, ticket. Launch it when UI-002 is merged.
4. When UI-002 is handed off: merge, review, wire the route-group layouts with the shells, and add `setMode` / `signOut` server actions.
5. Platform: injectable clock with dev time travel; outbox dispatcher plus jobs (graphile-worker); fake-provider registry.

## Open issues
- None.
