# Prompt 20 — Final QA and handoff to the backend phase

**Plan first:** no · **Depends on:** 19 · **Branch:** `ui/20-handoff`

## Read first
- `AGENTS.md`
- `docs/ui-progress.md`, `docs/ui-qa-report.md`
- `docs/blueprint/02-sitemap-and-journeys.md` §1
- `docs/codex/ui-contract.md` §13
- `docs/blueprint/07-architecture.md` §2 and §8 (providers)
- `docs/blueprint/09-apis-events-idempotency.md` §2 (API routes)
- `docs/blueprint/11-initial-backlog.md` (backend backlog)

## Build
1. **Route inventory.** Compare every route in blueprint 02 §1 and ui-contract §13 with the app. Fix anything missing, or document why it's missing.
2. **Screenshot gallery.**
   - Run `npm run shots` for every route × scenario entry.
   - Generate `artifacts/screenshots/index.html`, grouped by area, with phone and desktop side by side.
3. **`docs/integration-points.md`:**
   - Every `TODO(integration)`: file, component or function, provider, and the blueprint section that defines the real behavior.
   - Every mock-backed query and action: module, function, signature, and the blueprint API route (09 §2) or service it maps to.
   - Dev-only code to keep guarded or remove.
   - Environment variables the backend will need (names only, no values).
4. **Root `README.md`:**
   - What the app is, and how to run it.
   - Scripts; how to use the dev toolbar and scenarios.
   - Folder structure; testing; dependencies, with one line each on why.
   - Links to the kit and the blueprint.
5. **Cleanup.**
   - Remove unused components and dead code. No `console.log`.
   - The production build must have: `/dev/*` returning 404, no toolbar, and the placeholders' Demo badges still visible (intended).
6. **Final run.** `npm run check`, `npm run build`, and `npm run e2e` all pass. Every item in `docs/ui-progress.md` is checked or annotated.

## Acceptance
All of the above. Summary lists anything still open.

## Out of scope
Starting the backend.

## Review (for the human)
Open `artifacts/screenshots/index.html` and read `docs/integration-points.md`. Then commit and tag the result:

```
git tag ui-complete
```
