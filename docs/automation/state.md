# Autopilot state

**Updated:** 2026-11-13 (phase 2 in two sessions: regular visits with scheduled payments and the recurring-month reward, bookings far ahead paid later; from the other session: credits for clients, instant payouts, passkeys, and the Spanish UI under way)
**Autopilot:** the owner said "go ahead, build all" (2026-11-12): build everything left, Claude doing the UI too while Codex is at its limit (decisions.md). On 2026-11-13 the owner added: "refine all uis and elements and implement new features that are left without asking me". Two Claude sessions share the work (see the memory note and the split below).
**Phase:** 5–6 (repeat bookings, trust, support and staff tools). Wired end to end:
- the landing page (UI-036): the new brand, the motion system, the hero canvas, the map of open tasks with "Use my location";
- posting a task, offers, find work, and booking with payment (development stand-in);
- the booking page for both people: check-in, sheets, completion with evidence, approval, problem reports, disputes, change requests;
- direct invites (request a helper, accept, decline, counter, cancel; Book again; Invite helpers); availability posts;
- messages with masking, double-blind reviews, saved helpers, receipts and cards, earnings and payouts, rewards;
- the home dashboards; notifications (incl. change and invite events), the account page, real unread badges;
- support for members, reporting and blocking; staff queues, cases, money resolutions, the staff booking page, rewards review, users.

**Codex:** at its ChatGPT usage limit until 2026-11-17 12:32 (local). Buying credits is the owner's call. Tickets run with `node scripts/codex-run.mjs UI-xxx` (logs in `scratchpad/codex-UI-xxx.log`).
**Database:** Docker `tasksnearme-db` on 54329 (user `tnm`). If Docker Desktop is down, start it (AUTOPILOT). After pulling, run `npm run db:migrate && npm run db:seed` (migrations 0000–0038). `npm run e2e` reseeds the dev database itself; `npx playwright test --project=e2e-setup` alone tidies it (removes e2e-posted tasks) without running the suites.
**New dependencies (UI-036):** `motion`, `maplibre-gl`. Run `npm install` after pulling (never while a dev server runs in that checkout).

