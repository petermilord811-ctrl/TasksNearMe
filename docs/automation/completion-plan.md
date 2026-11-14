# Completion plan (2026-11-12)

The owner asked for a plan to finish the project, and then for all of it to be built without questions:
1. "KYC and background check logic, phone verify with address verification with proof of address document";
2. "absolutely complete the whole project logic";
3. "think about good features and implement";
4. "map integration, a more ideal and more useful way";
5. "make the task list very comfortable".

Claude builds everything, including the UI, while Codex is at its limit (until 2026-11-17; decisions.md). Each part below ends with green checks and a local commit. Nothing is pushed. Decisions go to `decisions.md`, and product changes go to the blueprint (said so in each commit).

Status legend: ☐ to do · ◐ in progress · ☑ done.

## Part 1 — Verification, start to finish ("KYC")

The blueprint's three tracks (identity, work eligibility, payouts) become five steps a helper finishes before sending offers. The new ones are a verified phone and a verified home address with a proof-of-address document.

**New onboarding order:** profile → services → area → **phone** → ID → **home address** → payouts → background check (in-home categories only) → done.

**Bookable** (can send offers) means all of these:
- the helper agreement is accepted;
- the phone is verified;
- the ID is verified, and the ID name matches the account name or staff confirmed it;
- the home address is verified;
- payouts are active;
- for in-home categories, a background check that's clear (or that staff approved) and current.

| # | Piece | What it includes |
|---|---|---|
| 1.1 ☑ | Data model (migration 0029) | `agreements` (blueprint 08: helper agreement, biometric consent, background-check disclosure, with IP and browser); `address_verifications` (encrypted address, nearest area, document type, private document file, status, reviewer, reason, document deletion date); `identity_verifications` gains name match, attempt bookkeeping, a re-check reason and redaction dates; `background_checks` gains adjudication (engaged, pre-adverse, post-adverse), the invitation's expiry and the reminder dates |
| 1.2 ☑ | Rules (pure functions, unit-tested) | The step order and locks, what's bookable, ID attempt limits (3 a day, 5 in all, then staff review), under-18 closes helper onboarding, name matching, address standing (a new proof in review doesn't undo an earlier verified one), background renewal (from 30 days before expiry), adjudication |
| 1.3 ☑ | Phone step | The existing texted-code flow inside onboarding; done automatically when the account already has a verified phone |
| 1.4 ☑ | ID step | Texas biometric notice and consent before the check opens (CUBI); attempts; "checking your name"; ineligible under 18; staff can ask for a new check; changing your legal name after verifying asks for a new one |
| 1.5 ☑ | Home address step | Address search (Mapbox, confirmed like posting), unit, document type, one photo or PDF up to 10 MB, and the declaration that it shows the person's name and address and is dated within 90 days. Then in review, verified, or "needs another document" (with the reason) |
| 1.6 ☑ | Background step | The disclosure summary and acknowledgment before Checkr; the invitation's 7-day expiry; clear for 12 months with renewal; "under review" (no details ever); pre-adverse and final adverse action; suspended ("Checkr needs more information") |
| 1.7 ☑ | Staff | A Verification queue on `/admin`, `/admin/verifications` (address proofs, name checks, ID reviews, background reviews), and a Verification section on the person page. Viewing a document needs a reason, is logged, and opens a 5-minute link. Staff can approve or reject a proof, confirm a name, allow more ID tries, ask for a new check, and adjudicate a background check |
| 1.8 ☑ | Timers (job runner) | Delete proof documents 30 days after the decision; ask the provider to redact ID images 30 days after a final ID result; expire stale ID sessions (48 h) and background invitations (7 days); background renewal reminders at 30 and 7 days, and pausing in-home work at expiry |
| 1.9 ☑ | Notifications | Verified, needs your action, background check expiring, "you can send offers now" |
| 1.10 ☑ | Where people see it | The profile editor, the account page's verification section, and a public "Address verified · Nov 2026" badge (never the address) beside ID verified and background checked |
| 1.11 ☑ | Tests | Unit tests for the rules; integration tests for every track, the staff decisions, the timers and the privacy of documents; e2e for onboarding start to finish and the staff review |

Privacy: the document is the only verification data that enters our storage. It's private (the owner can't download it again, and staff see it only with a logged reason), images are re-encoded without metadata, PDFs are checked to be PDFs and served sandboxed, and it's deleted 30 days after the decision. ID images, birth dates, SSNs and background reports still never enter our database.

