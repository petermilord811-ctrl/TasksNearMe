# Autopilot decisions

Non-obvious choices made without asking, with the reason and the alternative. Newest last.

| Date | Decision | Why | Alternative |
|---|---|---|---|
| 2026-11-10 | Codex runs unattended via `codex exec --approve-for-me` (workspace-write sandbox with network) in a sibling git worktree `../TasksNearMe-ui`, on port 3100, one ticket at a time | Claude and Codex can work in parallel without editing the same files or fighting over port 3000; the sandbox limits what Codex can touch | `--dangerously-bypass-approvals-and-sandbox` (no sandbox; rejected as unnecessary risk) |
| 2026-11-10 | Claude updates `docs/ui/progress.md`; Codex writes only its handoff file | Avoids merge conflicts between the two worktrees | Codex edits its own progress row (caused conflicts in parallel runs) |
| 2026-11-10 | The autopilot commits locally to `main` after green checks; never pushes | The user asked for fully autonomous building; local commits are safe checkpoints | Ask before each commit (would stall the run) |
| 2026-11-11 | Local database: Docker `postgis/postgis:17-3.5` on port 54329, with a separate `tasksnearme_test` database | Docker Desktop was installed and started without interaction; matches production (Postgres + PostGIS) | PGlite or embedded Postgres (no PostGIS) |
| 2026-11-11 | Text primary keys with type prefixes (`usr_…`, `tsk_…`) instead of UUIDv7 | Readable in logs and fixtures; Better Auth uses text ids too | UUIDv7 columns |
| 2026-11-11 | A market is a center + radius; an area is a named center point (a location's area = nearest center) | Enough for one city; avoids drawing polygons now | Area polygons (blueprint 08); can be added later without changing callers |
| 2026-11-11 | DB integration tests run with `npm run test:db`, separate from `npm run check` | Codex's worktree and machines without Docker can still run `check` | Mixing DB tests into `check` |
