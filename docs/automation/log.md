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

## 2026-11-11 — iteration 4 (tasks, posting, profiles)
- Codex:
  - UI-005 (19 min) and UI-006 (24 min) were handed off and merged.
  - UI-007 (16 min) failed its independent check only because of a flaky test of mine (encryption tamper test flipping a base64 padding bit). Fixed, then merged.
  - UI-024 launched.
- Wired:
  - the board, the public task page, and helper profiles (reviews and work samples);
  - recent tasks on public pages;
  - the posting wizard backend: uploads, files route, AI drafter, quote, post;
  - `/app/tasks/new`.
- Performance: Partial Prefetching moved to the `/app` and `/admin` segments; public pages render once (home 390 KB → 197 KB).
- Bugs found by e2e:
  - The details schema rejected unanswered optional fields (undefined, null, NaN). Fixed in the contract.
  - The wizard posts when "Next" is pressed on the budget step (Codex UI bug). Sent as UI-024; that e2e test is fixme until it lands.
- Contract requests accepted: a yard green-waste plan instead of haul-away (also noticed independently), `onResolvePhotos`, and a per-person draft key.
- Checks: `check` 457, `test:db` 23, `e2e` 50 (posting fixme), `build` pass.

## 2026-11-11 — iteration 5 (offers, helper onboarding)
- Codex:
  - UI-024 (11 min): the wizard posted on Next. Fixed, merged, and the posting e2e test re-enabled. Its independent check had failed only on a transient `ERR_NETWORK_CHANGED`, which the harness now ignores.
  - UI-008 (21 min) merged.
  - UI-009 launched.
- Wired UI-007:
  - offers module: schema, migration 0006, domain actions, masked message segments, owner projections with fee-engine breakdowns, decline, cancel with a reason, seen markers;
  - seeded offers;
  - three poster pages;
  - integration tests (6) and e2e poster flows.
- e2e infrastructure:
  - the `e2e-setup` project reseeds and removes posting leftovers;
  - one retry, after a dev-server manifest race returned a single 500;
  - a run that overlapped Codex's check on the same machine failed broadly; re-runs were clean.
- Prepared UI-008 and UI-009 contracts: onboarding (form schemas, provider statuses, handlers) and helper work (feed, blocked reasons, offer schema factory).
- Checks: `check` 540, `test:db` 29, `e2e` 60 (3 skips by design), `check:ui` pass.

## 2026-11-11 — iteration 6 (helper onboarding, find work, booking and paying)
- Codex:
  - UI-009 (26 min) merged: find work, the helper task view, the offer form, my offers.
  - UI-010 (24 min) merged: the confirmation page, payment picker, bank dialog, cancellation summary.
  - UI-011 launched: the bookings list and the booking page.
- Wired:
  - UI-008: verification module and migration 0007, development provider stand-ins, onboarding and editor routes.
  - UI-009: helper offers service (feed with distance bands, task view projection, send, revise, withdraw, re-confirm, limits, lazy expiry).
  - UI-010: bookings and payments (migration 0008), the development payment stand-in, the confirmation route, the booking redirect placeholder.
- e2e infrastructure: `POST /dev/cache` clears cached public pages after the reseed; the seed clears bookings on seeded tasks; reserved tasks for the offer and booking flows.
- A stale Turbopack module ("is not a function" for a new export) needed a dev server restart; stopping the shell doesn't end `next dev` on Windows (AUTOPILOT gotchas).

## 2026-11-11 — iteration 8 (completion, messaging, sheets, money)
- Codex:
  - UI-013 (23 min). The runner's check failed on an untouched test under load; merged.
  - UI-014 (42 min), merged.
  - UI-012 (24 min). The check failed on flaky UI-013 focus tests; merged, and the fix was requested.
  - UI-016 (28 min), merged; the focus tests are now deterministic.
  - UI-030 launched (a phone bug found by e2e).
- Backends:
  - completion and problem reports (migration 0010);
  - messaging (0011);
  - cancellations, refunds, strikes, no-shows, safety (0012);
  - earnings ledger and payouts (0013);
  - the home.
- Each ticket was wired with e2e: completion, messaging, booking sheets (desktop; phones wait for UI-030), and money.
- Tooling: unit tests got a 15 s timeout and testing-library waits 3 s, because checks share the machine.

## 2026-11-11 — iteration 9 (home, reviews, notifications, support)
- Codex:
  - UI-030 (phones: the tab bar covered the action bar), merged; the phone e2e is back on.
  - UI-023 (home dashboards, 29 min) and UI-015 (reviews and saved helpers, 25 min), merged and wired.
  - UI-017 (notifications and the account page, 33 min), merged and wired.
  - UI-031 (support, report and block). The session ended during the runner's independent check; `codex-run.mjs --finish` reran the check (pass) and committed Codex's work.
- Backends:
  - reviews (double-blind), saved helpers, the home;
  - notifications from the outbox (lazy dispatcher), preferences, privacy requests (migration 0015);
  - real unread badges in the signed-in shell.
- Tooling:
  - a machine-wide heavy-work lock shared by Claude's gate (`scripts/gate.mjs`) and the runner's independent check;
  - the shared e2e sign-in helper; the seed reset clears everything that points at seeded bookings.
- Flaky under load: a full gate run had 8 e2e failures while Codex ran its own checks. The failed specs passed when rerun alone. A helper form focus test also failed once; its fix goes to Codex with UI-018.

