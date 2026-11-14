# TasksNearMe — Product and engineering blueprint (v0.1, 2026-11-10)

A person-to-person marketplace for booking local help with specific everyday tasks. One account works for both "I need help" and "I can help". Launching first in **Austin, Texas**; the launch market is configuration, not code.

This blueprint is the input to implementation. It contains no application code. The next step is to start the backlog at **M0 / B-001** ([11-initial-backlog.md](11-initial-backlog.md)).

## Documents

| # | Document | What it answers |
|---|---|---|
| 01 | [Product brief and scope](01-product-brief.md) | Users, use cases, why people return, launch categories and booking types, build / later / leave out, candidate prioritization, launch targets |
| 02 | [Sitemap and journeys](02-sitemap-and-journeys.md) | Public, signed-in, and admin pages; post → offer → book → complete → pay → rebook; the **$60 desk assembly** walkthrough and its variants |
| 03 | [State machines](03-state-machines.md) | Task, offer, invite, **booking**, change request, **payment**, helper earnings, recurring visits, **reward**, and support case states, with each person's actions |
| 04 | [Payments and fees](04-payments-and-fees.md) | Stripe Connect design, fee formulas, funding timing, transfers and payouts, refunds and disputes, ledger, **margin on a $60 booking** |
| 05 | [Rewards](05-rewards.md) | The four reward programs: funding, basis, unlock, stacking, cancellation; economics challenged; **launch policy** |
| 06 | [Verification, trust, compliance](06-verification-trust-compliance.md) | Identity vs eligibility vs payout/tax tracks, public badges, trust & safety, **pre-launch confirmations F1–F21** |
| 07 | [Architecture](07-architecture.md) | Stack, modules, **repository tree**, where code belongs, cross-cutting design, environments, AI drafting |
| 08 | [Data model and access](08-data-model-and-access.md) | Tables, relationships, constraints, **access matrix**, staff limits, retention |
| 09 | [APIs, events, idempotency](09-apis-events-idempotency.md) | Routes, provider events, **duplicate-charge, payout, and reward prevention** |
| 10 | [Build plan and launch](10-build-plan-and-launch.md) | Milestones with acceptance criteria, **two-account test scenarios**, sandbox vs live, go/no-go criteria, beta |
| 11 | [Initial backlog](11-initial-backlog.md) | About 68 sized and prioritized items with acceptance criteria |

## Key decisions

| ID | Decision | Where |
|---|---|---|
| D1 | Modular monolith: one Next.js 16 app (pages, API, webhooks) plus one worker from the same TypeScript codebase, one Postgres | 07 |
| D2 | PostgreSQL + PostGIS; Drizzle ORM; reviewed SQL migrations | 07 |
| D3 | Render (web, worker, Postgres, previews) + Cloudflare + R2 | 07 |
| D4 | **Stripe Connect, separate charges and transfers.** Helpers' accounts on Accounts v2 with the Express Dashboard; the platform collects fees and owns losses. Poster charged at confirmation (direct invites: a 48 h authorization, then capture). Helper paid by transfer after approval or 72 h auto-approval. **Manual platform payouts** keep helper funds in the balance. No escrow claims | 04 |
| D5 | Fees: 10% poster service fee (minimum $3) + 10% helper service fee; none on expenses | 04 |
| D6 | Stripe Identity for ID checks; Stripe-hosted payout and tax onboarding; 1099s filed by the platform through Stripe | 06 |
| D7 | Background checks (Checkr) before in-home categories, with a launch contingency. **Needs founder sign-off** | 06 |
| D8 | Rewards at launch: **welcome $50 for every helper whose phone, ID and background checks pass** (the owner's change of 2026-11-14: no cohort, no first task; no monthly limit (the owner's choice: every card goes to staff review, the program switch is the only limit on spend); the first 100 per market keep the Founding helper badge) and **repeat $10 (3rd paid booking with the same poster)** on; acceptance 5% and completion bonus built but off; one booking-level reward per booking | 05 |
| D9 | Recurring visits in phase 2; data model at launch | 03 §7 |
| D10 | Optional AI task drafting with the Claude API (`claude-opus-5-5`, low effort, structured output) behind a flag | 07 §8 |
| D11 | Better Auth (email codes, staff TOTP) + Twilio Verify for phones | 07 |
| D12 | graphile-worker jobs enqueued in the same transaction as state changes (outbox) | 07 |
| D13 | Server-sent events over Postgres LISTEN/NOTIFY (realtime; was Ably, changed 2026-11-14), Postmark (email), Twilio (SMS), Web Push | 07 |
| D14 | Address privacy: encrypted exact address; deterministic fuzzed public point per saved address; revealed on confirmation; hidden 48 h after completion | 07 §6, 08 |
| D15 | Cancellation: free until 24 h before; after that `max($10, 20%)`, all of it to the helper; helper cancellations refund in full and add a strike | 04 §6 |
| D16 | Policy timers and limits are versioned per market and snapshotted onto each booking | 03 §1 |

