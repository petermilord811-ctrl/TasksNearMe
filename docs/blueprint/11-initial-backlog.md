# 11 — Initial build backlog

> Sizes: **S** = 0.5–1 day, **M** = 2–3 days, **L** = 4–6 days for one experienced engineer using AI coding assistance. Recalibrate after M0. Priority: **P0** = launch-blocking, **P1** = launch-desirable (may slip to the first post-launch release), **P2** = post-launch. Milestones (M0–M8) are defined in [10-build-plan-and-launch.md](10-build-plan-and-launch.md). Every item's definition of done includes tests (unit for domain code, integration for services) and audit logging for staff actions.

**Total:** about 68 items, roughly **150–210 engineering days before a 20% buffer**. That is about **18–20 weeks with 3 engineers** (the plan in 10), or **24–30 weeks with 2** (A1).

## E0 — Foundations (M0)

| ID | Item | Size | Pri | Depends | Acceptance criteria |
|---|---|---|---|---|---|
| B-001 | Repo scaffold: Next.js 16, TS strict, npm, ESLint with module-boundary rules, Vitest, Playwright, `.nvmrc` (done during setup: see `CLAUDE.md`) | S | P0 | — | `npm run check` runs typecheck, lint, and unit tests locally and in CI; a deliberate boundary violation fails lint |
| B-002 | `render.yaml`: web, worker, Postgres (PostGIS), env groups, staging, PR previews | M | P0 | B-001 | Opening a PR creates a preview with a seeded database; merging to `main` deploys staging |
| B-003 | DB platform: Drizzle config, migration pre-deploy step, PostGIS migration, `tx()`, advisory-lock helper | M | P0 | B-002 | Empty → latest migration passes in CI; schema drift check fails on mismatch |
| B-004 | Jobs and outbox: graphile-worker, `addJob(tx)`, outbox write and dispatch, crontab | M | P0 | B-003 | Integration test: a job enqueued in a rolled-back transaction never runs; a job with the same `job_key` is replaced |
| B-005 | Config: Zod env, versioned market policy loader, feature flags table | S | P0 | B-003 | Missing env var fails boot; booking code reads the policy by version |
| B-006 | Observability: Sentry, pino with PII redaction, request IDs, `/api/health`, uptime check | S | P0 | B-001 | Test error appears in Sentry; log redaction unit test covers email, phone, and address patterns |
| B-007 | UI shell: Tailwind, shadcn/ui, public, app (bottom nav), and admin layouts; message catalog | M | P0 | B-001 | Layouts pass axe checks at 360 px width; no hard-coded UI strings outside the catalog |
| B-008 | Webhook ingestion framework: verify → `webhook_events` (unique) → job; replay CLI | M | P0 | B-004 | The same event delivered 3 times is processed once; replay re-runs a failed event |
| B-009 | Seeds: Austin market (boundary, areas, `America/Chicago`, policy v1, categories, price guidance); dev fixtures (2 accounts) | S | P0 | B-003 | `npm run db:seed` is idempotent; a market config check passes |

## E1 — Accounts and helper onboarding (M1)

| ID | Item | Size | Pri | Depends | Acceptance criteria |
|---|---|---|---|---|---|
| B-010 | Better Auth: email one-time-code sign-in/sign-up, sessions, DB-backed rate limits, `trustedProxies` | M | P0 | B-003 | Sign-in on a phone works end to end; the 4th rapid attempt is rate-limited |
| B-011 | Phone verification via Twilio Verify | S | P0 | B-010 | Posting and offering require `phone_verified_at`; a wrong code 3 times locks for 10 min |
| B-012 | Account basics: profile, mode switch, 18+ attestation, agreement versions, notification preferences, data export request | M | P0 | B-010 | A new terms version forces re-acceptance; export produces JSON of the user's own data |
| B-013 | Staff roles, admin guard with TOTP, staff creation script, audit log writer | M | P0 | B-010 | A non-staff user gets 404 on `/admin`; every staff mutation writes `audit_log` |
| B-014 | Helper profile: handle, bio, services and rates, tools, service area (map radius), languages, portfolio | L | P0 | B-015 | A profile can't be published without at least one service and an area; the public preview hides restricted fields |
| B-015 | File pipeline: presigned upload, processing job (re-encode, strip metadata, thumbnails), signed GET, public publishing after moderation | M | P0 | B-004 | A test image with GPS EXIF comes out with no metadata; private file URLs expire in 5 min |
| B-016 | Stripe Identity: biometric notice and consent → hosted session → return → webhooks → status → badge | M | P0 | B-008, B-012 | Test-mode verified, failed, and canceled outcomes map to statuses; nothing but status is stored |
| B-017 | Stripe Connect onboarding on **Accounts v2**: recipient account (Express Dashboard; fees collector and losses collector = platform), v2 Account Link, return/refresh, thin-event handling, Express Dashboard login link | M | P0 | B-008 | Test helper reaches active `stripe_transfers`; requirements due show a resume banner; account settings verified as platform-liable |
| B-018 | Background checks (Checkr): invitation, webhooks, status, adverse-action hooks, category gating | L | P0* | B-008, D7, F9 | *P0 only if in-home categories launch (D7). Staging candidate reaches `clear`; a `consider` result blocks in-home categories and opens a trust & safety case |
| B-019 | Bookable status: compute, cache, gate offers and invites, "Finish setup" UI | S | P0 | B-016, B-017 | A helper missing any requirement cannot send offers (API returns 403 with the missing step) |
| B-020 | Public helper profile page (SEO, limited fields, badges) | S | P0 | B-014 | Page renders without sign-in; no last name, exact area, or contact details in the HTML |

