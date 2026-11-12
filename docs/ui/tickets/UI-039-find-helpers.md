# UI-039 — Find helpers

**Status:** done, built by Claude on `main` (Codex at its usage limit; decisions.md) · **Depends on:** UI-003 (helper cards), UI-015 (saved helpers), UI-025 (request a helper)

## Goal
`/app/helpers` (blueprint 02 signed-in routes): the market's active helpers for a signed-in client, filtered from the URL by:
- category;
- the neighborhood they serve (within their service radius);
- open times this week;
- name.

Each helper card shows their next open time, an "Ask {name}" link (the request page) and a save toggle (`aria-pressed`). The viewer and blocked people never appear. When nothing matches, the page offers to post a task. Clients get a "Find helpers" item in their secondary navigation.

## Contracts and fixtures
- `src/contracts/helpers-browse.ts`: `HelperBrowseQuery`, `HelperBrowseRow`, `HelpersBrowsePageData`.
- `routes.app.helpers(query)`. Saving uses `SavedHelperHandlers` (`reviews.ts`).
- `src/fixtures/helpers-browse.ts`: `helpersBrowseData`, `helpersBrowseFilteredData`, `helpersBrowseEmptyData`.

## States to preview
`screen-helpers-browse/{default,filtered,empty}`

## Claude wiring notes
- Route: `/app/helpers` (signed in; the launch market).
- Query: `getHelpersBrowse`, `parseHelperBrowseQuery` in `src/modules/profiles/browse.ts`.
  - The SQL filters cover status, the market, the viewer and blocked people, name and category.
  - The area and open-times filters run in code (few helpers at launch).
  - Up to 60 helpers: most completed tasks first, then rating.
- Tests: integration `helpers-browse`; UI `helpers-browse-screen`; e2e `helpers-browse.spec` (Chris filters by category, saves Lee, finds him in saved helpers; signed-out visitors go to sign-in).
