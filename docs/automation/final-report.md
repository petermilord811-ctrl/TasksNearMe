# Final report: TasksNearMe autopilot

**Date:** 2026-11-12 · **Branch:** `main` (local only, never pushed) · **Final checks:** all green (see "How it was checked")

You asked to "build all". This report covers what's built, how it was checked, what's left and why, and how to run it.

## What's built

TasksNearMe is a person-to-person marketplace for booking local help, launching in Austin. Everything in the product blueprint (`docs/blueprint/`) that doesn't need a real provider account or a legal decision is built and wired to real data in the local database.

- **Public site:** the landing page (brand, motion, hero canvas, a map of open tasks), market and category pages, the task board and task pages, helper profiles, how it works, becoming a helper, pricing, trust and safety, help, legal drafts, the waitlist, and sign-in.
- **Clients:**
  - Post a task (with the "Help me describe this" stand-in), get offers, then book and pay (new or saved cards, bank checks).
  - The booking page, change requests, approving the work or reporting a problem, reviews.
  - Saved helpers, Book again, Find helpers, receipts and cards, notifications, the account page.
- **Helpers:**
  - Onboarding: profile, services, area, ID check, payouts, background check. Then the profile editor.
  - Find work, offers and invites, availability posts.
  - Check-in on the day, completion with photos, hours and receipts.
  - Earnings and payouts, rewards, My clients and rebooking proposals.
- **Both people:**
  - Messages with contact masking, the booking timeline.
  - Cancellations and no-shows by policy, with **Find a replacement** and **Contest no-show report**.
  - Support cases, reports from conversations, tasks, profiles and reviews, blocking.
- **Staff:**
  - Queues, cases with money resolutions.
  - The booking page, with address and conversation access behind a logged reason, and refunds with approvals above each role's limit.
  - The bookings list, task moderation, rewards review (with risk signals).
  - People: suspend, reinstate, reverse strikes, and see each person's emails and texts.
  - Payments and reconciliation, staff roles, config (policy versions and flags), the audit log.
- **Behind the scenes:**
  - A job runner for every timer: payment holds, offers, invites, can't access, start and approval reminders, auto-approval, review publishing, notifications.
  - Email and text delivery by preference, with quiet hours and retries.
  - A test clock for time travel, rate limits, the audit log, encrypted addresses.

Every route in the sitemap (blueprint 02 §1) exists and works end to end, except `/app/series/[seriesId]`. That one is phase 2 (recurring visits; its flag is off).

The UI tickets ran through Codex until it hit its usage limit (until 2026-11-17). Claude built the rest to the same bar, recorded in `docs/automation/decisions.md` and in each ticket's handoff file. That covers UI-021 (the quality pass), UI-032 to UI-034, and UI-036 to UI-039.

## How it was checked

The final run on `main`, with every check the autopilot's "done" bar names:

| Check | Result |
|---|---|
| `npm run check` (typecheck, lint, unit tests) | Pass: 1,870 tests in 146 files |
| `npm run test:db` (integration tests on Postgres) | Pass: 184 tests in 45 files |
| `npm run e2e` (Playwright, phone and desktop) | Pass: 132 tests (57 skips are tests that run on one of the two projects) |
| `npm run test:ui` (every UI preview at 360 and 1280 px, axe, screenshots) | Pass: 853 previews |
| `npm run build` | Pass |

The gate (`node scripts/gate.mjs`) ran before every commit.

Earlier runs had two e2e checks that flake under machine load and pass on retry; the final run had none.

## Launch scenarios (blueprint 10 §3.2)