## E2 — Tasks, privacy, and discovery (M2)

| ID | Item | Size | Pri | Depends | Acceptance criteria |
|---|---|---|---|---|---|
| B-021 | Locations: autocomplete, geocode, field encryption with key versions, deterministic public point, area naming | M | P0 | B-009 | Property tests: public point is 300–800 m from exact and inside the area; the same location always gives the same point; key rotation re-encrypts |
| B-022 | Posting wizard with category schemas and rules (lead time ≥ 3 h, ≤ 14 days, prohibited keywords; a price under the category minimum is noted, not refused, since 2026-11-21) | L | P0 | B-021, B-015 | Invalid tasks are rejected by both client and server; preview shows public vs private columns |
| B-023 | Public task pages, market and category SEO pages, public board, robots and sitemap | M | P0 | B-022 | Public pages contain no photos, addresses, or contact details; Lighthouse SEO ≥ 95 |
| B-024 | Helper feed: list and map, filters, distance bands from the public point, PostGIS queries with indexes | M | P0 | B-022 | p95 < 300 ms with 5k open tasks; distance shown only as a band |
| B-025 | Task alerts to matching helpers (category, area, preferences), rate-limited | S | P0 | B-028 | A helper gets at most N alerts per hour; no alerts outside their area |
| B-026 | Address privacy test suite (API responses, HTML, notifications, logs) for every role | M | P0 | B-022, B-035 | CI fails if an address string appears in any unauthorized response or log |
| B-027 | AI task drafting (flagged): endpoint, schema, prompt v1, UI, logging, limits, kill switch; 30-example eval set | M | P1 | B-022 | Eval: ≥ 90% of drafts keep every user-stated fact and add no invented one; refusals and errors fall back to the manual form |
| B-028 | Notifications core: in-app inbox, Postmark email, web push, critical SMS, preferences, delivery tracking | L | P0 | B-004 | Each event type routes per preferences; failed deliveries retry and are visible to support |

## E3 — Offers, invites, booking, and funding (M3)

