# Autopilot state

**Updated:** 2026-11-11 11:15 UTC (iteration 6)
**Phase:** 3–4 (offers and bookings). Wired end to end: post a task, find work and send offers (helpers), review and book an offer with payment (development stand-in), helper onboarding.
**Codex:** UI-011 (bookings list and the booking page) running since 10:46 UTC. The watcher is the runner itself (`scripts/codex-run.mjs`, background); its log is in the scratchpad (`codex-UI-011.log`).
**Database:** Docker `tasksnearme-db` on 54329. After pulling: `npm run db:migrate && npm run db:seed` (migrations 0000–0008). `npm run e2e` reseeds the dev database itself (e2e-setup project) and clears cached public pages (`POST /dev/cache`).

## Done in iteration 6
- UI-008 wired (helper onboarding, profile editor, development verification stand-ins, migration 0007).
- UI-009 merged and wired: helper offers service, `/app/find-work`, `/app/find-work/[taskId]`, `/app/offers`.
- UI-010 prepared, built by Codex (24 min), merged and wired: bookings and payments (migration 0008), the development payment stand-in, the confirmation page with the 30-minute hold and the bank step.
- UI-011 prepared and launched (booking page and list contracts and fixtures for every state and role).
- e2e: `POST /dev/cache` after reseeding; reserved seed tasks for the helper offer flow (`tsk_shelves`) and the booking flow (`tsk_moving`).

## Next steps
1. **When UI-011 hands off:** review, merge, wire:
   - `getBookingView` projected per role: address rules from ui-contract §5 (the helper sees it while confirmed through disputed and until 48 h after completion), payments for the client only, a timeline built from task, offer, booking and payment rows;
   - booking actions as pure domain rules: `pay`, `on_my_way` (from start − 2 h), `arrived` (from start − 30 min; → `in_progress`), `approve` (→ `completed`), `add_to_calendar` (an ICS route). Leave `message` out until messaging exists. Check-in columns need migration 0009;
   - `/app/bookings` and the real `/app/bookings/[bookingId]` (replace the redirect placeholder); e2e for both roles.
2. **Prepare UI-013** (completion form and the client's review of it; report a problem) so the core loop closes: post → offer → book → check in → complete → approve. Add `completion?` to `BookingView` (optional, so UI-011 still compiles). Disputes and settlements can move to a later ticket.
3. Then UI-014 (messaging), UI-012 (action sheets: cancel with policy preview, change requests, no-show, can't access, safety), UI-016 (receipts, earnings, payouts), UI-015 (reviews).
4. **Phase 1 leftovers:** clock and time travel (needed for day-of e2e), outbox dispatcher and jobs (offer and hold expiry, reminders), staff TOTP.

## Open issues
- Each page ships the whole next-intl message catalog (about 76 KB).
- UI-021 quality pass: the native file input in the posting wizard; the offer-detail action bar overlaps content on phones.
- `taskOwnerAction` builds the "post again" URL by hand (`?category=`); move it into `routes.app.newTask(query)`.
- Flaky once: "a featured helper opens to a full profile" (passed on retry).
- Checks (iteration 6): `check` 690, `test:db` 46, `e2e` 66 (+ skips by design), `build` pass.
