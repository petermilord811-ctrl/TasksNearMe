# Autopilot state

**Updated:** 2026-11-12 01:10 UTC (iteration 10)
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
- **UI-029** merged and wired: `/app/availability`, open times on the profile, slot requests (migration 0020; slot holds through invites; the expiry job). Invites waiting for a first authorization expire after 30 min.
- **UI-020** merged and wired: `/admin/rewards`, `/admin/users`, `/admin/users/[userId]`.
- **UI-032 ready** and launched: contracts, fixtures, ticket, the backend (migration 0021: proposals, accepting by paying, home attention for invites, counters and proposals).

## Next steps
1. **UI-032** (My clients and rebooking proposals) is with Codex (`scratchpad/codex-UI-032.log`). When it hands off: review, merge, wire `/app/clients` (`getMyClientsPage`), `/app/bookings/[bookingId]/rebook` (`getProposeRebookPage`, `quoteRebookAction`, `proposeRebookAction`), `/app/proposals/[proposalId]` (`getProposalPage` with the field cipher; accept, verify, decline, withdraw actions); flip `REBOOK_PAGES_READY`; seed a completed booking (e.g. Ana's kitchen with Sam) for the e2e: Sam proposes, Ana pays.
2. **Then launch UI-021** (quality pass; ticket ready, no contract changes). After it: drop the stray $20 allowance from `movingBookingPosterConfirmed` (UI-021 moves the test off it).
3. **UI-033** (admin bookings list, task moderation, audit log): drafts in `scratchpad/ui033/` (contract `admin-ops.ts`, fixtures, ticket). Still to build: `tasks.hidden_*` columns and the hidden filter on public surfaces, the moderation service, the bookings list and audit queries, routes `admin.bookings({ filter, q })` / `admin.audit(filters)`. `/admin/reports` can redirect to `routes.admin.cases({ queue: 'reports' })`.
4. **UI-034** later: payments, config, staff roles.
5. **Later:** staff TOTP, clock and time travel.

## Open issues
- Each page ships the whole next-intl message catalog (about 76 KB).
- UI-021 quality pass: the native file input in the posting wizard; the support photo field; the message log's sticky date chip can cover a photo card.
- `taskOwnerAction` builds the "post again" URL by hand; move it into `routes.app.newTask(query)`.
- The moving booking fixture shows a $20 allowance while its breakdown has none (UI-011 previews).
- The `screen-my-offers/with-invite` preview shows December invites next to November offers ("Expires 18 days ago").
- Checks are sensitive to machine load while Codex runs its own checks: rerun the failed specs alone before calling them real.
- Fix for Codex (in the UI-032 ticket): on `NotificationsScreen`, "All notifications marked as read." disappears when the list refreshes.
- Last full gate (UI-029 wiring): `check` 1665, `test:db` 121, `e2e` 108 (37 skips by design), `build` pass.
