# Autopilot state

**Updated:** 2026-11-11 18:30 UTC (iteration 9)
**Phase:** 5–6 (trust, support and staff tools). Wired end to end:
- posting a task, offers, find work, and booking with payment (development stand-in);
- the booking page for both people: check-in, sheets (cancel with refunds, running late, no-show, can't access, safety), completion with evidence, approval, problem reports;
- messages with masking, double-blind reviews, saved helpers, receipts and cards, earnings and payouts;
- the home dashboards; notifications, the account page, real unread badges.

**Codex:** UI-031 (support, report and block) is handed off and waits to be merged. UI-018 (staff queues and case work) is drafted in the scratchpad (contract, fixtures, ticket) and goes next.
**Database:** Docker `tasksnearme-db` on 54329 (user `tnm`). After pulling, run `npm run db:migrate && npm run db:seed` (migrations 0000–0015; the support migration 0016 comes with UI-031's wiring). `npm run e2e` reseeds the dev database itself and clears cached public pages.

## Done in iteration 9
- **UI-030** merged; the phone e2e under More is back on.
- **UI-023** and **UI-015** merged and wired: `/app` (both modes), reviews, saved helpers.
- **UI-017** merged and wired:
  - `/app/notifications`: a lazy dispatcher turns outbox events into notifications;
  - `/app/account`: profile, preferences (receipts locked on), export and deletion requests;
  - real unread badges in the shell.
- **UI-031** handed off. Its run was cut off by the session ending; `node scripts/codex-run.mjs UI-031 --finish` completed it.
- Tooling: the heavy-work lock (`scripts/gate.mjs`, the runner's check), the shared e2e sign-in, and seed resets that clear leftovers.

## Next steps
1. **Commit the UI-017 wiring** once the queued `check` + `e2e` gate is green (test:db and build already passed on this code).
2. **Merge UI-031**, then apply the scratchpad drafts:
   - `support/apply.py`: support schema with case events (visibility, party), migration 0016, `src/modules/support/{service,actions}.ts`, `src/modules/trust/blocks.ts`;
   - blocking enforced in offers, find work, the poster's offers and booking; `viewerRole` (Codex's contract request); seed support case for Maya; integration test.
   - `support/wire.py`: `/app/support`, `/app/support/[caseId]`, and the thread's Report and Block menu; e2e `support.spec.ts`.
   - Then the full gate and commit.
3. **Launch UI-018** (scratchpad `admin/`: `src/contracts/admin.ts`, `src/fixtures/admin.ts`, the ticket; add `request` to `CASE_TYPES`, `routes.admin.cases(filters)`). Build the staff case backend while Codex works: SLA targets, assignment, replies to each party, notes, status, resolution without money, the reason-gated conversation (audit log).
4. **Next tickets:** UI-025 (direct requests, availability, My clients: those nav links 404), UI-028 (rewards: 404), UI-026 (disputes), UI-027 (change requests), UI-019 and UI-020 (admin money, config), UI-021 (quality pass).
5. **Phase 1 leftovers:**
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
- Checks at the last green gate (eec3d83): `check` 1143, `test:db` 78, `e2e` 87 (+ 16 skips by design), `build` pass.
