# 10 — Build plan, testing, and launch criteria

## 1. Team and timeline assumptions (A1)

- **Team:** 3 engineers (all full-stack; one owns payments and rewards), 1 part-time product designer (heavy in weeks 0–8), and a founder/PM who also runs beta operations and support.
- **Estimate:** about 150–210 engineering days plus a 20% buffer ([11-initial-backlog.md](11-initial-backlog.md)). That is **about 18–20 weeks to public launch with 3 engineers**, or 24–30 weeks with 2.
- **Three parallel tracks:**
  1. Bookings, payments, and rewards: the critical path.
  2. Onboarding, tasks, messaging, and reviews.
  3. Platform, notifications, admin, and test automation.
- **Start provider activation in week 1** (B-065). Checkr credentialing, SMS sender registration, and Stripe platform review have calendar lead times that engineering can't compress.

## 2. Milestones and acceptance criteria

| Milestone | Weeks | Scope (backlog) | Acceptance criteria (demonstrated on staging) |
|---|---|---|---|
| **M0 Foundations** | 1–2 | E0 | CI green; every PR gets a preview environment with seeds; `main` auto-deploys to staging; worker runs; test proves a rolled-back transaction enqueues no job; duplicate webhook processed once; Sentry receives errors |
| **M1 Accounts and helper onboarding** | 2–5 | E1 | On a phone, a new user signs up, verifies a phone, and becomes a helper: profile → ID verification (test mode) → payout onboarding (test mode) → **bookable**. Background check reaches `clear` in staging if D7 applies. Staff sign in with TOTP. Public profile shows badges and no restricted data |
| **M2 Tasks, privacy, discovery** | 3–6 | E2 | A poster publishes the desk task with a photo and address. The public page shows "Mueller, Austin" only. The helper feed shows a distance band. Matching helpers get an alert. **Address privacy suite (B-026) passes.** Photos have no metadata. AI drafting works behind its flag |
| **M3 Offers, invites, booking, funding** | 6–9 | E3 | **Two-account flow:** offer → book → pay (test card, incl. 3-D Secure) → `confirmed`. The address is revealed only then. Pre-booking messages are masked. An invite authorization is released on decline or expiry. Double submission creates one booking and one charge. Every movement has a balanced ledger journal |
| **M4 Completion and money movement** | 9–12 | E4 | Complete → approve, and auto-approve with a fake clock → earnings and reimbursement transfers. Payouts mirrored. Every cancellation, no-show, change, hourly-cap, and expense scenario in §3 matches 04 to the cent. A chargeback places a hold |
| **M5 Reviews, repeat, rewards** | 11–14 | E5 | Double-blind reviews; Book again; **welcome and repeat rewards** pending → held → redeemable → redeemed through the Tremendous sandbox; voided correctly on cancellation or refund; self-dealing pairs land in review; budget cap holds under concurrency |
| **M6 Admin and support** | 10–14 | E6 | Support resolves a dispute with a $45 settlement; refunds respect role limits and dual approval; moderation and suspensions work; every staff action is in the audit log; queues show SLAs |
| **M7 Hardening, live activation, private beta** | 14–18 | E7 + beta | E2E suite green on staging 3 days in a row; security and accessibility audits closed; live activation checklist (§4) done; **private beta** starts week 16 (see §6) |
| **M8 Public launch (Austin)** | 18–20 | Go/no-go | Every launch criterion in §5 met; marketing starts with the three hero categories |

## 3. Test plan

### 3.1 Layers

| Layer | Tooling | What it covers |
|---|---|---|
| Unit | Vitest | Every `domain/` file: state machines (each allowed and forbidden transition), fee engine, cancellation policy, reward rules, risk scoring, geo fuzzing (property tests) |
| Integration | Vitest + real Postgres/PostGIS (CI service) + provider fakes | Services and transactions, constraints, concurrency, webhook handlers with recorded fixtures, access control from every actor |
| End-to-end | Playwright, **two browser contexts = two accounts** (plus a staff context), on preview and staging with provider sandboxes | The scenarios below |
| Fault injection | Integration harness | Duplicate, out-of-order, and delayed webhooks; provider timeouts with unknown outcome; worker crash mid-job; concurrent double submits |
| Time travel | Injectable clock. Preview and staging expose a test-only clock override guarded by an env flag and a secret; it is **compiled out in production** | Auto-approve, invite expiry, no-show windows, reward holds and expiry, DST |
| Manual exploratory | Real phones (iOS Safari Home Screen app, Android Chrome) | Payment sheets, push, camera uploads, small-screen layouts |

### 3.2 Two-account scenarios (poster = account P, helper = account H, second helper = H2, staff = S)