## Done on 2026-11-13 (owner requests)
- **Regular visits** (blueprint 03 §7, migration 0040; this session): a helper proposes a past cleaning or yard task again on a schedule (weekly, every 2 weeks, monthly by weekday); the client pays the first visit and the card stays on file; each visit is its own booking, `scheduled` until its card is charged 48 h before (retries at 36 h and 24 h, skipped unpaid at 12 h, "Pay now" on the booking page); skip, pause (auto-resume), change card, stop; the helper skips 48 h ahead or ends with 7 days' notice; one conversation per series; six notifications. `recurring` is on by default. The UI is built (UI-059): Repeat on proposals, `/app/series/[seriesId]`, the booking page's paid-later card, regular visits on the bookings list, checkout for far-ahead bookings.
- **Automated replacement matching** (P2): a helper who cancels 3 h or more ahead reopens the client's task on its own; earlier offerers and the 10 most reliable helpers it suits are told; the client is told.
- **Ranking by reliability** (P2): browsing helpers lists the most reliable first; "Reliable" on helper cards and offers (UI-060).
- **A suggested category on posting** (P2): "Not sure which one? Describe what you need" (UI-060).
- **The recurring-month reward** (blueprint 05 variant B): $15 once per series after a calendar month with every visit completed and paid (`reward.recurring_month`, on).
- **Bookings more than 14 days ahead** are booked now and charged 72 h before (blueprint 04 phase 2; a retry at 48 h, canceled and reopened at 24 h). Only reachable when staff raise `maxLeadDays`.
- From the other session: credits for clients and instant payouts (0039), passkeys and a session guard (0041), and the Spanish UI groundwork (pages under `src/app/[locale]`, the proxy picks the language; new pages go there).
- **Every provider adapter is built** (no SDKs, each tested against the provider's documented API, on when its keys are set): Stripe payments (Stripe.js card field, customers in `payment_customers` (migration 0038), 3-D Secure in the bank dialog, payment-intent and chargeback webhooks), Stripe Connect payouts (Express onboarding, `scheduled` earnings moved by the `earnings.transfers` job, account and payout webhooks), Twilio texts, Cloudflare R2 file storage (SigV4), Tremendous gift cards, plus the earlier Stripe Identity, Checkr, Resend or Postmark, and Mapbox. Production refuses to fake texts, files, payments or gift cards. Deleting an account deletes the Stripe customer.
- **Private feedback with a review** (P2): "Anything for our team?" opens a low-priority request only the author is on.
- **Staff code fix:** only wrong codes count toward the 5-in-10-minutes pause (the e2e staff sign-ins were being refused).
- **ID checks for clients when risk asks** (P2): our team asked, 2+ reports in 30 days, 5+ failed card payments in 24 h, or a $500+ booking from an account under 7 days old. Posting, requesting and paying go to `/app/verify-identity?next=…` (the helper's hosted check, limits and Texas notice) and come back; actions refuse with `identity_required` (`src/modules/trust/poster-risk.ts`, integration `poster-identity`).
- **Saved replies and response times for staff** (P2): `/admin/saved-replies` (leads write them; migration 0037 `support_macros`), "Start from a saved reply" on a case with `{first_name}` / `{staff_name}` filled on sending; `/admin/response-times` (each queue against its targets, past due, due within the hour, the week's on-time rate, who has what). e2e `support-tools.spec.ts`.
- **Waiting:** private feedback to support with a review (P2 item 4) goes on `src/ui/screens/reviews/review-form.tsx` once the other session commits its refinement there.
- **Landing, seventh pass** (UI-053): the skeleton town that grows into the 3D one; the 2D map's setup made lighter and started after the build-up; the page's floating scrollbar (no white strip).
- **Installable app** (plan 3.6): `src/app/manifest.ts`, icons in `public/icons` (including the push badge).
- **One-tap offer** (plan 4.3, UI-054): on find work, fixed-price tasks; Undo withdraws.
- **Post again** (plan 4.2, UI-055): a finished task in two taps, its saved address read again on "Post".
- From the other session: data export and deletion (3.3), retention timers (3.4, `readExactAddress()`), web push (3.5, `public/sw.js`), Stripe Identity and Checkr adapters with signed webhooks (4.4).

## Done for the completion plan (2026-11-12 – 13, owner request "complete the whole project", without asking)
- **Find work, redesigned** (2.1–2.3): a pinned filter bar, sorts (soonest, newest, nearest, highest pay), days as groups, compact rows with what the helper earns, Save for later and Not interested (`task_marks`, migration 0030), and the list beside a map of general areas (MapLibre with OpenFreeMap over a drawn map; never an address).
- **Task alerts** (3.1): new tasks reach the helpers they suit, at most 3 an hour and 10 a day (`task_match`, topic `task_alerts`).
- **Maps where they help** (2.4): the task page, the posting preview, the helper's service area, directions links for the booked helper.
- **The poster's lists** (2.5): "Needs you" on My tasks (a payment to finish, work to review, offers on a task within a day, new offers, no offers after a day), the newest offer on each task, booked tasks and upcoming bookings by day, and what to do next on bookings (`ownerTaskAttention`, `bookingNextStep`).
- **Staff sign-in with an authenticator app** (3.2): TOTP built in, setup codes from another admin, resets that end sessions' checks, `npm run staff:setup-code` for the first admin (migration 0031). Development keeps 123456.
- **Data export and account deletion** (3.3): a JSON copy prepared by the job runner and downloadable for 7 days; deletion after a 7-day grace (Keep my account), waiting while anything is open, then anonymized as "Deleted user" (migration 0032).
- **Retention timers** (3.4): addresses 180 days after the last booking (`task_locations.deleted_at`, migration 0033; read through `readExactAddress`), messages and completion files after 2 years, the audit log after 7, expired sessions and codes.
- **Web push** (3.5): "Notifications on this device", the prompt after posting and at the end of helper setup, `public/sw.js`, RFC 8291/8292 with Node's crypto, `npm run push:keys` (migration 0034).
- **Proof-of-address reading by Claude** (4.1) and **Stripe Identity and Checkr adapters** with signed webhooks (4.4; migration 0035). Production verification still waits for the Stripe Connect payout adapter.
- **Parallel work:** a second Claude session shares this checkout (memory `parallel-claude-session`). Claude's own work happens in the worktree `../TasksNearMe-claude` (branch `feat/find-work-map`, `node_modules` junctioned) and is fast-forwarded into the shared branch; the other session's uncommitted `docs/automation/decisions.md` rows are kept by a three-way merge each time.

## Done after the finish (2026-11-12, owner requests)
- **Continue with Google / Microsoft** (UI-040): Better Auth providers; real with keys, a stand-in at `/dev/oauth/<provider>` without; a provider email creates or joins an account only when the provider confirms it; suspended accounts refused; "Ways to sign in" on the account page. Integration `social-sign-in`, e2e `social-sign-in.spec`.
- **Landing interactions** (UI-041): a click moves the page together (filter pill, count, rows, map flight, hero tint; hero card → map; price chips; theme reveal; category icon into the category page).
- **Bug fixes:** hovering a category cleared the map's filter; MapLibre "Style is not done loading" after Fast Refresh; the pin card covering the filter; review reports had no review on the staff case and no way to hide it (UI-042, integration `review-moderation`); e2e data left on the landing page (an e2e teardown reseeds); a code sent before a suspension still signed in.

- **Real Google sign-in and the welcome email** (owner request): `.env` regenerated (documented; the owner's Google keys kept); real Google in development, the stand-in beside it for tests; the welcome email after sign-up (founding helper $50 gift card first, live spots), the designed sign-in code email, Postmark built (`POSTMARK_SERVER_TOKEN`, `EMAIL_FROM`). Google's page answers `redirect_uri_mismatch` until the OAuth client lists `http://localhost:3000/api/auth/callback/google`.

- **Six-digit codes everywhere, and profiles** (owner request, UI-044–045): the code is six boxes that submit on the last digit; the email changes with a code sent to the new address (the old one gets a notice), the phone is added or changed with a texted code; profile photos (`users.avatar_file_id`, migration 0027) on the account page, the account menu, the helper editor, the public helper profile (new header) and helper and offer cards; Resend beside Postmark for real inbox delivery (one key at a time).

- **Claude writing help** (owner request, UI-048): with `ANTHROPIC_API_KEY`, "Help me describe this" (posting) and "Write it for me" (helper profile, offer message) use Claude Opus 5.5 through `@anthropic-ai/sdk` (pinned 1.3.0); one `ai_drafting` flag, hourly limits, masking; tests use stand-ins (`tnm_ai_stand_in`). Run `npm install` after pulling.

- **Email** (owner request, UI-049): real delivery through Resend (`RESEND_API_KEY` in `.env`; the dev outbox keeps a copy of everything outside production); designed notification emails with signed unsubscribe links and one-click headers; `/email/unsubscribe`; bounces and complaints from a signed Resend webhook suppress notification email (`email_suppressions`, migration 0028); the gift card email. Restart the dev server after changing job or email code (the job runner keeps the code it started with).

- **Address search with Mapbox** (owner request): with `MAPBOX_TOKEN` in `.env`, posting suggests real Austin addresses (known address points only) and confirms the chosen one again on "Post" (`src/integrations/geocoding/mapbox.ts`); coordinates are never stored (Mapbox's terms). Tests use the sample addresses (`tnm_geo_stand_in`). No UPS/USPS check: their terms allow it only for their own shipments.

- **Verification, start to finish** (owner request, completion plan Part 1): onboarding is now profile (with the helper agreement) → services → area → **phone** → ID (Texas biometric notice first; 3 tries a day, 5 in all; name check; under-18 closes onboarding) → **home address with a proof of address** (reviewed by staff; the document is private, opened with a logged reason through a 5-minute link, and deleted 30 days after the decision) → payouts → background check (disclosure first; 7-day invitations; staff adjudication with pre-adverse and final adverse action; 12-month renewal with notices). Staff get `/admin/verifications` and a Verification section on the person page; helpers get "Address verified" on their profile and an "Account and verification" notification topic. Timers delete documents, close stale sessions and invitations, ask for ID image redaction and send renewal notices. Migration 0029 (`agreements`, `address_verifications`, new verification columns).

## Done in iteration 13 (the finish)
- **`/app/helpers`** (UI-039): browse and search the market's helpers.
- **After a cancellation (T-10–T-12):** Find a replacement (`tasks.reopened_at`, migration 0023), Contest no-show report, Book again after a helper cancellation; staff reverse strikes on appeal.
- **Timers:** approval reminders (24 h, 4 h), start reminders (24 h, 2 h); the **test clock** (`requestNow()`, `/dev/clock`) with e2e time travel.
- **Notifications by email and text** (T-29): preferences per topic, quiet hours for texts that can wait, retries, the staff person page's "Emails and texts" (`notification_deliveries`, migration 0024).
- **Reports from pages** (B-059): tasks, profiles and reviews (`/app/report/[kind]/[id]`).
- **Refund approvals** (T-28): above each role's limit, a lead or finance approves (`refund_requests`, migration 0025).
- **Reward risk** (T-25): a shared card or a new client account sends a reward to review; a rejection ends the program for the helper or pair.
- **UI-021** quality pass (built by Claude): the shared photo chooser, static day separators, eager lead images, 44 px switch touch areas, copy pass; a 320 px sweep of all 845 previews.
- **Scenario tests:** T-01 to T-30 mapped in `final-report.md`; they found and fixed double charges (T-05), duplicate DST start times (T-30), and rejected rewards coming back (T-25).
- Docs: `README.md`, `docs/integration-points.md`, `final-report.md`.

## Done in iteration 12
- **UI-032 wired** (`/app/clients`, rebook and proposal pages; `AttentionItem.actorName`); seed `bkg_wardrobe` (Maya's wardrobe with Sam, completed); e2e `rebook.spec`.
- **Server rules fixed:** no-show after the late minutes; can't access only 20 minutes after arriving.
- **Admin pages, built by Claude:** UI-033 (bookings list, task moderation with migration 0022 hidden tasks, audit log, `/admin/reports` redirect), UI-034 (payments and reconciliation), UI-037 (staff roles), UI-038 (config: policy versions, flags). Integration `staff-ops`, `staff-payments`, `staff-roles`, `admin-config`; e2e `admin-ops.spec`.
- Theme script through `next/script` `beforeInteractive`.
- Launch-scenario coverage was mapped (T-01–T-30): 3 full, 21 partial, 3 none, 3 need a real provider; the gaps are in "Next steps".

## Done in iteration 11
- **UI-036 (landing page v2)** built by Claude at the owner's choice (Codex at its limit), merged and wired; the handoff is `docs/ui/handoffs/UI-036.md`.
  - The new brand: ember, warm paper and iridescent light, light and dark with a switch; Bricolage Grotesque, Instrument Serif and DM Sans; the pin-and-check logo; the glass top bar.
  - `src/ui/motion` and the content-aware hero canvas.
  - MapLibre with OpenFreeMap tiles and a static fallback. Its worker is served by `/vendor/maplibre-gl-worker.mjs?v=<version>`.
  - `/` moved into the `(landing)` route group.
  - e2e `public-pages.spec` covers the landing page, nearest tasks with a category, and the waitlist outside Austin. `helpers-public` now starts at a category page.
- The light primary became `#C13F12` for contrast; page titles keep "TasksNearMe".
- The design system (§1–2.3) describes the new brand.

## Next steps
1. **On the new machine:** `npm install`, `npm run db:migrate` (0000–0042) and `npm run db:seed`, a dev server on :3000, then `node scripts/gate.mjs`. The last full gate here (2026-11-13, before the move) had test:db and the build green and e2e at 164 passed. Its two failures (an admin-ops test that wasn't retry-safe, and a focus test that flakes under load) were fixed or confirmed afterwards, and the check is green at 2,558.
2. Phase 2 is done here except multi-helper bookings (two posts for now, decisions.md) and errands (blocked on F17).
3. Before launch: a shared cache store for `"use cache"` across web instances (see the other session's note), real provider keys, legal text, deployment (blocked.md).
4. When Codex is back (2026-11-17), it can take UI polish tickets again.

## Open issues
- Each page ships the whole next-intl message catalog (about 76 KB plus the landing copy).
- Featured helpers show on the landing page only on wide screens (floating cards). A helper strip on phones is possible later.
- Checks are sensitive to machine load (two e2e checks flake under load and pass on retry): rerun failed specs alone before calling them real.
- Web push isn't built (email and texts are); T-26 has no parallel test (the cohort cap can't be exceeded by design).
- Google and Microsoft sign-in need real keys before launch (docs/integration-points.md); until then production hides the buttons.
- Resolved 2026-11-12: the landing filter cleared by hovering, MapLibre's "Style is not done loading", e2e data left on the landing page, the staff case page for review reports, a suspended account's pending email code. Checked and no longer reproducible: the notifications "marked as read" message; the my-offers invite preview dates.