| ID | Item | Size | Pri | Depends | Acceptance criteria |
|---|---|---|---|---|---|
| B-029 | Offers: create, revise, withdraw, decline, expire, stale; limits; offer thread | M | P0 | B-019, B-022 | One active offer per helper per task (DB constraint); material task edit marks offers stale |
| B-030 | Messaging: threads, attachments, contact masking before confirmation, Ably token endpoint and user channels, unread counts, flagging | L | P0 | B-015, B-028 | Phone/email patterns masked pre-booking (test corpus); messages arrive in < 2 s; a non-participant gets 404 |
| B-031 | Fee engine (domain): fixed, hourly cap, allowance, minimum fee, rounding | S | P0 | B-005 | Table tests include the $60 example (charge $66.00, earnings $54.00) and the edge cases in 04 §3 |
| B-032 | Confirmation screen (both sides' breakdown, policy summary) and Payment Element (cards, Apple Pay, Google Pay) | M | P0 | B-031 | Breakdown equals the fee engine output; Apple Pay works on the staging domain |
| B-033 | Accept offer → `pending_funding` → PaymentIntent (separate charges and transfers, `transfer_group`) → `confirmFunding` via refresh and webhook → `confirmed`; TTL expiry | L | P0 | B-031, B-032, B-008 | Double-tap or concurrent accepts create one booking and one charge; webhook-before-refresh and refresh-before-webhook both converge |
| B-034 | Direct invites with manual-capture authorization (accept/decline/counter/expire/cancel), availability posts with slot holds, Book again entry points; neighborhood days (2026-11-24, 02 J3 step 5: a helper's visits on one date in one neighborhood, each an ordinary slot, an optional lower neighbor price, for tasks in that neighborhood) | L | P0 | B-033 | Declined or expired invites release the authorization (verified in test mode); counter with a higher total re-authorizes |
| B-035 | Booking hub: timeline, terms versions, audited address accessor, state-based actions, `.ics`, reminder jobs | M | P0 | B-033 | Address visible to the helper only in allowed states (03 invariant 4); every read logged |
| B-036 | Ledger v1, daily reconciliation against provider balance transactions, exceptions queue; **platform payout job** (manual schedule) that only pays out the balance above helper obligations plus a buffer | M | P0 | B-033 | Every funding and refund creates a balanced journal; reconciliation flags an injected mismatch; payout job never lets the available balance drop below obligations |

## E4 — Completion, money movement, cancellations, and changes (M4)

| ID | Item | Size | Pri | Depends | Acceptance criteria |
|---|---|---|---|---|---|
| B-037 | Check-in and status quick actions (On my way, Running late, Arrived) | S | P0 | B-035 | Updates appear in the thread and as push to the poster |
| B-038 | Completion with category evidence rules, expenses with receipts, approve, report a problem, auto-approve job, reminders | M | P0 | B-035 | Auto-approve fires at the deadline using a fake clock, and does nothing if the state changed |
| B-039 | Transfers (earnings and reimbursement separately, `source_transaction`, unique per kind, holds); refunds of unused cap or allowance; payouts mirror; payout failure handling | L | P0 | B-038, B-036 | Replayed approvals or webhooks never create a second transfer; a payout failure shows "Action needed" |
| B-040 | Cancellation policy engine: preview and execution (poster early/late, helper, support), late-fee compensation transfer, strikes | M | P0 | B-039 | Every row in 04 §6 matches the engine's output to the cent |
| B-041 | No-show flows: helper no-show report; poster unavailable with response timer | M | P0 | B-040 | Timers use the market time zone; contested no-shows open cases |
| B-042 | Change requests (price, scope, schedule, cap, allowance, settlement) with on-session funding of increases and refunds of decreases; terms versions | L | P0 | B-039 | Both must accept; the old terms stay until the change is funded; the fee recalculation matches the engine |
| B-043 | Hourly bookings with funded cap end to end, including cap-increase requests | M | P0 | B-042 | Hours above the cap cannot be submitted without an accepted increase |
| B-044 | Chargebacks: dispute webhooks, holds, evidence pack (timeline, messages, photos, approvals) | M | P1 | B-039 | Test dispute card creates a chargeback, holds unpaid earnings, and finance can download the evidence pack |
| B-045 | Earnings page (earnings vs reimbursements, rewards elsewhere) and poster receipts | M | P0 | B-039 | Amounts reconcile with the ledger for the test accounts |

## E5 — Reviews, repeat business, and rewards (M5)

| ID | Item | Size | Pri | Depends | Acceptance criteria |
|---|---|---|---|---|---|
| B-046 | Reviews: double-blind, 14-day publication job, tags, reporting, profile aggregation | M | P0 | B-038 | Neither review is visible until both are submitted or 14 days pass; rewards code has no import path to reviews (lint rule) |
| B-047 | Saved helpers, Book again, My clients, and helper rebook proposals | M | P0 | B-034 | Book again creates a funded invite pre-filled from the last booking |
| B-048 | Rewards engine core: versioned program rules, grant machine, budget reservation under lock, holds, expiry, voiding on events, one-booking-level-reward rule | L | P0 | B-039 | Concurrency test: 50 parallel qualifications never exceed the budget; voiding on refund or cancellation works for each state |
| B-049 | Programs: welcome (cohort cap), repeat (3rd paid booking with the same poster in 90 days); acceptance and completion built but off | M | P0 | B-048 | Table-driven tests for every rule in 05 §1–§2, including caps, thresholds, and stacking |
| B-050 | Risk signals (card and bank fingerprints, device, IP, address proximity, account age) and risk score → review queue | M | P0 | B-048 | A self-dealing test pair (same device or card) lands in `in_review`, not `redeemable` |
| B-051 | Tremendous redemption: order with `external_id`, LINK delivery in-app plus email fallback, webhooks, reissue; yearly per-recipient totals report | M | P0 | B-048 | Retrying a redemption never creates a second order (sandbox); a delivery failure moves the grant to `failed`, then reissue works |

## E6 — Admin and support workspace (M6)

| ID | Item | Size | Pri | Depends | Acceptance criteria |
|---|---|---|---|---|---|
| B-052 | Admin shell and queues (disputes, reports, no-shows, flagged rewards, failed transfers, aging funds > 21 days) | M | P0 | B-013 | Each queue links to the record and shows its SLA |
| B-053 | User and booking views: timelines, ledger, restricted-data access with reason prompts, read-only "view as" | M | P0 | B-052 | Opening an address or message requires a reason and writes an audit entry |
| B-054 | Case management: reports and disputes → cases, assignment, SLAs, participant messaging, internal notes, resolution actions wired to payments | L | P0 | B-052, B-040 | A "settle at $45" resolution produces the refund and transfer from 02 §3 |
| B-055 | Refund and reversal tools with role limits and dual approval; goodwill refunds | M | P0 | B-054 | An agent refunding $150 triggers approval; finance reversal needs a case link |
| B-056 | Moderation: hide tasks, photos, profiles, reviews; warnings; suspensions and bans (second reviewer); strike management | M | P0 | B-052 | A suspended helper's offers are withdrawn and future bookings flagged for support |
| B-057 | Reward admin: review queue, void, reissue, reinstate, budget dashboard | S | P0 | B-048 | All actions audited; budget dashboard matches the ledger |
| B-058 | Config admin: market policies (draft → publish versions), fee schedules, categories, flags | M | P1 | B-005 | Publishing v2 does not change existing bookings (they keep v1) |
| B-059 | User-facing report and block buttons on profiles, tasks, messages, reviews | S | P0 | B-054 | A report creates a case with the target's context attached |

## E7 — Hardening, activation, beta, launch (M7–M8)

| ID | Item | Size | Pri | Depends | Acceptance criteria |
|---|---|---|---|---|---|
| B-060 | Two-account E2E suite covering every scenario in 10 §3 | L | P0 | E3–E6 | Green on staging three days in a row |
| B-061 | Security review: authorization tests, CSP, rate limits, Turnstile, dependency audit, secret scan, external light pen test | M | P0 | E6 | No high or critical findings open |
| B-062 | Accessibility audit and fixes (WCAG 2.2 AA) | M | P0 | E3 | Core journeys pass with a screen reader and keyboard only |
| B-063 | Performance: public page budgets, image sizes, DB indexes, k6 load test at 10× beta volume | S | P0 | E3 | Targets in 07 §6 met |
| B-064 | Legal content and consent flows: terms, privacy, helper agreement, rewards terms, biometric consent, background-check disclosure, cancellation policy | M | P0 | Counsel | Counsel sign-off recorded; versions stored in `agreements` |
| B-065 | **Live provider activation (start week 1, long lead times)**: Stripe live (Connect platform profile, Identity, Apple Pay domain, statement descriptor, Radar rules), Tremendous funding, Checkr credentialing, Twilio A2P 10DLC or toll-free, Postmark approval, Google Maps billing | M | P0 | — | Checklist in 10 §4 complete |
| B-066 | Runbooks and on-call: payments incident, webhook backlog, dispute handling, reward fraud review, safety escalation | S | P0 | E6 | Tabletop exercise done for a payments outage |
| B-067 | Analytics: funnel (post → offer → book → complete → rebook), liquidity dashboard, reward spend dashboard | S | P0 | E5 | Metrics in 01 §9 visible daily |
| B-068 | Private beta tooling: invite codes, cohort flags, in-app feedback | S | P0 | E1 | Beta users can be enabled per market and role |

## Post-launch backlog (not in the estimate)

| Phase | Items |
|---|---|
| Phase 2 | Recurring visits (03 §7) and the recurring-month repeat reward; automated replacement matching; errands with vehicle policy; tips; instant payouts; scheduled funding for bookings more than 14 days out; Spanish UI; multi-helper bookings; risk-triggered poster ID checks |
| Phase 3 | Masked calls (Twilio Programmable Voice; Proxy is closed to new customers); native apps; second market; fraud scoring model; helper skill checks |

**If the timeline must shrink with 2 engineers**, cut in this order: B-027 (AI drafting), the availability-post part of B-034, B-044 (handle chargebacks manually in the Stripe Dashboard), B-058 (edit config via seeds), and hourly pricing except for moving (part of B-043). Do **not** cut B-026 (address privacy), B-036 (ledger and reconciliation), B-048–B-050 (reward integrity), or B-060 (E2E).