## Assumptions

| ID | Assumption |
|---|---|
| A1 | Team: 3 full-stack engineers (one owns payments), a part-time designer, and a founder/PM who also runs beta ops and support. About 18–20 weeks to public launch (24–30 with 2 engineers) |
| A2 | Launch market: Austin city plus adjacent ZIP codes within about 25 km of downtown (a configurable polygon; ZIP3 prefixes 786 and 787 for matching ZIPs); `America/Chicago`; USD; English at launch, Spanish in phase 2. Since 2026-11-14 (owner) the site is national and cities open in turn: Austin is the first, not the only one (01 §1) |
| A3 | Individuals 18+ only; helpers do the work themselves; no companies or agencies |
| A4 | Helpers are independent contractors who set their own prices and choose their tasks (to confirm, **F5**) |
| A5 | Fee schedule as in D5 |
| A6 | Standard Stripe US pricing as verified (04 §8) |
| A7 | One-time tasks can start from 3 hours to 14 days ahead |
| A8 | Timers: auto-approve 72 h; invite 48 h; pending funding 30 min; no-show 30 min; reward hold 7 days |
| A9 | First 3 months: 300–1,000 bookings/month and up to 500 active helpers (affects infrastructure sizing only) |
| A10 | Installable mobile-first web app; no native apps at launch |
| A11 | Rewards are promotional gift cards delivered through Tremendous and taxable to recipients |
| A12 | Promotions budget: welcome gift cards are uncapped since 2026-11-14 ($50 plus about $30 of checks per verified helper, no monthly limit; the program switch is the only brake), plus about $1,500/month for repeat rewards (estimate) |

## Founder decisions needed before build starts

1. **Fee levels** (D5): 10% + 10% gives about $6.97–$8.47 contribution per $60 booking.
2. **Background checks** (D7): cost and the contingency of launching with yard and remote categories if Checkr isn't ready.
3. **Welcome reward** (D8): decided 2026-11-14: $50 for every helper whose phone, ID and background checks pass, with no cohort and no monthly limit (05 §2–§4).
4. **Launch categories:** all five, or the three hero categories only.
5. **Team size**, which sets the timeline (A1).

## Verification log

Provider capabilities were checked against official documentation on **2026-11-10**.

**Confirmed (main sources):**
- **Stripe:**
  - Authorization windows: docs.stripe.com/payments/place-a-hold-on-a-payment-method. Extended and incremental authorization need IC+ pricing: …/payments/extended-authorization, …/payments/incremental-authorization.
  - Separate charges and transfers, `source_transaction` behavior, and the recommendation that the platform own losses: docs.stripe.com/connect/separate-charges-and-transfers.
  - Holding-funds guidance and negative balances: …/connect/account-balances. 2-year US payout limit with manual payouts: …/connect/manual-payouts.
  - Transfer reversal limits: …/api/transfer_reversals/create.
  - Pricing: stripe.com/us/pricing, stripe.com/connect/pricing.
  - Accounts v2 and settings: …/connect/accounts-v2, …/connect/integration-recommendations.
  - First payout delay: support.stripe.com/questions/delay-for-first-payout-for-connected-accounts. Payout schedule: …/connect/payouts-connected-accounts.
  - Identity pricing, use-case limits, and data controls: stripe.com/identity, …/identity/use-cases, …/identity/access-verification-results.
  - Idempotency: …/api/idempotent_requests, …/api-v2-overview.
  - Webhooks: …/webhooks, …/connect/webhooks.
  - 1099s: …/connect/tax-reporting.
  - Testing: …/testing, …/connect/testing.
  - Wallet domain registration: …/payments/payment-methods/pmd-registration.
