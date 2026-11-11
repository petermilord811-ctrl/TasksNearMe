# Autopilot state

**Updated:** 2026-11-11 20:30 UTC (iteration 9)
**Phase:** 5–6 (trust, support and staff tools). Wired end to end:
- posting a task, offers, find work, and booking with payment (development stand-in);
- the booking page for both people: check-in, sheets, completion with evidence, approval, problem reports;
- messages with masking, double-blind reviews, saved helpers, receipts and cards, earnings and payouts;
- the home dashboards; notifications, the account page, real unread badges;
- support for members (cases, requests, replies), reporting and blocking from a conversation.

**Codex:** UI-018 (staff queues and case work) is running (`node scripts/codex-run.mjs UI-018`, background; log `scratchpad/codex-UI-018.log`). Its backend is committed (`src/modules/support/staff.ts`); the page wiring and e2e are drafted in the scratchpad (`admin/wire.py`, `admin/admin.spec.ts`).
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
- **UI-018** prepared and launched; its staff backend is built and tested.
- Tooling: the heavy-work lock (`scripts/gate.mjs`, the runner's check), the shared e2e sign-in, and seed resets that clear leftovers.

## Next steps
1. **When UI-018 hands off:** review, merge, run `admin/wire.py` (scratchpad) for `/admin`, `/admin/cases`, `/admin/cases/[caseId]`, then fix the labels in `admin/admin.spec.ts` against Codex's copy and add it as `tests/e2e/admin.spec.ts`. Full gate, commit.
2. **Prepare the next Codex ticket while UI-018 runs:**
   - UI-025, split: direct requests to a specific helper (from their profile; accept, decline, counter) and the helper's My clients (rebook). These nav links 404 today. Availability posts come later.
   - UI-028 rewards (a 404 nav link).
3. **Later tickets:** UI-026 (disputes on the booking page), UI-027 (change requests), UI-019 and UI-020 (admin money, users and moderation, config), UI-021 (quality pass).
4. **Phase 1 leftovers:**
   - clock and time travel;
   - a job runner to replace the lazy jobs (offer and hold expiry, auto-approval, review publishing, payouts, the notification dispatcher);
   - staff TOTP.

## Open issues
- Each page ships the whole next-intl message catalog (about 76 KB).
- UI-021 quality pass: the native file input in the posting wizard.
- `taskOwnerAction` builds the "post again" URL by hand; move it into `routes.app.newTask(query)`.
- The moving booking fixture shows a $20 allowance while its breakdown has none (UI-011 previews).
- Checks are sensitive to machine load while Codex runs its own checks: rerun the failed specs alone before calling them real.
- `src/ui/screens/helper/helper-forms.test.tsx` checks focus synchronously (failed once under load); the fix is in the UI-018 ticket.
- Checks at the last green gate (a2e1840): `check` 1263, `test:db` 85, `e2e` 94 (+ 23 skips by design), `build` pass. Since then (2dae692): `check` 1271, `test:db` 91.
- UI-021 notes: the support photo field is a native file input too; the message log's sticky date chip can cover a photo card.
