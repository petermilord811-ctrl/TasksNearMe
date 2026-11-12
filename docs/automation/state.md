# Autopilot state

**Updated:** 2026-11-11 23:50 UTC (iteration 10)
**Phase:** 5–6 (repeat bookings, trust, support and staff tools). Wired end to end:
- posting a task, offers, find work, and booking with payment (development stand-in);
- the booking page for both people: check-in, sheets, completion with evidence, approval, problem reports, disputes, change requests;
- direct invites (request a helper, accept, decline, counter, cancel; Book again; Invite helpers);
- messages with masking, double-blind reviews, saved helpers, receipts and cards, earnings and payouts, rewards;
- the home dashboards; notifications (incl. change and invite events), the account page, real unread badges;
- support for members, reporting and blocking; staff queues, cases, money resolutions, the staff booking page.

**Codex:** see "Next steps" for the ticket in flight (`node scripts/codex-run.mjs UI-xxx`; logs in `scratchpad/codex-UI-xxx.log`).
**Database:** Docker `tasksnearme-db` on 54329 (user `tnm`). If Docker Desktop is down, start it (AUTOPILOT). After pulling, run `npm run db:migrate && npm run db:seed` (migrations 0000–0020). `npm run e2e` reseeds the dev database itself.

## Done in iteration 10
- **Seeded dispute** (Ana's dresser with Jordan) and `disputes.spec` (support settles at $45; Ana sees the $16.50 refund).
- **UI-025** merged and wired: `/app/helpers/[handle]/request` (flow layout), invites on `/app/offers` (`?invite=`) and the task page, Book again, Invite helpers (→ saved helpers). Only live helper profiles can be requested. e2e `invites.spec` on the seeded `tsk_nightstands`.
- **Notifications** for `change.*` and `invite.*` events (placeholders reviewed by Codex in UI-020).
- **UI-029 ready** (availability posts): contracts, fixtures, ticket, and the backend (migration 0020, slot holds through invites, expiry job). Invites waiting for a first authorization now expire after 30 min.

## Next steps
1. **UI-020** (reward reviews, people): handed off; merge, then `scratchpad/ui020/wire.py`, e2e, gate, commit.
2. **Launch UI-029** right after the UI-020 merge. When it hands off: wire `/app/availability` (`getMyAvailabilityPage`, `createAvailabilityPostAction`, `cancelAvailabilityPostAction`), seed an open slot for Jordan and an overlapping yard task for Ben, e2e (post and cancel a slot; Ben requests the seeded slot from the profile).
3. **UI-032** (My clients and rebooking proposals): drafts in `scratchpad/ui032/` (contract `rebook.ts`, fixtures, ticket, schema, service, actions, integration test). Apply after UI-029 launches: contract edits + UI placeholders (actions, notification types, attention kinds, the `proposal` target), migration 0021, home attention items (`answer_invite`, `answer_counter`, `answer_proposal`), the `offer_rebook` booking action behind `REBOOK_PAGES_READY`.
4. **Later:**
   - admin pages the nav already links to: reports, bookings search, payments, config, audit, staff roles;
   - content moderation (hide tasks, photos, reviews);
   - UI-021 quality pass;
   - staff TOTP, clock and time travel.

## Open issues
- Each page ships the whole next-intl message catalog (about 76 KB).
- UI-021 quality pass: the native file input in the posting wizard; the support photo field; the message log's sticky date chip can cover a photo card.
- `taskOwnerAction` builds the "post again" URL by hand; move it into `routes.app.newTask(query)`.
- The moving booking fixture shows a $20 allowance while its breakdown has none (UI-011 previews).
- The `screen-my-offers/with-invite` preview shows December invites next to November offers ("Expires 18 days ago").
- Checks are sensitive to machine load while Codex runs its own checks: rerun the failed specs alone before calling them real.
- Fix for Codex (in the UI-032 ticket): on `NotificationsScreen`, "All notifications marked as read." disappears when the list refreshes.
- Last full gate (UI-020 wiring): `check` 1631, `test:db` 117, `e2e` 102 (+4 flaky on retry under load, 35 skips by design), `build` pass.