- **Tremendous:** developers.tremendous.com (orders and `external_id`, webhooks); tremendous.com/pricing.
- **Checkr:** docs.checkr.com (invitations, webhooks, staging, adverse action, credentialing); checkr.com/pricing.
- **Twilio:** twilio.com/docs/messaging/compliance/a2p-10dlc (Verify exemption); twilio.com/docs/api/errors/80506 (Proxy closed to new customers).
- **Web push on iOS:** webkit.org/blog/13878 (Home Screen web apps, iOS 16.4+).
- **Ably:** ably.com/docs/auth/capabilities.
- **Postmark:** account approval article.
- **Next.js 16 and `proxy.ts`:** nextjs.org/blog/next-16.
- **Better Auth:** better-auth.com/blog/authjs-joins-better-auth, plugin docs.
- **Drizzle and PostGIS:** orm.drizzle.team/docs/guides/postgis-geometry-point.
- **graphile-worker:** worker.graphile.org/docs/job-key, /sql-add-job, /cron.
- **Render:** render.com/docs/postgresql-extensions, /preview-environments, /postgresql-backups.
- **IRS 1099-K threshold** ($20,000 and 200 transactions) and **1099-NEC/MISC** ($2,000 from 2026): irs.gov.
- **Texas:**
  - Comptroller publications 94-112, 96-259, 94-111, 94-127 and the marketplace-provider pages.
  - TWC 40 TAC §815.134.
  - Bus. & Com. Code §503.001 (CUBI).
  - HB 4 (TDPSA).
  - TxDMV Motor Carrier Handbook.
- **FTC:** Consumer Reviews and Testimonials Rule (ftc.gov Q&A).
- **Claude models and pricing:** Anthropic API reference, cached 2026-11-03.

**Could not fully confirm (treated as open):**
- **Stripe:**
  - Whether Identity live use involves manual approval.
  - A possibly duplicated 0.25% line on the Connect pricing page.
  - The list of Identity test cases.
  - Whether the CLI forwards thin events (the docs disagree).
  - Whether Google Pay domain registration is mandatory.
  - Whether released authorizations carry fees.
- **Tremendous:** which catalog brands allow promotional use.
- **Checkr:** exact package prices (public listings are inconsistent) and an explicit gig-platform statement.
- **Twilio:** 10DLC approval timelines (support articles only; plan for about 2 weeks).
- **iOS 26 Home Screen behavior** (secondary source only).
- **Better Auth:** whether the phone plugin can delegate code checks to Twilio Verify (to test in M0).
- **graphile-worker:** rollback semantics of `add_job` (true by design; proved by a test in M0).
- **Ably:** exact free-tier limits.
- **Texas:** sales-tax treatment of several categories and marketplace-provider status for services (**F6**); TxDMV exemptions (**F17**).

## Glossary

| Term | Meaning |
|---|---|
| Poster / helper | The person who needs help / the person doing the task (same account, different mode) |
| Task | What the poster needs. Offer: a helper's proposal for an open task. Invite: a poster's funded request to one helper |
| Booking | The agreement for one task (or one recurring visit) with versioned terms |
| Funded | The poster's payment for the booking has been captured |
| Transfer / payout | Platform → helper's Stripe balance / helper's Stripe balance → helper's bank |
| Bookable | Helper has passed ID verification, payout setup, and category eligibility |
| Grant | One reward instance for one helper |