## Part 2 — A comfortable task list, and maps where they help

| # | Piece | What it includes |
|---|---|---|
| 2.1 ☑ | Find work, redesigned | A compact sticky filter bar (chips that scroll on phones, the rest in a "Filters" sheet), sorts (soonest, newest, nearest, highest budget), days as sticky groups ("Today", "Tomorrow", "This weekend"), dense rows (budget and "you'd earn", distance band, time window, offers so far, a "New" mark, how long ago), and save / hide on each row |
| 2.2 ☑ | List and map | On phones a list/map switch; on wide screens the list beside a sticky map. Each task is its general-area circle (never an address); nearby tasks group with a count; the helper's service area is drawn; hovering a row lights its circle and the other way round; tapping a circle shows the task card |
| 2.3 ☑ | Saved and hidden tasks | "Save for later" and "Not interested" for helpers, with a Saved filter |
| 2.4 ☑ | Maps elsewhere | The task page (helper and poster): the general-area circle and how far it is from the helper's area. Posting: a preview of exactly what helpers will see. The helper's area step: the service area drawn live as the radius changes. The booking page for the booked helper: Directions buttons (Google Maps, Apple Maps) built from the address text, never from stored coordinates. The public task board gets a map view too |
| 2.5 ☑ | Poster's lists | My tasks and bookings: what needs attention first, grouped by day, offer counts and the newest offer on each task |

Maps stay free: MapLibre with OpenFreeMap tiles, and the static fallback when WebGL is missing. Mapbox is used only for address search (its terms: no stored coordinates).

## Part 3 — Finish the logic the blueprint still asks for

| # | Piece | Why |
|---|---|---|
| 3.1 ☑ | Task alerts for helpers | Blueprint J1: matching helpers (category, service area, alert settings) get an alert, rate-limited. A "New tasks near you" topic, at most 3 an hour and 10 a day per helper |
| 3.2 ☑ | Staff two-step sign-in with an authenticator app (TOTP) | The admin check still uses the development code 123456 (a TODO). Free, no provider |
| 3.3 ☑ | Data export and account deletion | The account page records the requests; build the export (a download for the person) and the deletion (anonymize once nothing is open), per blueprint 08 §5 |
| 3.4 ☑ | Retention timers | Blueprint 08 §5: exact addresses deleted 180 days after the last booking unless saved, and the rest of the table where a timer is missing |
| 3.5 ☑ | Web push (the third channel) | Finishes T-29: a service worker, VAPID keys generated locally, a subscription per device, asked only after a related action (posting a task; finishing onboarding), and the account page's "Notifications on this device" |
| 3.6 ☑ | Installable app | A web app manifest and icons, so phones can add TasksNearMe to the home screen (with push) |

## Part 4 — Good features

| # | Feature | Why it's worth it |
|---|---|---|
| 4.1 ☑ | Automatic reading of proof-of-address documents | With `ANTHROPIC_API_KEY`, Claude reads the document once and tells staff whether the name, address and date match. Staff still decide; only the yes/no answers are kept. Stand-in in tests |
| 4.2 ☑ | "Post again" | Posters repeat a past task in two taps (the same category, details and address) |
| 4.3 ☑ | One-tap offer at the posted budget | For fixed-price tasks, helpers offer the asked price straight from the list |
| 4.4 ☑ | Provider adapters for Stripe Identity and Checkr | Written against their APIs with tested webhooks, so adding the keys switches the stand-ins off |

## Order of work

Part 1 first (1.1 → 1.11, about four commits), then 2.1–2.3 (the list and map), 3.1 (alerts, which use the same matching), 2.4–2.5, 3.2–3.4, 4.1, 3.5–3.6, 4.2–4.4. Anything that turns out to need the owner goes to `blocked.md`, with the workaround, and the work continues.

## Part 5 — Before launch (2026-11-13)

Parts 1–4 and phase 2 are built, apart from multi-helper bookings and errands (decisions.md, blocked.md). This part covers the launch-hardening items from blueprint 11 (E7) that don't need the owner. After the move to the VPS, the owner opened three Claude sessions and asked for the work to be split between them. tasksnearme-b2 coordinates: it runs the full gate, owns the dev server and keeps `state.md`. Heavy jobs take turns through `node scripts/heavy.mjs`. Migration numbers are reserved per session.

