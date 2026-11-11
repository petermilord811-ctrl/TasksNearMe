# Autopilot state

**Updated:** 2026-11-11 22:00 UTC (iteration 9)
**Phase:** 5–6 (trust, support and staff tools). Wired end to end:
- posting a task, offers, find work, and booking with payment (development stand-in);
- the booking page for both people: check-in, sheets, completion with evidence, approval, problem reports;
- messages with masking, double-blind reviews, saved helpers, receipts and cards, earnings and payouts;
- the home dashboards; notifications, the account page, real unread badges;
- support for members (cases, requests, replies), reporting and blocking from a conversation.

**Codex:** UI-019 (money resolutions and the staff booking page) is running (`node scripts/codex-run.mjs UI-019`, background; log `scratchpad/codex-UI-019.log`). The resolution preview is built; resolving with money, the refund tool and the booking page query come with its wiring.
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
- **UI-019** prepared (contract, fixtures, ticket, the resolution preview) and launched.
- Tooling: the heavy-work lock (`scripts/gate.mjs`, the runner's check), the shared e2e sign-in, and seed resets that clear leftovers.

## Next steps
1. **When UI-019 hands off:** review, merge, then build and wire:
   - `resolveCase` with money (release in full → completion money; settle → partial refund and earnings on the new price; refund in full → refund and cancel; goodwill → platform-funded refund), within `refundLimitOf`; let `caseResolutions` offer them for cases about a paid booking;
   - `/admin/bookings/[bookingId]` (`getAdminBooking`), the staff refund tool, and the address and conversation behind a reason (audit log).
   - e2e: settle the seeded dispute from the case page; refund from the booking page.
2. **Prepare the next Codex ticket while UI-019 runs:** UI-025 direct invites (from a helper profile, saved helpers and Book again; accept, decline, counter), probably reusing the posting wizard for new tasks. Or UI-026 (disputes on the booking page for both people), UI-027 (change requests).
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
