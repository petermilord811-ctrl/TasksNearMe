# Autopilot state

**Updated:** 2026-11-11 12:20 UTC (iteration 7)
**Phase:** 4 (bookings). Wired end to end: post a task → offers → book and pay (development stand-in) → the booking page for both people (check-in, approve). Completion, problem reports and messaging have their backends built; their screens are with Codex or queued.
**Codex:** UI-013 (mark the work complete, report a problem) running since about 11:50 UTC. UI-014 (messaging) is ready and goes next. The runner (`scripts/codex-run.mjs`, background) reports when Codex hands off; its log is in the scratchpad (`codex-UI-013.log`).
**Database:** Docker `tasksnearme-db` on 54329. After pulling: `npm run db:migrate && npm run db:seed` (migrations 0000–0011). `npm run e2e` reseeds the dev database itself and clears cached public pages.

## Done in iteration 7
- UI-011 merged and wired: `/app/bookings`, `/app/bookings/[bookingId]`, `calendar.ics`; booking rules (actions per role and state, address visibility, deadlines) as pure functions.
- UI-013 backend: completion rules from the category and terms, submission, final quote, automatic approval, problem reports into `disputed` with a support case (migration 0010).
- Messaging backend: threads, participants, messages, blocks (migration 0011); masking for the other person until a booking is confirmed; booking updates posted as status lines; message photos visible to the thread only.
- File access: task photos for bookable helpers and the booked helper; evidence, receipts and message photos for the people involved.
- UI-013 and UI-014 prepared (contracts, fixtures, tickets).

## Next steps
1. **When UI-013 hands off:** review, merge, then launch UI-014 at once. Wire UI-013:
   - routes `/app/bookings/[bookingId]/complete` and `/problem` (flow layout) with `getCompletionPage`, `getReportProblemPage` and the Server Actions in `completion-actions.ts`;
   - add `submit_completion` (helper: `in_progress`, or `confirmed` for remote work) and `report_problem` (client: `completion_submitted` before the deadline) to `bookingActions`, both answering with `redirectTo`;
   - e2e: Jordan completes on a booked task (set `in_progress` through check-in with an injected time, or seed an `in_progress` booking); Ben approves or reports.
2. **When UI-014 hands off:** pages `/app/messages` and `/app/messages/[threadId]` on `getInbox`, `getThreadPage`, `sendMessage`. Add the `message` booking action (both, except `pending_funding`), `message_helper` (client) and `message_poster` (helper) on offers: `offerThreadId` and `ensureThread` give the `redirectTo`.
3. Then UI-012 (action sheets: cancel with the policy preview, change requests, no-show, can't access, safety), UI-016 (receipts, earnings, payouts), UI-015 (reviews), UI-026 (disputes), UI-025 (direct requests).
4. **Phase 1 leftovers:** clock and time travel (needed for day-of e2e), outbox dispatcher and jobs (expiry, reminders, auto-approval), staff TOTP.

## Open issues
- Each page ships the whole next-intl message catalog (about 76 KB).
- UI-021 quality pass: the native file input in the posting wizard; the offer-detail action bar overlaps content on phones.
- `taskOwnerAction` builds the "post again" URL by hand; move it into `routes.app.newTask(query)`.
- The moving booking fixture shows a $20 allowance while its breakdown has none (UI-011 previews); fix with UI-021.
- Checks (iteration 7): `check` 803, `test:db` 62, `e2e` 72 (+ 9 skips by design), `build` pass.