| Scenario | Status | Where |
|---|---|---|
| T-01 $60 desk, happy path | Covered | e2e `completion`, `booking`; integration `bookings`, `earnings`, `reviews`, `money-scenarios` (the money balances to the cent), `launch-gaps` (Book again pre-fills) |
| T-02 No response after completion | Covered | e2e `time-travel` (test clock); integration `approval-reminders` |
| T-03 Declined card, then a good card | Covered | e2e `booking`; integration `bookings` |
| T-04 Bank check completed, or abandoned | Covered | integration `bookings`, `launch-gaps` |
| T-05 Double tap and two tabs | Covered | integration `double-submit` (found and fixed four ways to charge twice) |
| T-06 Webhook ordering | Covered (signed test events, a fake Stripe) | integration `webhook-ordering`: through the webhook inbox, the webhook before and after the client's return from the bank, the same event three times in a row and three times at once, the webhook and the client at the same moment, and `payment_failed` after `succeeded` all end the same way (one confirmed booking, one charge, one saved card, one confirmation, the client told it's booked); also `webhook-inbox`, `stripe-payments` |
| T-07 Invite holds | Covered | integration `invites` (holds released after a counter and a cancel) |
| T-08, T-09 Client cancels early or late | Covered | integration `booking-sheets`, `earnings`, `welcome-reward` |
| T-10 Helper cancels | Covered | e2e `after-cancel`; integration `after-cancel`, `booking-sheets` |
| T-11 Helper no-show | Covered | e2e `after-cancel`; integration `after-cancel`, `booking-sheets`, `launch-gaps` |
| T-12 Client unavailable | Covered | integration `booking-sheets`, `after-cancel` |
| T-13, T-14 Disputes | Covered | e2e `disputes`; integration `staff-money`; unit `rewards/domain` |
| T-15 Change requests | Covered | e2e `changes`; integration `changes`, `launch-gaps`, `double-submit` |
| T-16 Hourly with a cap | Covered | integration `money-scenarios` ($154.00, $19.25, $110.25; 4.5 h blocked until a funded cap increase) |
| T-17 Expense allowance | Covered | integration `money-scenarios` ($86.00, $8.00 apart, $12.00 back) |
| T-18 Chargebacks | Covered (signed test events, a fake Stripe) | integration `chargebacks`: before approval the helper's earnings are held until the dispute is won; after the payout the helper keeps the money and a lost chargeback is a balanced `chargeback_loss` journal in the ledger, once; finance (and admins) download the evidence pack from the staff booking page, audited, and nobody else can; also `stripe-payments`, `transfer-reversals`, unit `admin-booking-screen`. The hold, the ledger (migration 0051) and the evidence pack were built for it |
| T-19 Payout failure | Covered (signed test events) | integration `payout-failure`, proven on the earnings page's data: "Action needed" after `payout.failed`, gone once the next payout after the bank update (`account.updated`) is paid, with the same money; a payout returned days after it was paid; payout events out of order; also `stripe-connect`, `staff-payments` |
| T-20 Address privacy | Covered | e2e `address-privacy`, `booking-page`; integration `booking-hub`, `staff-money`, `uploads` (no EXIF) |
| T-21 Contact masking | Covered | e2e `messaging`; integration `messaging` |
| T-22 Welcome reward | Covered (fake gift cards) | integration `welcome-reward`, `rewards` |
| T-23 Repeat reward | Covered | integration `rewards`, `monthly-cap` |
| T-24 Stacking | Not built by design | The acceptance and completion programs are off at launch (blueprint 05); one reward per booking is enforced by an index |
| T-25 Self-dealing pair | Covered | integration `reward-risk` |
| T-26 Budget under concurrency | Covered | integration `reward-budget`: 50 parallel qualifications against a budget for 10 make exactly 10 grants, a voided grant's share goes to exactly one more helper, and the founding cohort's last 10 numbers go to exactly 10 of 50 helpers at once; also `welcome-reward`, `monthly-cap`, `founding` |
| T-27 Rewards and reviews | Covered | integration `reward-risk` |
| T-28 Staff limits | Covered | e2e `refund-approval`; integration `refund-approval`, `launch-gaps`, `strike-reversal` |
| T-29 Notifications | Covered, push through a stand-in push service | Email and texts by preference with quiet hours: e2e `notification-delivery`, integration `notification-delivery`. Web push (built in plan 3.5): integration `push` (every device of the person, quiet hours with urgent updates at once, devices the push service says are gone forgotten, never tips and news), unit `web-push` (RFC 8291 encryption, VAPID) and `delivery-domain`, component `push-device`. Not covered: a real browser's push service and the service worker (`public/sw.js`) showing the notification (no e2e). Push has one switch per device rather than per-topic preferences, by design |
| T-30 Daylight saving | Covered | unit `bookings/dst`, `notifications/delivery-domain` |

The scenario tests found real bugs, and each one is fixed:

- **Charging twice (T-05):** a double tap, a second tab, a double-paid change difference, or a double-accepted rebooking proposal each charged the card twice.
- **Daylight saving (T-30):** on the night the clocks fall back, the offer form listed 1:00 and 1:30 twice.
- **Rejected rewards (T-25):** a reward staff rejected after review came back on the next visit.
- **Webhooks at the same moment (T-06):** when Stripe's webhook and the client's return from the bank finished a payment at once, the booking was confirmed two or three times (as many saved cards, messages and confirmations); a client whose webhook got there first was told the booking failed, and a declined one wasn't told why.
- **Chargebacks (T-18):** a chargeback opened before approval didn't hold the helper's earnings, and a lost one left no record of the platform's loss.
- **Payout failure (T-19):** "Action needed" never went away after one failed payout, a payout that failed after it was paid kept its earnings "paid out", and a late payout event moved a paid payout back to "in transit".
- **Reward budgets (T-26):** the welcome program's budget was only shown to staff, never enforced: 50 helpers qualifying at once got 50 grants against a budget for 10.

## Not done, and why

| Item | Why | What's in place |
|---|---|---|
| Real providers: Stripe (payments, Identity, Connect), Checkr, Postmark, Twilio, Tremendous, Google Places or Mapbox, Cloudflare R2, Anthropic | Accounts, contracts and keys are yours to set up (`blocked.md`) | Stand-ins behind the same interfaces. `docs/integration-points.md` says what each adapter must do. A key without an adapter makes the app throw instead of faking |
| Web push | Needs a service worker, VAPID keys and a permission prompt (a product choice) | Email and texts cover notifications |
| Recurring visits (`/app/series/[seriesId]`) and the acceptance and completion rewards | Phase 2 in the blueprint | Their flags are off |
| Final legal text | Needs counsel | Pages say "Draft — pending legal review" |
| Deployment, domain, real money | Yours to decide | The production build passes; nothing was pushed or deployed |

Smaller follow-ups are listed in `docs/automation/state.md` (open issues) and in the UI handoffs.

## How to run it

See `README.md`. In short:

```
npm install
cp .env.example .env.local
npm run db:up && npm run db:migrate && npm run db:seed
npm run dev
```

Then open `http://localhost:3000/dev/sign-in` to sign in as any seeded person. Staff use the two-step code `123456`. `docs/integration-points.md` explains how to swap each stand-in for the real provider.
