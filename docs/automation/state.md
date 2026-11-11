# Autopilot state

**Updated:** 2026-11-11 10:55 UTC (iteration 5)
**Phase:** 2–3 (tasks and offers). The poster's side is wired end to end: post a task, review offers, compare, decline, cancel.
**Codex:** UI-009 (find work, helper task view, offer form, my offers) running since 10:55 UTC. UI-008 is merged and needs wiring.
**Database:** Docker `tasksnearme-db` on 54329. After pulling: `npm run db:migrate && npm run db:seed`. `npm run e2e` reseeds the dev database itself (e2e-setup project).

## Done in iteration 5
- UI-024 (the wizard posted on Next) fixed by Codex and verified; posting e2e re-enabled.
- UI-007 wired:
  - offers schema and seeded offers;
  - domain actions; owner projections with masked messages and fee breakdowns;
  - decline, and cancel with a reason;
  - pages `/app/tasks`, `/app/tasks/[taskId]`, `/app/tasks/[taskId]/offers/[offerId]`.
- UI-008 merged (onboarding, profile editor). Contract requests accepted: work-sample uploads return the sample; `maxPhotoMegabytes`.
- UI-009 prepared and launched.
- e2e: the `e2e-setup` project reseeds and removes posting leftovers; one retry for dev-server compile hiccups.

## Next steps
1. **Wire UI-008:**
   - verification module (`identity_verifications`, `payout_accounts`, `eligibility_checks`);
   - dev provider stand-ins at `/dev/providers/{identity,payout,background}` with pass, fail, and review buttons that simulate webhooks;
   - per-category bookability, badges recomputed on `helper_profiles`;
   - onboarding routes in the `(flow)` group with server-side step gating;
   - profile editor actions (profile, services, area, tools, work samples, pause); `setMode('helper')` goes to onboarding until bookable.
2. **When UI-009 hands off:** merge it, then wire the helper offers service: eligibility, at most 25 active offers, expiry, revise, withdraw, reconfirm, outbox, and audit. Add the find-work query with distance bands, plus e2e.
3. **Prepare UI-010** (booking confirmation and the payment placeholder, direct invites, availability) so Codex stays busy. The bookings module (Phase 4) follows: Stripe test mode is blocked, so use a fake payment provider.
4. **Phase 1 leftovers:** clock and time travel, outbox dispatcher and jobs, staff TOTP.

## Open issues
- Each page ships the whole next-intl message catalog (about 76 KB).
- UI-021 quality pass: the native file input in the posting wizard; the offer-detail action bar overlaps content on phones.