| # | Item | Session | What it includes |
|---|---|---|---|
| 5.1 ☑ 597aa3c | Staff analytics (B-067) | tasksnearme-89 | `/admin/metrics`, daily for the market: the funnel (post → offer → book → complete → rebook), liquidity (offers within 24 h, time to first offer, fill rate by category and area), and reward spend against the caps. Money figures only for the roles blueprint 08 allows. Migration 0044 if needed |
| 5.2 ☑ cc872fa | Runbooks (B-066). The tabletop exercise for a payments outage needs the team (`blocked.md`) | tasksnearme-89 | `docs/runbooks/`: a payments incident, a webhook backlog, dispute handling, reward fraud review and safety escalation, grounded in the real staff pages, jobs and code paths |
| 5.3 ☑ 750307f, d294eda | Private-beta access (B-068) | tasksnearme-8f | Invite codes and cohort flags per market and role (poster, helper). Sign-up and helper onboarding honor them. Staff create, limit and revoke codes and see who joined. Everyone else gets the waitlist. Migration 0045 |
| 5.4 ☑ d294eda | Bot protection with Turnstile (part of B-061). Offers aren't covered yet (5.6) | tasksnearme-8f | An adapter like the other providers: a stand-in in development and tests, switched on by its keys, and checked on the server for sign-in code requests, sign-up and posting |
| 5.5 ☑ 2f60200, 2cc3311 | A shared cache store for several web instances (`SHARED_CACHE_HANDLER=off` falls back to the built-in) | tasksnearme-8f | A `cacheHandlers.default` that keeps entries in memory (size-bounded) but records tag invalidations in Postgres (migration 0043). Each instance reads newer invalidations once per request (`refreshTags`) before it serves, and old tag rows are pruned. Lifts the "run one web instance" limit in `blocked.md` |
| 5.6 ☑ d0fc779, 5436363, 8f234d1, 79ec59a, 8cb86dc, 744d7f4, b135a8d, c512432, 0a224d3 | Security review (the rest of B-061), including Turnstile on offers. Left: an external light pen test (owner) and the typescript-eslint patch upgrade (b2, in a quiet window). Also done: wrong-party refusals proven in 11 groups (plus the counter-payment fix), a CSP (enforced in production, report-only in dev), the waitlist keeping the first answer, unsubscribe links expiring after a year, a posting limit after the first week, and the X-Forwarded-For rule in blueprint 10 §4. Done so far: dev tools answer only local requests; all 191 Server Actions reach a session check; the /api/files staff leak is fixed; /api/auth answers only the provider callbacks (the raw Better Auth endpoints skipped Turnstile, our limits and audits); staff rules are fixed (no self-resolve after de-escalating, refund limits count earlier refunds, beta switches are admin-only); Turnstile covers offers. npm audit shows no high or critical findings (11 moderate in dev tooling; a typescript-eslint patch upgrade is due in a quiet window). The secret scan is clean | tasksnearme-8f | Authorization tests for every server action and route handler (role, ownership, staff permissions), the CSP and rate limits, `npm audit`, and a secret scan. High and critical findings get fixed |
| 5.7 ☑ e0656cc, 2ce8e12, e1cfe7f, 9a17b58, e92a6bc, 7eb2045, b384a0e, e92de3e, 5df63e9 | Performance (B-063) | tasksnearme-b1, formerly 8f (tasksnearme-89 fixed the prefetch bug) | Public page budgets (blueprint 07 §6); per-page message catalogs (today every page ships about 76 KB of messages); image sizes; indexes for the hot queries (checked with EXPLAIN); a k6 script at 10× beta volume. **First, a bug found on the production preview (tasksnearme-3c, 2026-11-13):** once `NEXT_LOCALE=es` is set by visiting `/es`, the segment prefetches for un-prefixed links (`GET /how-it-works?_rsc=…` with `Next-Router-Segment-Prefetch: /$d$locale/!KGxhbmRpbmcp` and `…/__PAGE__`; also /become-a-helper and /pricing) answer 404 in production. The navigation still works in Spanish, but takes about 1.4 s instead of about 0.1 s. English is fine. Dev never prefetches, so it only shows in a build (the preview at 127.0.0.1:3200). Suspects: the proxy's cookie-based rewrite of prefetch requests (`src/proxy.ts`) against the prerendered `[locale]` segments **Done (tasksnearme-b1):** public pages within LCP 2.5 s (about 1.55 s), except the landing page (about 3.4 s with a GPU, 8 s without: the hero fade and the town's still), which tasksnearme-40 has with the numbers; JS budgets per route; per-page catalogs; images at their shown size; the bookings.offer_id index and the inbox N+1; k6 at 10× (the full run waits for staging, blocked.md) |
| 5.8 ☑ 83afeea | Accessibility audit (B-062) | tasksnearme-8f | WCAG 2.2 AA: keyboard-only e2e runs of the core journeys, focus order and visible focus, names for screen readers, and fixes |
| 5.9 ☑ 3a18e2b, e6c8e8a, 4169ceb, 45a771c, 254fa15, 22310e8 | Two-account scenario suite (B-060) | tasksnearme-b2 (helper agent) | Close the partial and missing T-01–T-30 rows in `final-report.md` with e2e or integration tests. Done: T-06 (webhook ordering), T-18 (chargebacks: the hold, the loss journal in a new ledger, migration 0051, and finance's evidence pack), T-19 (payout failure) and T-26 (budgets under concurrency), each by integration tests that found real bugs, now fixed (decisions.md, 5.9 rules). T-29: web push was built in 3.5 and is covered by the `push` tests; a real browser push service isn't exercised |
| 5.10 ◐ | UI refinement (owner, 2026-11-13: "refine all uis and elements") | tasksnearme-8d | A pass over every screen at 360 and 1280. Includes the open issue about the landing page's featured helpers on phones |
| 5.11 ☑ 6c0474e, 9492599 | A webhook inbox (blueprint 09 §4.2), with `/admin/webhooks` | tasksnearme-89, then 5.13 → 5.14 → 5.12 → 5.15 | Gap found by the runbooks. Every incoming webhook is recorded (provider, event id, payload hash, status), processed idempotently and retried, and failures land in a dead-letter list that staff can see and replay |
| 5.12 ☑ 02f7cfa, ccce62b | Consumers for the events nobody handles | tasksnearme-89 | Gap found by the runbooks. `support.safety_report` pages the staff on call; `payment.refund_needed` and `support.case_opened` get consumers |
| 5.13 ☑ 6157076, a5f4e30, fb49743 | Money gaps | tasksnearme-89 | Gap found by the runbooks. Transfer reversals when a refund follows a payout, and `chargeback_open`, `chargeback_won` and `chargeback_lost` set from the Stripe dispute webhooks |
| 5.14 ☑ 669d794 | Staff account and booking controls | tasksnearme-89 | Gap found by the runbooks. Ban an account and end its sessions; staff cancel a booking, with the right money outcome and the audit log |
| 5.15 ☑ 64abfb9 | An outage switch | tasksnearme-89 (now 8d) | Gap found by the runbooks. A per-market switch that pauses new bookings and payments, with a banner, for the payments-incident runbook |
| 5.16 ☑ 9a17b58 (in that commit), 6a5d0f9, e03fcce, b7b6f2c | e2e against a production build (found 2026-11-14: the dev server could not hold a full e2e run on the 7.7 GB VPS) | tasksnearme-ba, formerly b2 | `npm run e2e:build` keeps the development helpers on behind one switch (`devHelpersOn`, src/shared/dev-helpers.ts; the flag inlined at build time, local requests only, refuses a non-localhost APP_URL, no upgrade-insecure-requests over plain http). The gate and `heavy.mjs --e2e-build` pause the dev server, build, and run e2e against `next start` on :3300. Result (gate, 2026-11-14 04:48): 196 passed, 0 failed, 1 flaky, 81 skipped, in 4.8 min (the last dev-server gate: 54 failed in 80 min). The preview harness runs on it too (`--project=ui-mobile --project=ui-desktop --workers=2`). Left: full-page screenshots crash at 4 workers under memory pressure, and the landing-map previews log 404s in production builds only (being traced) |
| 5.17 ☑ 2c796fb, f0750fa, 700d9c8, f91d614, ad62b1d | Payment follow-ups found by 5.9 | tasksnearme-b2 (helper agent) | The T-06 race in the other payment paths: change-difference payments (`finishChangeVerification` → `settleDifference` takes no payment lock, so a good payment can get a refund request or clash on the `booking_terms` version) and invite holds (`settleRequest` doesn't guard the invite's status). A rebook proposal finished only by the webhook stays "sent". The staff exceptions tab lists every failed payout forever, even after a later one paid. "Action needed" clears at the next payout rather than when the bank is fixed (handle `account.external_account.*`). Each with a test that fails first |
| 5.18 ☑ 547651b, 90ea758, 4752f66, 2502c71, 65fd742, 40bd194, ac40714, eae5d29, ae4dba2, 820d5b2, 36fe001, 440ce6c, 4f896e3 | Security re-review of everything since 5.6 | tasksnearme-b1, then d1 (e6 finished the e2e guard, 440ce6c) | The new routes, actions and switches since 5.6 get the same review, with wrong-party tests where missing: the chargeback evidence pack (5.9), on-call paging (5.12), the staff ban and cancel (5.14), the outage switch (5.15), the e2e build's development helpers and proxy guard (5.16), and the ID hash and duplicate-ID case (6.3) |
| 5.19 ◐ | Test reliability (found 2026-11-14) | tasksnearme-d1 | Flaky tests seen today: social-sign-in "connects Microsoft from the account page, then disconnects it" (desktop), a11y-keyboard on desktop (a Tab-count timeout on the booking page; axe document-title on the offer page before its streamed title), account "a notification preference saves" (toast timing). Data left behind: outage.test.ts leaves its tsk_out_* tasks open; staff-payments' exceptions test assumes no more than 100 exceptions. Run the full e2e suite three times on the e2e build to surface the rest, fix each flake at its cause (no blanket retries or longer timeouts), and keep the shared test DB independent of file order |

Needs the owner (`blocked.md`): live provider accounts and keys (B-065), final legal text (B-064) and deployment.

## Part 6 — Identity in two stages, badges, and the profile's first page (owner, 2026-11-13)

The owner's request: "Testing with my own platform ID and selfie check as Persona does (and save for a while until review is correctly done) and then do check again with given Persona link again for double check. Show that $50 gift card and that id check workflow at the profile first page. And as github, once they verify each verifications, add badge and once they finish task, make some types of special badges and add to users. And suggest any good ideas about logic."

This changes blueprint 06 §1: Persona was its fallback (F15) and becomes the double check. Stripe Identity stays as the alternative when only Stripe keys are set.

| # | Item | Session | What it includes |
|---|---|---|---|
| 6.1 ☑ 175909a, e0d0e8a | Our own ID check (stage 1) | tasksnearme-b2 | Guided capture: the document type, a photo of the front (and of the back, except for passports), and a live selfie taken with the camera that follows a random prompt (for example "look to your left"). Photos are re-encoded (no location or metadata) and stored privately and encrypted. Claude reads the ID's text (whether the name matches, 18 or older, not expired, document type) and never compares faces. In the identity queue, staff open the photos through a logged 5-minute link, compare the selfie and the prompt, and approve or reject with a reason. The current attempt limits apply. The Texas biometric notice covers our capture |
| 6.2 ☑ ba09b40, 13801ab | Persona double check (stage 2) | tasksnearme-b2 | Once staff approve stage 1, the helper gets a one-time Persona link. Results arrive through a signed webhook at `/api/webhooks/persona`, with a stand-in in development and tests. If Persona approves, the ID is cleared. If Persona declines what we approved, the helper is paused and staff get a "mismatch" case. Our photos are deleted once both stages are final, and at the latest 30 days after the decision. Clients' risk-triggered checks use Persona alone |
| 6.3 ☑ 7b11016, 1a0bdf4 | Identity extras | tasksnearme-b2 | Duplicate IDs: a keyed hash of the document number, issuing state and birth date, so the same ID on a second account goes to staff, while the number itself is never stored. A reminder 30 days before the ID expires (only the month is stored). A new check after a legal name change |
| 6.4 ☑ 50d8d9a, 95a90e8 | Badges, like GitHub achievements | tasksnearme-89 | Verification badges (phone, ID double-checked, address, background check) and tiered achievement badges: tasks completed (1, 10, 25, 50, 100), five-star reviews, on time, booked again by clients, category pro, regular visits and founding helper, plus badges for clients. Counted from completed and paid bookings across distinct clients, recomputed on events, announced with a notification, and revocable by staff. Shown on the public profile, on helper cards (top 3) and on the account page |
| 6.5 ☑ 0576be3 | The profile's first page | tasksnearme-89 | At the top of the first onboarding page and of the profile editor: the $50 founding-helper gift card (spots left, what's still needed, progress) and the verification steps, each with its state and next action. Also a verification section on the account page, which has none today |
| 6.6 ☑ 0576be3 | Fixes found while planning | tasksnearme-89 | Founding numbers are given out as helpers clear verification (today only the seed data sets them, so "spots left" never moves). Clients' ID checks stop counting toward the founding 100. `helper_profiles.completed_count` is kept up to date. Also: the $75 monthly reward cap counts the month in market time |