## 2026-11-11 — iteration 10 (disputes, invites, staff people, availability)
- Codex runs:
  - UI-025 (direct invites, 50 min), merged and wired: the request page, invites on My offers and on the task page, Book again, Invite helpers. Two contract requests declined (see decisions).
  - UI-020 (reward reviews and people, 42 min), merged and wired: `/admin/rewards`, `/admin/users`, `/admin/users/[userId]`. No contract requests; Codex replaced the notification placeholders.
  - UI-029 (availability posts) launched right after the UI-020 merge.
- Backends:
  - notifications for change requests and invites;
  - availability posts (migration 0020): slot holds through invites, the expiry job, open slots on the public profile;
  - invites waiting for a first authorization expire after 30 minutes; only live helper profiles can be requested.
- Seeds: the disputed dresser (support settles it in e2e), `tsk_nightstands` for the invite e2e, a welcome reward in review for Sam.
- Real failures the gate caught after UI-025: tests still expected the old profile link text and only `cancel_task` on open tasks; on phones, Cancel task moved under More.

## 2026-11-13 — landing seventh pass, installable app, one-tap offer (Claude, owner requests)
- Landing (UI-053): the skeleton town that grows into the 3D one; the 2D map's setup restyled before MapLibre and started after the build-up; the page's floating scrollbar (no white strip). Built with two helper agents.
- Plan 3.6: the web app manifest and icons; Chrome reports no installability errors.
- Plan 4.3 (UI-054): the one-tap offer on find work, with Undo; integration `quick-offer`, e2e `find-work`.
- The peer session finished its plan items (3.3, 3.4, 3.5, 4.4); one gate covered both (`scripts/gate.mjs`).
- Environment: the dev server grew to 31.8 GB over hours of tests (navigations timed out) and later served a stale SSR graph for edited client components (hydration failures); both fixed by a clean restart.

## 2026-11-13 — Post again (plan 4.2)
- A finished task opens the wizard on its review step with everything from last time (UI-055); the saved address is read again on "Post", and a deleted one (retention) is searched again. Integration `post-again`, e2e `post-again`.
- The completion plan is done (every item ☑). Next: the refinement pass across the screens, split with the other session.

## 2026-11-13 — Phase 2: regular visits, scheduled payments, the recurring-month reward
- Split of the remaining phase 2 items with the other session: regular visits (and the recurring-month reward), scheduled funding for far-ahead bookings, replacement matching, ranking by reliability and AI category suggestions here; passkeys, instant payouts, poster credits and Spanish UI there. Errands wait for counsel (F17, blocked.md).
- Gate at 99b76aa: check 2,363, test:db 301, build green; e2e 157 passed with one failure and one flake, both in find work: Undo was ignored while a hide was on its way (fixed: each task's latest choice is queued), and the one-tap offer test wasn't retry-safe (c1aeccd).
- Regular visits (migration 0040, e7650ea, ed37c2a): the series, `scheduled` bookings, the 48 h off-session charges with retries and the 12 h skip, skips, pauses, stops and ends, one conversation per series, six notifications, the jobs. Unit tests for the calendar (DST, monthly by weekday, the 5th weekday), integration `series` (the whole life of a weekly series).
- The recurring-month reward (94ca9ef), integration `recurring-reward`.
- Bookings more than 14 days ahead are booked now and charged 72 h before (87b4303), integration `scheduled-booking`.
- Next: the UI for all of it (once the other session's format codemod lands): Repeat on the proposal form, the schedule on the proposal page, the series page, the booking page's "Pay now" card and series link, the regular visits on the bookings page, the confirmation page's "charged later"; then e2e.

## 2026-11-13 — Phase 2, the rest: UI for regular visits, replacement matching, reliability, a suggested category
- UI (UI-059, UI-060; built by Claude with two helper agents): Repeat on proposals, `/app/series/[seriesId]`, the booking page's paid-later card and series link, regular visits on the bookings list, checkout for far-ahead bookings, "Reliable" on helper cards and offers, the recurring-month reward on the rewards page, "Describe what you need" on posting. 35 new or changed previews clean at 360 and 1280 (no runtime errors, no serious axe issues); e2e `series.spec`.
- Automated replacement matching (e05ec82), ranking by reliability (ab63b0c).
- From the other session: the Spanish UI (pages under `src/app/[locale]`, every namespace translated, emails and texts in the recipient's language, a catalog check), the account language, passkeys.
- Gate at dd7fa73: check and build green; test:db and e2e red from shared test data. A webhook test left outbox events for a deleted user, and the dispatcher threw on them (it now skips a gone recipient). My new tests reopened tasks into other tests' feeds and boards, and "Post again" e2e left open tasks behind. Fixed in 0744c19 (test:db 74/334, check 2,558, the affected e2e green). Before the move, a stale public task page after a decline ("3 offers"); it didn't reproduce on a fresh server, and the other session is checking.

## 2026-11-13 — Final gate before the move to a VPS
- The owner asked to finish before moving the project. A temporary dev server ran for one last full gate at 99b57a2: test:db 74 files / 334 tests and the build green; e2e 164 passed, 2 flaky, 1 failed. The check had one failure, `helper-forms` focus under load, which passes alone 9/9; the check rerun is green, 2,558.
- The e2e failure: admin-ops's hide-and-restore test lost a navigation (net::ERR_ABORTED) right after the public page's reload loop, and its retry found the task still hidden by the first try. The test now restores the patio task and clears the page cache at the start, and it opens staff pages again if a navigation is cut short. The spec passes on both projects.
- The dev server was stopped again afterwards, as the move needs.
