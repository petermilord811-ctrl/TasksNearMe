# Autopilot state

**Updated:** 2026-11-11 22:00 UTC (iteration 9)
**Phase:** 5–6 (trust, support and staff tools). Wired end to end:
- posting a task, offers, find work, and booking with payment (development stand-in);
- the booking page for both people: check-in, sheets, completion with evidence, approval, problem reports;
- messages with masking, double-blind reviews, saved helpers, receipts and cards, earnings and payouts;
- the home dashboards; notifications, the account page, real unread badges;
- support for members (cases, requests, replies), reporting and blocking from a conversation.

**Codex:** UI-026 (disputes on the booking page, support notifications) is running (`node scripts/codex-run.mjs UI-026`, background; log `scratchpad/codex-UI-026.log`). Its backend comes with the wiring: `BookingView.dispute` in the booking hub, and `support.replied` / `support.resolved` outbox events that the dispatcher turns into notifications.
**Database:** Docker `tasksnearme-db` on 54329 (user `tnm`). If Docker Desktop is down, start it (AUTOPILOT). After pulling, run `npm run db:migrate && npm run db:seed` (migrations 0000–0016). `npm run e2e` reseeds the dev database itself.

## Done in iteration 9
- **UI-030** merged; the phone e2e under More is back on.
- **UI-023** and **UI-015** merged and wired: `/app` (both modes), reviews, saved helpers.
- **UI-017** merged and wired:
  - `/app/notifications`: a lazy dispatcher turns outbox events into notifications;
  - `/app/account`: profile, preferences (receipts locked on), export and deletion requests;
  - real unread badges in the shell.
- **UI-031** merged and wired: `/app/support`, `/app/support/[caseId]`, Report and Block in conversations. Blocking is enforced in messages, offers, find work and booking. Migration 0016.
  - The run was cut off by the session ending; `node scripts/codex-run.mjs UI-031 --finish` completed it.
- **UI-018** merged and wired: `/admin`, `/admin/cases`, `/admin/cases/[caseId]` (staff backend: queues, response targets, assignment, private replies, notes, resolutions, the reason-gated conversation, audit).
- **UI-028** merged and wired: `/app/rewards` (rewards backend: welcome and repeat grants from booking facts, hold, review, redeem to a development gift card).
- **Job runner** (`src/instrumentation.ts`): expiries, auto-approval, review publishing and notifications every minute.
- **UI-019** merged and wired: money resolutions (release, settle, refund in full, goodwill) and `/admin/bookings/[bookingId]` with refunds and the address and conversation behind a logged reason.
- **UI-026** prepared and launched (placeholders for the new notification codes are listed in its ticket).
- Tooling: the heavy-work lock (`scripts/gate.mjs`, the runner's check), the shared e2e sign-in, and seed resets that clear leftovers.

## Next steps
1. **When UI-026 hands off:** review, merge, then wire:
   - `getBookingView` gains `dispute` (the case on the booking, role-projected money: the client's dispute refunds, the helper's earnings; `canOpenCase` from the support visibility rule);
   - staff replies and resolutions write `support.replied` / `support.resolved` outbox events; `dispatchNotifications` maps them to `support_replied` / `case_resolved` with the `support_case` target;
   - e2e: Maya's disputed booking card (needs a seeded disputed booking, or reuse the staff-money flow).
2. **Prepare the next Codex ticket while UI-026 runs:** UI-025 direct invites (from a helper profile, saved helpers and Book again; accept, decline, counter). Decide how a new task is described (reuse the posting wizard with an `invite` handle, or a short inline form). Or UI-027 change requests.
3. **Later:** UI-020 (reward reviews, users and moderation, config), UI-021 (quality pass), My clients and availability posts, staff TOTP, clock and time travel.

## Open issues
- Each page ships the whole next-intl message catalog (about 76 KB).
- UI-021 quality pass: the native file input in the posting wizard.
- `taskOwnerAction` builds the "post again" URL by hand; move it into `routes.app.newTask(query)`.
- The moving booking fixture shows a $20 allowance while its breakdown has none (UI-011 previews).
- Checks are sensitive to machine load while Codex runs its own checks: rerun the failed specs alone before calling them real.
- `src/ui/screens/helper/helper-forms.test.tsx` checks focus synchronously (failed once under load); the fix is in the UI-018 ticket.
- Checks at the last green gate (UI-028 wiring): `check` 1372, `test:db` 96, `e2e` 99 (+ skips by design), `build` pass.
- UI-021 notes: the support photo field is a native file input too; the message log's sticky date chip can cover a photo card.
- Fix for Codex (next ticket): on `NotificationsScreen`, "All notifications marked as read." disappears when the list refreshes, because `MarkAllRead` (which holds the feedback) only renders while `unreadCount > 0`. Keep the feedback visible after the refresh.
