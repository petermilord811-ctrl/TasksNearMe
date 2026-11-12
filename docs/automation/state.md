# Autopilot state

**Updated:** 2026-11-12 04:10 UTC (iteration 11, owner-directed)
**Autopilot:** stopped at the owner's request on 2026-11-11. The owner is directing the work; resume the `/loop` only when they ask.
**Phase:** 5–6 (repeat bookings, trust, support and staff tools). Wired end to end:
- the landing page (UI-036): the new brand, the motion system, the hero canvas, the map of open tasks with "Use my location";
- posting a task, offers, find work, and booking with payment (development stand-in);
- the booking page for both people: check-in, sheets, completion with evidence, approval, problem reports, disputes, change requests;
- direct invites (request a helper, accept, decline, counter, cancel; Book again; Invite helpers); availability posts;
- messages with masking, double-blind reviews, saved helpers, receipts and cards, earnings and payouts, rewards;
- the home dashboards; notifications (incl. change and invite events), the account page, real unread badges;
- support for members, reporting and blocking; staff queues, cases, money resolutions, the staff booking page, rewards review, users.

**Codex:** at its ChatGPT usage limit until 2026-11-17 12:32 (local). Buying credits is the owner's call. Tickets run with `node scripts/codex-run.mjs UI-xxx` (logs in `scratchpad/codex-UI-xxx.log`).
**Database:** Docker `tasksnearme-db` on 54329 (user `tnm`). If Docker Desktop is down, start it (AUTOPILOT). After pulling, run `npm run db:migrate && npm run db:seed` (migrations 0000–0021). `npm run e2e` reseeds the dev database itself; `npx playwright test --project=e2e-setup` alone tidies it (removes e2e-posted tasks) without running the suites.
**New dependencies (UI-036):** `motion`, `maplibre-gl`. Run `npm install` after pulling (never while a dev server runs in that checkout).

## Done in iteration 11
- **UI-036 (landing page v2)** built by Claude at the owner's choice (Codex at its limit), merged and wired; the handoff is `docs/ui/handoffs/UI-036.md`.
  - The new brand: ember, warm paper and iridescent light, light and dark with a switch; Bricolage Grotesque, Instrument Serif and DM Sans; the pin-and-check logo; the glass top bar.
  - `src/ui/motion` and the content-aware hero canvas.
  - MapLibre with OpenFreeMap tiles and a static fallback. Its worker is served by `/vendor/maplibre-gl-worker.mjs?v=<version>`.
  - `/` moved into the `(landing)` route group.
  - e2e `public-pages.spec` covers the landing page, nearest tasks with a category, and the waitlist outside Austin. `helpers-public` now starts at a category page.
- The light primary became `#C13F12` for contrast; page titles keep "TasksNearMe".
- The design system (§1–2.3) describes the new brand.

## Next steps
1. **Wire UI-032** (merged in e677ed5, not wired):
   - Routes: `/app/clients` (`getMyClientsPage`), `/app/bookings/[bookingId]/rebook` (`getProposeRebookPage`, `quoteRebookAction`, `proposeRebookAction`), and `/app/proposals/[proposalId]` (`getProposalPage` with the field cipher; accept, verify, decline and withdraw actions).
   - Flip `REBOOK_PAGES_READY`.
   - Seed a completed booking (for example Ana's kitchen with Sam) for the e2e: Sam proposes, Ana pays.
   - Codex's contract request: `actorName?: string` on `AttentionItem`.
2. **UI-021** (quality pass; ticket ready) when Codex is available again. After it, drop the stray $20 allowance from `movingBookingPosterConfirmed`.
3. **UI-033** (admin bookings list, task moderation, audit log): drafts are in `scratchpad/ui033/` (contract `admin-ops.ts`, fixtures, ticket). Still to build:
   - `tasks.hidden_*` columns and the hidden filter on public surfaces;
   - the moderation service, the bookings list and the audit queries;
   - routes `admin.bookings({ filter, q })` and `admin.audit(filters)`.
   `/admin/reports` can redirect to `routes.admin.cases({ queue: 'reports' })`.
4. **UI-034** later: payments, config, staff roles.
5. **Later:** staff TOTP, clock and time travel; a production map tile provider (OpenFreeMap has no SLA; `MAP_STYLE_URL` switches it).

## Open issues
- Each page ships the whole next-intl message catalog (about 76 KB plus the landing copy).
- UI-021 quality pass: the native file input in the posting wizard; the support photo field; the message log's sticky date chip can cover a photo card.
- The moving booking fixture shows a $20 allowance while its breakdown has none (UI-011 previews).
- The `screen-my-offers/with-invite` preview shows December invites next to November offers ("Expires 18 days ago").
- After an e2e run, the landing page's floating cards and map show e2e-posted tasks until the next e2e setup (development data only).
- Featured helpers show on the landing page only on wide screens (floating cards). A helper strip on phones is possible later.
- Checks are sensitive to machine load while Codex runs its own checks: rerun the failed specs alone before calling them real.
- Fix for Codex (in the UI-032 ticket): on `NotificationsScreen`, "All notifications marked as read." disappears when the list refreshes.
- Last full gate (UI-036 merge): `check` 1763, `test:db` 121, `e2e` 111 (37 skips by design; `sign-in.spec` help center flaked once on phones and passed on retry), `build` pass. UI-036's own `check:ui` passed (every preview at 360 and 1280, axe).
