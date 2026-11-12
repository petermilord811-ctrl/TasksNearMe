# Autopilot state

**Updated:** 2026-11-12 08:40 UTC (iteration 13, owner said "build all")
**Autopilot:** the owner said "go ahead, build all" (2026-11-12): build everything left, Claude doing the UI too while Codex is at its limit (decisions.md).
**Phase:** 5–6 (repeat bookings, trust, support and staff tools). Wired end to end:
- the landing page (UI-036): the new brand, the motion system, the hero canvas, the map of open tasks with "Use my location";
- posting a task, offers, find work, and booking with payment (development stand-in);
- the booking page for both people: check-in, sheets, completion with evidence, approval, problem reports, disputes, change requests;
- direct invites (request a helper, accept, decline, counter, cancel; Book again; Invite helpers); availability posts;
- messages with masking, double-blind reviews, saved helpers, receipts and cards, earnings and payouts, rewards;
- the home dashboards; notifications (incl. change and invite events), the account page, real unread badges;
- support for members, reporting and blocking; staff queues, cases, money resolutions, the staff booking page, rewards review, users.

**Codex:** at its ChatGPT usage limit until 2026-11-17 12:32 (local). Buying credits is the owner's call. Tickets run with `node scripts/codex-run.mjs UI-xxx` (logs in `scratchpad/codex-UI-xxx.log`).
**Database:** Docker `tasksnearme-db` on 54329 (user `tnm`). If Docker Desktop is down, start it (AUTOPILOT). After pulling, run `npm run db:migrate && npm run db:seed` (migrations 0000–0023). `npm run e2e` reseeds the dev database itself; `npx playwright test --project=e2e-setup` alone tidies it (removes e2e-posted tasks) without running the suites.
**New dependencies (UI-036):** `motion`, `maplibre-gl`. Run `npm install` after pulling (never while a dev server runs in that checkout).

## Done in iteration 13
- **`/app/helpers`** (UI-039, Find helpers): browse and search the market's helpers (cc6b314).
- **After a cancellation (T-10–T-12):** Find a replacement reopens the task (`tasks.reopened_at`, migration 0023; earlier offers stay with the canceled booking; earlier offerers get `task_reopened`); Contest no-show report opens a `no_show` case (24 h, once); Book again after a helper cancellation.
- **Approval reminders (T-02):** 24 h and 4 h before auto-approval (`approval_reminder`), from the job runner and for the viewer.
- **Test clock (blueprint 10 §3.1):** `requestNow()` in pages, route handlers and Server Actions; `/dev/clock` (signed, per browser); e2e `time-travel.spec` runs T-02. E2e scenario rows (`tests/e2e/support/scenarios.ts`, `tsk_e2e_*`) are removed by the next seed.
- Gate (a3cbb92): `check` 1803, `test:db` 153, `e2e` 124 (50 skips by design; 1 flaky: the phone map's waitlist), `build` pass.

## Done in iteration 12
- **UI-032 wired** (`/app/clients`, rebook and proposal pages; `AttentionItem.actorName`); seed `bkg_wardrobe` (Maya's wardrobe with Sam, completed); e2e `rebook.spec`.
- **Server rules fixed:** no-show after the late minutes; can't access only 20 minutes after arriving.
- **Admin pages, built by Claude:** UI-033 (bookings list, task moderation with migration 0022 hidden tasks, audit log, `/admin/reports` redirect), UI-034 (payments and reconciliation), UI-037 (staff roles), UI-038 (config: policy versions, flags). Integration `staff-ops`, `staff-payments`, `staff-roles`, `admin-config`; e2e `admin-ops.spec`.
- Theme script through `next/script` `beforeInteractive`.
- Launch-scenario coverage was mapped (T-01–T-30): 3 full, 21 partial, 3 none, 3 need a real provider; the gaps are in "Next steps".

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
1. **T-29 notifications by channel:** email and SMS per preferences with quiet hours for texts that can wait, through the dev outbox (`notification_deliveries`, a delivery job, retries visible to support). Push needs a service worker and keys: decide.
2. **Launch-scenario tests:** double submit (T-05), hourly cap and expenses to the cent (T-16, T-17), the welcome reward lifecycle (T-22), the second helper never sees the address (T-20), DST timers (T-30).
3. **UI-021** quality pass (Claude builds it while Codex is out), then drop the stray $20 allowance from `movingBookingPosterConfirmed`.
4. **Docs and close:** `README.md` and `docs/integration-points.md` (swapping fakes for real providers), the full `test:ui`, `docs/automation/final-report.md`.

## Open issues
- Each page ships the whole next-intl message catalog (about 76 KB plus the landing copy).
- UI-021 quality pass: the native file input in the posting wizard; the support photo field; the message log's sticky date chip can cover a photo card.
- The moving booking fixture shows a $20 allowance while its breakdown has none (UI-011 previews).
- The `screen-my-offers/with-invite` preview shows December invites next to November offers ("Expires 18 days ago").
- After an e2e run, the landing page's floating cards and map show e2e-posted tasks until the next e2e setup (development data only).
- Featured helpers show on the landing page only on wide screens (floating cards). A helper strip on phones is possible later.
- Checks are sensitive to machine load while Codex runs its own checks: rerun the failed specs alone before calling them real.
- Fix for Codex (in the UI-032 ticket): on `NotificationsScreen`, "All notifications marked as read." disappears when the list refreshes.
- Last full gate (admin pages): `check` 1784, `test:db` 142, `e2e` 119 (44 skips by design), `build` pass. New previews were swept with axe at 360 and 1280; the full `test:ui` runs again before the final report.
- No "Report this task" for members yet: task reports come from conversation reports only.
