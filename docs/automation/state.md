# Autopilot state

**Updated:** 2026-11-11 14:30 UTC (iteration 8)
**Phase:** 4–5 (bookings and money). Wired end to end:
- posting a task, offers, and booking with payment (development stand-in);
- the booking page for both people: check-in, sheets (cancel with refunds, running late, no-show, can't access, safety), completion with evidence, approval, problem reports;
- messages, receipts and cards, earnings and payouts.

**Codex:** UI-030 (phones: the tab bar covers the action bar) is running. UI-023 (home dashboards) is ready and goes next. The runner (`scripts/codex-run.mjs`, background) reports each hand-off; logs are in the scratchpad (`codex-UI-0xx.log`).
**Database:** Docker `tasksnearme-db` on 54329. After pulling, run `npm run db:migrate && npm run db:seed` (migrations 0000–0013). `npm run e2e` reseeds the dev database itself and clears cached public pages.

## Done in iteration 8
- **UI-013** merged and wired: `/complete`, `/problem`, `submit_completion` and `report_problem`. Contract request: `CompletionView.hoursCap`.
- **UI-014** merged and wired: `/app/messages`, threads from offers and bookings, masking until a booking is confirmed. Contract request: `lastMessage.kind` and `event`.
- **UI-012** merged and wired: the sheets on the booking page.
  - Backend: refunds, strikes, no-shows, can't access, safety (migration 0012).
  - **e2e found a phone bug** (the tab bar covers the action bar). It became UI-030.
- **UI-016** merged and wired: payments, receipts, earnings.
  - Backend: earnings ledger, payouts, refunds of unused hours and allowance, cards (migration 0013).
- The home backend (`getAppHome`) is built for UI-023.
- Flaky tests: Codex made the UI-013 focus tests deterministic. Unit timeouts were raised for checks running on a busy machine.

## Next steps
1. **When UI-030 hands off:** merge it, re-enable the fixme in `tests/e2e/booking-sheets.spec.ts` ("phones can reach the booking actions under More"), and run it on `app-mobile`. Then launch UI-023.
2. **When UI-023 hands off:** wire `/app` (replace the placeholder in `src/app/(app)/app/(main)/page.tsx`) with `getAppHome(db, viewer.user, now)`, plus e2e for both modes.
3. **Next tickets to prepare:**
   - UI-015: reviews, saved helpers, browse helpers, my clients, rebook.
   - UI-017: notifications, account settings, support cases, report and block.
   - UI-025: direct requests and invites.
   - UI-026: disputes.
   - UI-027: change requests.
   - UI-028: rewards.
   - Then admin (UI-018 to UI-020) and the quality pass (UI-021).
4. **Phase 1 leftovers:**
   - clock and time travel (needed for day-of e2e);
   - outbox dispatcher and jobs (expiry, reminders, auto-approval and payouts run lazily today);
   - staff TOTP.

## Open issues
- Each page ships the whole next-intl message catalog (about 76 KB).
- UI-021 quality pass: the native file input in the posting wizard; the offer-detail action bar overlaps content on phones (may be fixed by UI-030).
- `taskOwnerAction` builds the "post again" URL by hand; move it into `routes.app.newTask(query)`.
- The moving booking fixture shows a $20 allowance while its breakdown has none (UI-011 previews).
- e2e: the mobile sign-in tests in `auth.spec.ts` flaked once under load (passed on retry).
- Checks (iteration 8): `check` 1046, `test:db` 75, `e2e` 82 (+ 17 skips by design), `build` pass.
