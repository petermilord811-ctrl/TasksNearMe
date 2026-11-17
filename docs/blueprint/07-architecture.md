# 07 — Technical architecture and repository structure

## 1. Shape: one application, clear modules

**D1.** TasksNearMe is a **modular monolith**: one TypeScript repository, one Next.js application that serves pages, the JSON API, and webhooks, plus **one background worker process built from the same codebase**, sharing **one PostgreSQL database**.

Why not services: the riskiest flows (charge → confirm → transfer → reward) need atomic database transactions across bookings, payments, and rewards. A two-person team should not run distributed transactions, a service mesh, or several deploy pipelines. Modules get explicit boundaries now, so a later split (for example, a dedicated notifications worker) is a refactor rather than a rewrite.

When to reconsider: separate worker queues once job volume competes with webhooks; a search service once Postgres full-text and PostGIS queries get slow; native apps, which reuse `/api/v1`.

## 2. Recommended stack (one concrete choice per concern)

| Concern | Choice | Why | Notes and alternatives |
|---|---|---|---|
| Language and runtime | TypeScript (strict), **Node.js 26 LTS** (24+ supported), npm | One language across UI, API, jobs, and tests; works natively on Windows dev machines | Pin in `.nvmrc`. npm instead of pnpm, because Node 25+ no longer bundles corepack and npm is already installed |
| Web framework | **Next.js 16** (App Router, React Server Components, Server Actions, Route Handlers) | Mobile-first server-rendered pages, SEO for public pages, one deployable | In v16 `middleware.ts` became **`proxy.ts`**. Caching is opt-in (Cache Components / `"use cache"`): use it only for public SEO pages. Cached entries stay in each web instance's memory, and tag invalidations are shared through Postgres (`cache-handlers/shared-tags.mjs`), so an `updateTag` on one instance reaches the other before it serves. Pin a patched release; Next.js now ships monthly security releases |
| UI | Tailwind CSS + shadcn/ui (Radix primitives), installable PWA | Accessible primitives, fast iteration, works on small screens | Target WCAG 2.2 AA (**F14**) |
| Validation | Zod schemas shared by forms, Server Actions, and API | One source of truth for input rules | React Hook Form on the client |
| Database | **PostgreSQL 16+ with PostGIS** (Render Postgres, Pro plan) | Relational integrity for money; PostGIS for service areas and distance | Render supports PostGIS via `CREATE EXTENSION`; point-in-time recovery is 7 days on Pro |
| ORM and migrations | **Drizzle ORM + drizzle-kit** (generated SQL files, reviewed and committed) | SQL-first, explicit transactions and row locks, typed | Native `geometry` columns (SRID 4326); geography distance via `sql` (`::geography`, `ST_DWithin`). Enable PostGIS in a custom migration |
| Authentication | **Better Auth** (email one-time codes, Google and Microsoft sign-in, phone verification, admin roles, TOTP 2FA for staff, DB-backed rate limiting) | Users live in our Postgres; maintained library (Auth.js joined Better Auth in 2025) | Phone codes via **Twilio Verify**. Confirm in M0 that Better Auth's phone flow can delegate code checking to Verify; otherwise use a small custom endpoint. Set `trustedProxies` for Cloudflare; disable impersonation in production |
| Authorization | App-level policy functions per module (`policies.ts`) plus scoped query helpers | Explicit, testable, works with connection pooling | Access matrix in [08-data-model-and-access.md](08-data-model-and-access.md) |
| Background jobs and timers | **graphile-worker** on the same Postgres | Jobs are enqueued **in the same transaction** as the state change; `job_key` for timers; crontab for periodic jobs | Cron is UTC. Prove the rollback behavior with an integration test in M0. Alternative: pg-boss |
| File storage | **Cloudflare R2** (S3 API): private bucket plus a public bucket for moderated images | No egress fees; presigned uploads | Images processed in the worker with `sharp` (re-encode, strip metadata, resize) |
| Realtime | **Server-sent events from our own servers over Postgres LISTEN/NOTIFY** (changed 2026-11-14 from Ably, completion plan 7.1): each signed-in stream gets only `user:{id}`, boards get a public `market:{id}` stream; one LISTEN connection per server fanned out in memory | No provider account or per-message cost, and it works today on one region; the outbox dispatcher (claims, 5.18) publishes after commit, woken by an insert trigger | Messages are stored in Postgres first; notices carry ids only and the page reads the rest with the usual permissions. Ably stays the option if we run in several regions |
| Email | **Postmark** (transactional stream) + React Email templates | Deliverability; manual account approval (< 24 h) | Separate broadcast stream later for marketing |
| SMS and OTP | **Twilio Verify** (OTP) + Twilio Messaging (critical alerts) | Verify needs no A2P 10DLC registration of our own | Alerts need A2P 10DLC or toll-free verification: **plan about 2 weeks** (**F11**) |
| Web push | Web Push API + VAPID (`web-push`) | No app store needed | iOS delivers push only to Home Screen web apps (16.4+); prompt users to install |
| Payments | **Stripe**: Payment Element (cards, Apple Pay, Google Pay); helpers' connected accounts created with **Accounts v2** (Express Dashboard; platform collects fees and is liable for losses); **separate charges and transfers** | See [04-payments-and-fees.md](04-payments-and-fees.md) | The platform account's payouts are **manual**, run by our job, so helper funds stay in the balance |
| Identity verification | **Stripe Identity** (hosted document + selfie) | Same vendor and webhook pipeline as payments | See [06-verification-trust-compliance.md](06-verification-trust-compliance.md) |
| Background checks | **Checkr** (invitation flow; the candidate enters details on Checkr's page) | Sensitive data stays with Checkr; adverse-action tooling | Needs account credentialing before staging access (**F9**) |
| Gift cards | **Tremendous** API | Idempotent orders via `external_id`; no fee on bank-funded gift cards; fraud review tools | Sandbox: Testflight. Webhooks signed with HMAC-SHA256 |
| Maps and addresses | **Mapbox** Geocoding API v6 (address suggestions; the chosen address is confirmed again on "Post"); map tiles from OpenFreeMap through MapLibre | Free up to 100,000 searches a month; known address points only | Temporary results: coordinates never stored or shown (Mapbox terms). Changed 2026-11-12 from Google Maps Platform (needs a billing account). Alternative: Google Places |
| AI drafting | Anthropic Claude API (`@anthropic-ai/sdk`) | Structured outputs; see §8 | Behind a feature flag |
| Observability | Sentry (errors, tracing), pino structured logs, uptime checks, PostHog (product analytics) | Small-team friendly | Replay is off on sensitive pages; logs redact PII |
| Edge and abuse | Cloudflare DNS, TLS, WAF, rate-limit rules, Turnstile on sign-up, post, and offer forms | Cheap protection | — |
| Hosting | **Render**: web service (2 instances), background worker (1), Postgres (Pro), preview environments | One vendor for web, worker, and database; a long-running worker suits graphile-worker | Defined in `render.yaml`. Preview environments need a Pro workspace |
| CI/CD | GitHub Actions → Render auto-deploy; migrations run as a pre-deploy step | — | — |

**Why Render over Vercel:** the design depends on a long-running worker with transactional job enqueueing. With Vercel the team would add Neon and a hosted job runner (for example, Inngest) plus an outbox relay, which means three vendors and one more failure mode. Vercel remains a reasonable alternative; the module code would not change, only `src/worker.ts` and the outbox dispatcher.

## 3. Modules

| Module | Owns (tables) | Responsibilities | Emits | Reacts to |
|---|---|---|---|---|
| `accounts` | users, auth tables, staff_roles, agreements, blocks | Sign-in, sessions, modes, staff roles, agreement versions | `user.*` | — |
| `profiles` | helper_profiles, helper_services, portfolio_items, saved_helpers | Helper profile, services, area, stats | `helper.profile_*` | `booking.completed`, `review.published` (stats) |
| `verification` | identity_verifications, eligibility_checks | ID verification, background checks, bookable status | `helper.bookable_changed` | Stripe Identity and Checkr events, `payouts.account_updated` |
| `markets` | markets, market_policies, categories, market_categories, areas, feature_flags | Market config, policy versions, price guidance | `market.policy_published` | — |
| `tasks` | tasks, task_locations, task_photos, ai_generations | Posting, address privacy, public views, AI drafts | `task.*` | `booking.confirmed` / `canceled` / `completed` |
| `offers` | offers, offer_revisions, invites, availability_posts | Offers, invites, slots | `offer.*`, `invite.*` | `task.updated`, `payment.*` (invites) |
| `bookings` | bookings, booking_terms, booking_change_requests, booking_events, completion_submissions, expense_items, booking_series, strikes | Booking lifecycle, changes, cancellations, completion, timers | `booking.*` | `payment.succeeded` / `failed`, `case.resolved` |
| `payments` | stripe_customers, payout_accounts, payments, refunds, transfers, transfer_reversals, payouts, chargebacks, ledger_accounts, ledger_entries | Fees, Stripe calls, refunds, transfers, payouts mirror, ledger, reconciliation | `payment.*`, `transfer.*`, `payouts.*`, `chargeback.*` | `booking.*`, `case.resolved` |
| `rewards` | reward_programs, reward_grants, reward_redemptions, risk_signals | Rules, grants, holds, budget, redemption, risk | `reward.*` | `booking.*`, `transfer.created`, `refund.*`, `chargeback.*` |
| `messaging` | threads, thread_participants, messages | Threads, masking, attachments, realtime notices | `message.created` | `offer.created`, `booking.confirmed` |
| `notifications` | notifications, notification_deliveries, notification_preferences, push_subscriptions | Templates, channels, preferences, delivery tracking | — | Almost everything |
| `reviews` | reviews | Double-blind reviews, publication | `review.published` | `booking.completed` |
| `support` | cases, case_events, reports, moderation_actions | Cases, disputes, reports, moderation, strikes policy | `case.*` | `booking.disputed`, reports |
| `admin` | — (composes other modules) | Staff UI, queues, audited actions | — | — |
| `platform` | outbox_events, webhook_events, idempotency_keys, audit_log, files | DB, outbox, jobs, idempotency, audit, files, config, money, geo, crypto | — | — |

**Boundary rules** (enforced in CI with `eslint-plugin-boundaries` or dependency-cruiser):
1. `src/app/**` imports only from `modules/*/index.ts`, `modules/*/ui`, `components/`, and `platform/auth`.
2. A module imports other modules **only through their `index.ts`**. It changes another module's data only by calling that module's service or reacting to its events, never by writing its tables.
3. `integrations/*` imports only `platform/*`. Integrations contain no business rules. Modules call them through small interfaces so tests can use fakes.
4. `domain/` code is pure: no database, network, clock, or randomness. Time comes from an injected clock.

## 4. Repository tree

```
tasksnearme/
├── .github/workflows/
│   ├── ci.yml                      # typecheck, lint (incl. boundaries), unit, integration, migration drift check
│   └── e2e.yml                     # Playwright against the PR preview environment (Stripe test mode)
├── docs/
│   ├── blueprint/                  # this blueprint
│   ├── adr/                        # 0001-modular-monolith.md, 0002-stripe-separate-charges.md, …
│   └── runbooks/                   # payments-incident.md, dispute-handling.md, reward-review.md, on-call.md
├── db/
│   ├── migrations/                 # drizzle-kit SQL, committed + reviewed (0000_init.sql, 0001_postgis.sql, …)
│   ├── seeds/
│   │   ├── markets/austin-tx.ts    # boundary, areas, time zone, policy v1, fee schedule, price guidance
│   │   ├── categories.ts
│   │   └── dev-fixtures.ts         # poster + helper test accounts, sample tasks (dev/preview only)
│   └── README.md                   # expand → migrate → contract rules; no destructive change in one deploy
├── public/                         # icons, static images
├── scripts/                        # dev-stripe-listen.sh, reconcile-payments.ts, create-staff-user.ts
├── src/
│   ├── app/                        # ROUTES ONLY — thin pages/layouts/handlers that call module services
│   │   ├── (public)/
│   │   │   ├── page.tsx
│   │   │   ├── [market]/page.tsx
│   │   │   ├── [market]/[category]/page.tsx
│   │   │   ├── [market]/tasks/page.tsx
│   │   │   ├── tasks/[taskSlug]/page.tsx
│   │   │   ├── helpers/[handle]/page.tsx
│   │   │   ├── how-it-works/  become-a-helper/  pricing/  trust-and-safety/
│   │   │   ├── help/[[...slug]]/page.tsx
│   │   │   ├── legal/[doc]/page.tsx
│   │   │   ├── sign-in/page.tsx
│   │   │   └── waitlist/page.tsx
│   │   ├── (app)/app/
│   │   │   ├── layout.tsx          # session guard, mode switch, bottom nav
│   │   │   ├── page.tsx
│   │   │   ├── tasks/              # page.tsx, new/, [taskId]/, [taskId]/offers/[offerId]/
│   │   │   ├── find-work/  offers/  availability/  helpers/  saved/  clients/
│   │   │   ├── bookings/           # page.tsx, [bookingId]/ (page, complete/, problem/, review/, changes/[changeId]/)
│   │   │   ├── messages/           # page.tsx, [threadId]/
│   │   │   ├── payments/  earnings/  rewards/  support/  account/
│   │   │   ├── series/[seriesId]/  # phase 2
│   │   │   └── helper/             # onboarding/[step]/, profile/
│   │   ├── admin/
│   │   │   ├── layout.tsx          # staff guard + TOTP + audit context
│   │   │   ├── page.tsx            # queues
│   │   │   └── users/  tasks/  bookings/  cases/  reports/  payments/  rewards/  config/  audit/  staff/
│   │   ├── api/
│   │   │   ├── auth/[...all]/route.ts       # Better Auth handler
│   │   │   ├── v1/**/route.ts               # JSON API (09) for client components and future native apps
│   │   │   ├── webhooks/
│   │   │   │   ├── stripe/route.ts          # platform-account events (v1 snapshot)
│   │   │   │   ├── stripe-connect/route.ts  # connected-account v1 events (payouts)
│   │   │   │   ├── stripe-v2/route.ts       # thin events from an event destination (Accounts v2)
│   │   │   │   ├── tremendous/route.ts
│   │   │   │   ├── checkr/route.ts
│   │   │   │   ├── twilio/route.ts
│   │   │   │   └── postmark/route.ts
│   │   │   └── health/route.ts
│   │   ├── layout.tsx  globals.css  manifest.ts  robots.ts  sitemap.ts  error.tsx  not-found.tsx
│   ├── modules/                    # DOMAIN — every module has the same internal layout:
│   │   ├── bookings/
│   │   │   ├── index.ts            # public API: services, types, event names
│   │   │   ├── schema.ts           # Drizzle tables owned by this module
│   │   │   ├── domain/             # pure logic + co-located unit tests
│   │   │   │   ├── booking-machine.ts         booking-machine.test.ts
│   │   │   │   ├── cancellation-policy.ts     cancellation-policy.test.ts
│   │   │   │   └── terms.ts                   terms.test.ts
│   │   │   ├── service/            # use cases: one transaction each, writes outbox events
│   │   │   │   ├── accept-offer.ts  confirm-funding.ts  propose-change.ts  cancel.ts
│   │   │   │   ├── check-in.ts  submit-completion.ts  approve.ts  report-problem.ts
│   │   │   ├── queries/            # read models for pages (booking hub, lists)
│   │   │   ├── jobs/               # auto-approve.ts, reminders.ts, no-show-window.ts
│   │   │   ├── policies.ts         # authorization rules
│   │   │   ├── events.ts
│   │   │   └── ui/                 # module-specific components
│   │   ├── accounts/  profiles/  verification/  markets/  tasks/  offers/
│   │   ├── payments/               # domain/fees.ts, domain/ledger.ts, service/create-transfer.ts, jobs/reconcile.ts …
│   │   ├── rewards/                # domain/rules/{welcome,acceptance,repeat,completion}.ts, domain/risk.ts …
│   │   └── messaging/  notifications/  reviews/  support/  admin/
│   ├── integrations/               # PROVIDER ADAPTERS — typed clients, webhook parsing, fakes; no business rules
│   │   ├── stripe/                 # client, payment-intents, transfers, refunds, connect-accounts, identity, webhooks, fakes
│   │   ├── tremendous/  checkr/  twilio/  postmark/  ably/  webpush/  r2/  google-maps/  anthropic/
│   ├── platform/                   # SHARED INFRASTRUCTURE
│   │   ├── db/                     # client, tx(), advisory locks, schema index for drizzle-kit
│   │   ├── outbox/                 # writeEvent(tx, …), dispatcher job
│   │   ├── jobs/                   # task registry, crontab, addJob(tx, …)
│   │   ├── idempotency/            # request keys (HTTP), provider key builders
│   │   ├── money/                  # integer cents, basis-point fee math, rounding rules
│   │   ├── geo/                    # deterministic fuzzing, distance bands
│   │   ├── crypto/                 # field encryption (AES-256-GCM, key versions)
│   │   ├── config/                 # env.ts (zod), flags.ts, market-policy.ts
│   │   ├── storage/                # files table, presign, processing pipeline
│   │   └── audit/  auth/  rate-limit/  logging/  errors/  time/
│   ├── components/                 # shared UI: ui/ (shadcn), forms/, money/, layout/, maps/
│   ├── emails/                     # React Email templates
│   ├── proxy.ts                    # Next 16 proxy: auth redirects, security headers, market detection
│   ├── instrumentation.ts          # Sentry / OpenTelemetry init
│   └── worker.ts                   # graphile-worker entry point (separate Render service)
├── tests/
│   ├── e2e/                        # Playwright: two browser contexts = two accounts
│   │   ├── desk-assembly-happy-path.spec.ts   payment-failures.spec.ts   cancellations.spec.ts
│   │   ├── no-shows.spec.ts   disputes.spec.ts   address-privacy.spec.ts   rewards.spec.ts   admin.spec.ts
│   ├── integration/                # services against real Postgres + provider fakes
│   │   ├── bookings/  payments/  rewards/  webhooks/  access-control/
│   ├── fixtures/                   # recorded provider payloads: stripe/, tremendous/, checkr/
│   └── support/                    # factories, db reset, fake clock, fake providers, sign-in helpers
├── .env.example  .nvmrc  drizzle.config.ts  next.config.ts  package.json  package-lock.json
├── playwright.config.ts  vitest.config.ts  tsconfig.json  eslint.config.mjs
└── render.yaml                     # Render Blueprint: web, worker, Postgres, env groups, previews
```

### Where things belong

| Thing | Location | Rule |
|---|---|---|
| Pages and layouts | `src/app/(public)`, `src/app/(app)/app`, `src/app/admin` | Fetch with module `queries/`, mutate with Server Actions that call module services. No SQL or provider calls |
| JSON API | `src/app/api/v1/**/route.ts` | Thin: authenticate → validate (Zod) → call service → map errors. Same services as Server Actions |
| Webhooks | `src/app/api/webhooks/<provider>/route.ts` | Verify signature → insert into `webhook_events` (unique per provider event ID) → enqueue a job → return 2xx fast. No business logic |
| Domain logic | `src/modules/<m>/domain` | Pure functions: state machines, fee math, cancellation policy, reward rules, risk scoring |
| Use cases | `src/modules/<m>/service` | One database transaction per use case; enqueue outbox events and jobs inside it |
| Provider code | `src/integrations/<provider>` | Typed wrappers, idempotency keys, webhook parsing, test fakes |
| Background jobs | `src/modules/<m>/jobs`, registered in `src/platform/jobs` | Idempotent; re-check state before acting |
| Database schema | `src/modules/<m>/schema.ts` | Each table has exactly one owning module |
| Migrations | `db/migrations/*.sql` | Generated by drizzle-kit, reviewed, never edited after merge. Expand → migrate → contract |
| Seeds and market config | `db/seeds/` | Austin is seed data; a new market is a new seed plus admin config |
| Unit tests | Next to the code (`*.test.ts`) | Required for every `domain/` file |
| Integration tests | `tests/integration/` | Real Postgres + PostGIS (CI service container), provider fakes |
| End-to-end tests | `tests/e2e/` | Preview environment with provider sandboxes |

## 5. Request and event flow (example: accepting an offer)

1. **Server Action** `acceptOffer(offerId, idempotencyKey)` → `bookings.service.acceptOffer`.
2. **Transaction 1:** lock the task row (`SELECT … FOR UPDATE`); check that the offer is `pending` and the task is `open`; create a booking (`pending_funding`), terms v1, and a `payments` row (`requires_confirmation`, deterministic idempotency key); write an outbox event; commit.
3. **Provider call** (outside the transaction): create the PaymentIntent with the stored idempotency key; save its ID; return the client secret.
4. **Client** confirms the payment with the Payment Element (including 3-D Secure), then calls `POST /api/v1/bookings/:id/refresh`.
5. **Funding confirmation** runs the same idempotent `confirmFunding(paymentId)` from either the refresh call or the `payment_intent.succeeded` webhook job, whichever arrives first. Transaction 2: payment `succeeded`; booking `confirmed`; offer `accepted`; other offers declined; task `assigned`; address access granted; ledger entries; reminder jobs enqueued (the auto-approve timer is set later, when completion is submitted); outbox events (`booking.confirmed`) → notifications, rewards (create `pending` grants), messaging (open the booking thread).
6. The outbox dispatcher (woken at once by an insert trigger) publishes realtime notices to each participant's `user:{id}` channel after commit, as `pg_notify` through each server's one LISTEN connection to the participants' server-sent event streams.

## 6. Cross-cutting design

- **Transactions and outbox.** Every state change and its events and jobs commit together. Dispatchers are at-least-once; every consumer is idempotent (see [09-apis-events-idempotency.md](09-apis-events-idempotency.md)).
- **Concurrency.** Row locks on the aggregate being changed (task, booking, reward program budget), a `version` column for optimistic checks on bookings, and `pg_advisory_xact_lock` per booking around money operations.
- **Time.** Store `timestamptz` in UTC. Policy windows are computed in the market time zone (`America/Chicago`) and displayed there. An injectable clock lets tests time-travel.
- **Policy snapshots.** A booking stores the `market_policy_id` and fee schedule it was confirmed under. Config changes never re-price existing bookings.
- **Money.** Integer cents (`bigint`). Fees are in basis points, rounded half-up to the cent once per line. Totals are computed from lines, never the reverse. A balanced double-entry ledger mirrors every provider movement.
- **Feature flags.** In Postgres (`feature_flags`, per market) for business switches (`ai_drafting`, `reward.acceptance`, `recurring`). PostHog flags only for UI experiments.
- **Security.** Strict CSP; HttpOnly, Secure, SameSite=Lax cookies; Server Actions' built-in origin checks; Turnstile on abuse-prone forms; DB-backed rate limits; secrets only in Render env groups; least-privilege restricted Stripe keys for the worker; dependency scanning in CI.
- **Privacy** (D14).
  - Data classes are `public`, `private` (participants only), `restricted` (exact address, phone, email, messages: staff access is logged with a reason), and `provider-held` (ID documents, selfies, SSN/TIN, bank details, background reports — never stored by us).
  - Exact address and access notes use field-level AES-256-GCM with versioned keys.
  - The public point is derived **deterministically per saved address** (HMAC of the address ID → an offset of 300–800 m, kept inside the area polygon), so posting many tasks from one address cannot be averaged to reveal it.
  - Distances shown to helpers are bands computed from the public point.
  - Images are re-encoded to strip metadata.
  - Private files are served by 5-minute signed URLs.
  - Logs and analytics redact PII.
- **Accessibility and performance.** WCAG 2.2 AA. Public pages target LCP under 2.5 s on a mid-range Android phone over 4G. JS budget per route.
- **Internationalization readiness.** All UI strings go through a message catalog from day one (English only), so Spanish (phase 2) is a translation task, not a refactor.

## 7. Environments

| Environment | Purpose | Providers |
|---|---|---|
| Local | Development | Docker Postgres + PostGIS; Stripe test mode with `stripe listen` forwarding; fakes for Tremendous, Checkr, Twilio, Postmark (or the Postmark test token) |
| Preview (per PR) | Review and E2E | Render preview environment with an empty database plus seeds; Stripe test mode; Tremendous Testflight; Checkr staging; Twilio test credentials |
| Staging | Release candidate, long-running sandbox data | Same sandboxes; scheduled reconciliation runs |
| Production | Live | Live accounts (see the activation checklist in [10-build-plan-and-launch.md](10-build-plan-and-launch.md)) |

## 8. AI-assisted task drafting (D10, behind a flag)

- **Flow:** the poster types a one-liner plus the category → `POST /api/v1/ai/task-draft` → the server calls Claude → returns a **structured draft**: title, scope bullets, category-specific fields, open questions for the poster, a duration range, and flags (possibly prohibited, needs a licensed trade, safety concern). The poster edits and accepts. Nothing is posted automatically.
- **Model and API:** official TypeScript SDK `@anthropic-ai/sdk`, model **`claude-opus-5-5`**. Use `output_config.effort: "low"`; this short extraction task doesn't need more, and the model's default is `medium`. Thinking cannot be disabled on this model, so effort is the control. Structured outputs come from `client.messages.parse()` with a JSON schema in `output_config.format`, validated again with Zod.
- **Refusals:** enable server-side refusal fallbacks (`fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta) and check `stop_reason` for `"refusal"` before reading content. Don't send `temperature` or an assistant prefill; both are rejected on current models. Set `max_tokens` to about 8,000 so adaptive thinking has headroom.
- **Never sent to the model:** names, phone numbers, email addresses, exact addresses, or photos at launch. Price is never generated by the model; the UI shows price guidance from market config and booking data instead.
- **Cost (list prices cached 2026-11-03: $4 input / $20 output per million tokens):** about 2k input + ~1k output tokens ≈ **$0.03 per draft at most**, so 3,000 drafts/month is under $100. If you later want to cut that, evaluating `claude-haiku-5-5` ($0.10 / $0.50) against a small eval set is your call to make.
- **Controls:** 5 drafts per user per hour; prompt version recorded in `ai_generations` with token counts and whether the draft was accepted; moderation of output before display; a kill switch in the feature flag.
