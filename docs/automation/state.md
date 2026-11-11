# Autopilot state

**Updated:** 2026-11-11 09:35 UTC (iteration 4)
**Phase:** 2 (tasks). Public site, sign-in, posting wizard backend, and helper profiles are wired.
**Codex:** UI-024 (fix: the wizard posts on "Next") is running. UI-007 is merged and needs wiring. UI-008 isn't prepared yet.
**Database:** Docker `tasksnearme-db` on 54329. After pulling: `npm run db:migrate && npm run db:seed`.

## Done since iteration 3
- UI-004 wired (sign-in, waitlist, help, legal). UI-005 wired (board, public task, helper profile, `PublicShell` viewer promise).
- Per-segment Partial Prefetching: home page 390 KB → 197 KB; real 404s.
- Tasks module:
  - schema, posting service (encrypted address, prohibited phrases, new-account limit), public projections and queries;
  - seeded open tasks.
- Reviews and work-samples tables; profiles show real reviews.
- Uploads (re-encoded WebP, no metadata), `/api/files/[id]`, rule-based AI drafter, wizard actions.
- `/app/tasks/new` wired.
- App routes split into `(main)` and `(flow)` groups.
- UI-006 and UI-007 merged.

## Next steps
1. **When UI-024 hands off:** merge it, re-enable the posting e2e (`tests/e2e/posting.spec.ts`, currently `test.fixme`), and run it on both projects.
2. **Prepare UI-008** (helper onboarding steps and profile editor) to keep Codex busy:
   - contracts: verification and onboarding steps, profile editor forms, service editor, work-sample upload;
   - fixtures and a ticket.
3. **Offers module** (wires UI-007):
   - schema and migration (`offers`, offer revisions, offer views);
   - domain actions (`getOfferActions`, `getTaskOwnerActions`) and owner projections (masked messages, poster breakdowns);
   - cancel task with a reason (outbox and audit), seeded offers on the desk;
   - pages: `/app/tasks`, `/app/tasks/[taskId]` (replaces the temporary posted page), `/app/tasks/[taskId]/offers/[offerId]`;
   - e2e.
4. Then UI-009 (helper side of offers), so offers can be created for real.
5. **Phase 1 leftovers:** injectable clock and dev time travel; outbox dispatcher and jobs; staff TOTP.

## Open issues
- Each page ships the whole next-intl message catalog (about 76 KB). Later: pick client namespaces per route.
- The UI-021 quality pass should cover the native file input in the posting wizard.