| ID | Scenario | Expected result |
|---|---|---|
| T-01 | **$60 desk, happy path**: H offers, P books and pays, H checks in and completes with photos, P approves, both review, P books again | Charge $66.00; transfer $54.00; ledger balanced; reviews publish after both submit; rebook invite pre-filled |
| T-02 | No response after completion | Auto-approved at 72 h (fake clock); reminders sent at 24 h and 4 h before |
| T-03 | Declined card, then a good card | First attempt fails with a clear message; second confirms; one booking, one successful charge |
| T-04 | 3-D Secure required: complete it, and separately abandon it | Completed → confirmed. Abandoned → booking `canceled (funding_failed)` after 30 min; H's offer back to `pending` |
| T-05 | Double tap **Book** and two open tabs | One booking, one PaymentIntent, one charge |
| T-06 | Webhook before client refresh, refresh before webhook, triple delivery, `payment_failed` arriving after `succeeded` | All converge to the same final state; the late failure is ignored |
| T-07 | Invite: authorize → H declines; separate invite expires; H counters higher | Authorizations released; counter re-authorizes the new total; acceptance captures |
| T-08 | P cancels ≥ 24 h before | Full refund $66.00; reward voided; no transfer |
| T-09 | P cancels < 24 h before | P refunded $54.00; H receives $12.00 compensation transfer |
| T-10 | H cancels | Full refund; strike on H; **Find a replacement** reopens the task; H2 can offer |
| T-11 | H no-show | P can report only after start + 30 min with no check-in; refund; H contests → case |
| T-12 | P unavailable | H waits 20 min, reports **Can't access**; no reply in 30 min → H gets $12.00; P contests → case |
| T-13 | Dispute settled at $45 | Refund $16.50; transfer $40.50; welcome reward still qualifies |
| T-14 | Dispute resolved as full refund by S | Refund $66.00; no transfer; reward voided |
| T-15 | Change requests | Increase charged on-session before taking effect; decrease refunded; decline or expiry keeps the old terms; fees recalculated |
| T-16 | Hourly with cap (moving help $35/h, cap 4 h, worked 3.5 h) | Charge $154.00; refund $19.25; transfer $110.25. Submitting 4.5 h is blocked until a cap increase is accepted and funded |
| T-17 | Expense allowance $20, receipt $8 | Charge $86.00; reimbursement transfer $8.00, separate from earnings; refund $12.00 |
| T-18 | Chargeback via the dispute test card, before approval and after payout | Before: earnings held. After: platform loss journal; evidence pack downloadable |
| T-19 | Payout failure (Stripe's failing test bank account) | H sees "Action needed"; after updating the bank, the next payout succeeds |
| T-20 | **Address privacy** | H2 never gets the address (UI, API, HTML, OG tags, JSON-LD, notifications, logs). H sees it only after confirmation, until 48 h after completion. S needs a reason, and the access is logged. Photos have no EXIF |
| T-21 | Contact masking | Phone and email patterns masked before confirmation, shown after |
| T-22 | **Welcome reward** | $60 task → pending → qualified → redeemable after a 7-day hold → redeemed (sandbox). A $35 task creates no grant. Canceling voids the grant and the next qualifying booking creates a new one. When the cohort cap is reached, no new grants are created |
| T-23 | **Repeat reward** | 3rd paid booking with the same poster within 90 days → $10. A fully refunded booking doesn't count. Once per pair; monthly cap enforced |
| T-24 | **Stacking** (acceptance and completion flags on in staging) | Only one booking-level reward per booking; acceptance = 5% × $60 = $3.00, capped |
| T-25 | Self-dealing pair (shared device or card fingerprint) | Grant goes to `in_review`; S rejects → voided |
| T-26 | Budget concurrency: 50 parallel qualifications, budget for 10 | Exactly 10 grants |
| T-27 | Rewards with and without reviews, and with a 1★ review | Reward outcome identical in all three cases |
| T-28 | Staff limits | An agent's $150 refund needs approval; reversal needs finance and a case; all actions audited |
| T-29 | Notifications | Email, push, and SMS per preferences; quiet hours respected for non-critical messages |
| T-30 | DST: bookings and timers spanning US clock changes (fake clock at Nov 1, 2026 and Mar 14, 2027) | Reminders, deadlines, and the 24 h cancellation cutoff correct in `America/Chicago` |

## 4. Sandbox vs. real provider accounts

| Provider | Testable in sandbox or test mode | Needs a real (live) account before launch | Lead time |
|---|---|---|---|
| **Stripe** (payments, Connect, Identity) | PaymentIntents, 3-D Secure, declines, refunds, disputes (test cards), connected-account onboarding with test data, transfers, reversals, payouts incl. failures (test bank numbers), Identity outcomes, webhooks via `stripe listen` | Live activation and Connect platform review; Identity live use; Apple Pay domain registration on the production domain; real payout timing (first-payout delay); Radar tuning on real traffic; 1099 forms; statement descriptor | 1–3 weeks |
| **Tremendous** | Testflight sandbox: orders, `external_id` idempotency, webhooks, delivery states | Account approval, bank funding, campaign/product catalog for promotional use, live fraud review | 1–2 weeks |
| **Checkr** | Staging (mocked reports; staging access requires an authenticated production account) | Credentialing (legal entity documents, EIN, flow review), real turnaround and adverse-action notices, package pricing | 2–4 weeks |
| **Twilio** | Test credentials; Verify during trial with verified numbers | A2P 10DLC brand and campaign, or toll-free verification, for alert SMS (plan about 2 weeks); Verify for OTP needs no 10DLC registration of your own | ~2 weeks |
| **Postmark** | Test API token (accepted, not delivered); before approval, sending only to your own verified domains | Account approval (usually < 24 h on weekdays); DKIM, SPF, DMARC | 1–3 days |
| **Ably** | Free tier is the real service | Plan limits check | — |
| **Web push** | Real devices only | — | — |
| **Google Maps Platform** | No sandbox: real keys with quotas and budget alerts | Billing account | — |
| **Anthropic API** | Real API with a development key and spend limit; eval set | Production key and spend alerts | — |

### Live activation checklist (B-065)

1. **Stripe.**
   - Business verification and Connect platform profile.
   - Connected-account branding and settings (Accounts v2, Express Dashboard, platform collects fees and is liable for losses).
   - Platform-account payout schedule set to **manual**; payouts run by our job (04 §5).
   - Identity activation.
   - Apple Pay domain registration.
   - Statement descriptor `TASKSNEARME`.
   - Radar rules, live webhook endpoints and secrets, restricted API keys.
   - Small real transactions between staff accounts: a $5 booking, a refund, and a transfer.
2. **Tremendous.** Approval, bank funding, a campaign limited to approved brands, webhook secret.
3. **Checkr.** Credentialing, packages, standalone FCRA disclosure flow review (**F9**).
4. **Twilio.** Verify service; messaging sender registration (**F11**).
5. **Postmark.** Approval, DNS records.
6. **Google Maps.** Billing, key restrictions.
7. **Cloudflare.** WAF and rate-limit rules, Turnstile keys.
8. **Legal.** Documents published and versioned in `agreements` (**F4–F10, F12–F14, F18, F20**).
9. **Hosting.** The proxy in front of the web service must **replace** `X-Forwarded-For` with the visitor's address, not append to it (or the per-IP limits must read the right-most trusted hop instead of the first). Otherwise a client sending `X-Forwarded-For: 127.0.0.1` skips the per-IP limits on sign-in codes, the waitlist and invite links. Check Render's behavior before launch (B-061).

## 5. Launch criteria (go/no-go)

| Area | Criterion |
|---|---|
| Product | All P0 backlog items done; E2E suite green 3 days in a row on staging; beta exit criteria met (§6) |
| **Money integrity** | 14 consecutive beta days with **zero unexplained reconciliation differences**; zero duplicate charges, transfers, or rewards; webhook processing lag p95 < 1 min with an empty dead-letter queue; no booking funded for more than 21 days without resolution |
| Security and privacy | Address privacy suite green; no open high or critical security findings; TOTP enforced for all staff; restricted-data access logging verified; PII redaction in logs verified; a backup restore (PITR) rehearsed |
| Legal and compliance | Every "before launch" item in [06-verification-trust-compliance.md](06-verification-trust-compliance.md) §5 resolved or consciously accepted by the founders in writing |
| Operations | Support hours published (for example 8 am–8 pm Central, daily) plus a 24/7 safety escalation on-call; runbooks done; refund authority assigned; status page |
| Supply | ≥ 40 bookable helpers in the launch area, including ≥ 10 in each hero category; beta median time to first offer < 2 h (7 am–9 pm) |
| Quality | Beta completion rate ≥ 90%; dispute rate ≤ 5%; no unresolved safety incident |
| Performance and accessibility | Targets in 07 §6 met; core journeys pass WCAG 2.2 AA checks |

## 6. Private beta (weeks 16–18)

- **Invite-only:** 30–50 founding-cohort helpers (welcome reward eligible) and 100–150 posters from 2–3 Austin neighborhoods (for example Mueller, East Austin, Hyde Park), recruited through neighborhood groups and personal networks.
- **Ops cadence:** staff watch every booking; daily money reconciliation review; twice-weekly policy tuning (fees, timers, price guidance) through versioned market policies.
- **Exit:** ≥ 50 completed paid bookings across at least 4 categories, launch criteria trending green, and no open P0 bugs.
