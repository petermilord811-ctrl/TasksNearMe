# 05 — Gift-card rewards: rules, economics, and launch policy

## 1. Ground rules (apply to every program)

1. **Separate money.** Rewards come from the platform's **promotions budget** and are delivered as **gift cards through Tremendous**. They are never paid through Stripe, never deducted from helper earnings or added to poster charges, and never shown as earnings. They have their own ledger accounts (04 §2).
2. **Pending first, unlocked later.** A reward shows as *pending* as soon as its trigger happens, which motivates the helper. It becomes **redeemable only after the corresponding work is completed and paid** (earnings transfer created) **plus a 7-day hold** with no refund, dispute, chargeback, or risk flag.
3. **No link to reviews.** No reward depends on leaving a review, on a rating, or on review content. The FTC's Consumer Reviews and Testimonials Rule (16 CFR Part 465, effective Oct 21, 2024) prohibits compensation conditioned on review sentiment; we go further. The rewards module has **no code path to review data**, enforced by a lint boundary and a test (T-27).
4. **Budgets and caps.** Each program has a budget that is reserved under a database lock and stops the program automatically when spent. Each helper is capped at **$75 per calendar month across all programs**. Rules are versioned, and every grant records the version it was earned under.
5. **Tax.** Gift cards are taxable income to the recipient. We keep per-recipient annual totals. For payments made after 2025, the IRS 1099-MISC threshold is $2,000. Which form, and how it combines with Stripe-issued forms, is for the tax advisor (**F7**). Tremendous offers W-9/1099 tools, and Stripe's tax forms accept our own totals.
6. **Abuse controls** (risk score → `in_review`): shared payment card fingerprint, shared payout bank fingerprint, shared device ID, shared IP within 24 h, poster address within 100 m of the helper's, unusual velocity. **At launch every welcome redemption gets a manual review**, which is feasible because the cohort is capped at 100.

**Definitions**
- **Eligible task price (basis):** the final agreed task price *P* after any settlement. Excludes service fees, expenses and reimbursements, cancellation compensation, and tips.
- **Qualifying booking:** in an enabled category; completed by approval, auto-approval, support, or settlement; earnings transfer created; *P* at or above the program threshold; poster and helper not linked by risk signals.

## 2. The four programs

| | **1. Welcome** | **2. Offer acceptance (5%)** | **3. Repeat booking** | **4. Completion bonus** |
|---|---|---|---|---|
| **Purpose** | Recruit founding helpers in launch categories | Encourage quick acceptance of funded direct invites | Keep repeat pairs on the platform (anti-disintermediation) | Fill specific hard-to-staff tasks |
| **Recipient** | Helper | Helper | Helper | Helper |
| **Funded by** | Platform promotions budget | Platform promotions budget | Platform promotions budget | Platform promotions budget |
| **Amount** | **$50** fixed | **5% of basis**, cap **$5 per booking** (config), at most 3 per helper per 30 days | **$10** fixed | **10% of basis, cap $10**, or a flat amount set per campaign |
| **Calculated on** | — (threshold: first qualifying booking with *P* ≥ **$40**) | Fixed price: eligible task price. Hourly: the **first funded work period** (funded hours × rate, recomputed on approved hours). Recurring: the first visit | Count of qualifying bookings (each *P* ≥ $25) with the **same poster** | Eligible task price of an ops-flagged task, shown up front on the task card ("+$6 completion bonus") |
| **Eligibility** | ID verified, payout-ready, background-checked if in-home; **first 100 verified helpers** in the market (founding cohort); qualifying booking within 60 days of verification | Applies to **funded** direct invites, slot requests, and rebooks (card authorized) that the helper accepts | Once per helper–poster pair: 3rd qualifying booking within 90 days of the first | Only tasks flagged by ops (category, time, or area with low supply) |
| **Pending when** | The qualifying booking is **funded** | The helper **accepts the funded invite** (shown at once: "+$3 pending") | The 3rd booking with that poster is **funded** | The booking is **funded** |
| **Redeemable when** | Booking completed and paid + 7-day hold + manual review | That work completed and paid + 7-day hold | That booking completed and paid + 7-day hold | Completed and paid + 7-day hold |
| **Stacking** | Booking-level | Booking-level | **Relationship-level**: may coincide with a booking-level reward | Booking-level |
| **On cancellation** | Voided. The helper stays eligible within the 60-day window; the next qualifying booking creates a new pending grant | Voided | Voided; the canceled booking doesn't count, and the next qualifying booking within 90 days can be the 3rd | Voided |
| **On partial refund or settlement** | Re-evaluated on the final *P*: still qualifies if ≥ $40 (the $45 settlement in 02 §3 qualifies) | Recalculated on the final *P* | Counts if final *P* ≥ $25 | Recalculated on the final *P* |
| **On full refund** | Voided | Voided | Doesn't count | Voided |
| **After delivery** (later chargeback or fraud) | Gift cards can't be clawed back. Account review; future rewards blocked; losses booked | Same | Same | Same |
| **Expiry** | Redeem within 90 days of becoming redeemable | Same | Same | Same |
| **Launch status** | **On** (founding cohort, budget $5,000) | **Built, off** | **On** (paid-bookings version) | **Built, off** |

**Booking-level stacking rule:** at most one booking-level reward (welcome, acceptance, completion) per booking, and the **highest value wins**. The repeat reward is per relationship and can coincide. A database constraint enforces this (08 §3, rewards).

### Repeat reward: which version first?

| Version | Rule | Pros | Cons | Recommendation |
|---|---|---|---|---|
| **A: paid bookings** | $10 when a helper completes and is paid for their **3rd booking with the same poster within 90 days** | Works without recurring visits; easy to explain; **collusion is unprofitable** (the fake pair pays $36 in fees on three $60 bookings to earn $10) | Doesn't reward long-running schedules specifically | **Launch now** |
| B: recurring month | $15 after the first calendar month in which every scheduled visit of a recurring series (at least 2) was completed and paid; once per series | Directly rewards recurring help | Needs recurring visits (phase 2) and more edge cases (skips, pauses) | **Add with recurring visits in phase 2**; A and B don't stack for the same pair in the same month |

## 3. The economics, challenged

Figures from 04 §8 (contribution per $60 booking: **$6.97** conservative, **$8.47** typical).

| Program | Cost on a $60 booking | Effect on contribution | Verdict |
|---|---|---|---|
| **Welcome $50** | $50 | **−$43.03** on the first booking; pays back after **6–7 more bookings** by that helper | The expensive one. In local services, **helpers are usually easier to recruit than posters**, and a helper reward does nothing for demand. Keep it as a **capped founding-cohort tool** to seed supply density before launch, not an open-ended promotion. Measure 60-day retention of rewarded versus unrewarded helpers before renewing, and consider $25 after the cohort |
| **Acceptance 5%** | $3.00 | −35% to −43% of contribution | It mostly pays for behavior that already happens, since helpers accept funded work they want. Low incremental value. **Off at launch.** Later, use it only as a short, targeted campaign (for example, direct invites in an under-supplied category) |
| **Repeat $10** | $10 once per pair | $10.91–$15.41 contribution left across the 3 bookings | Good value. It rewards the behavior we want most (repeat business on the platform) at a known, capped cost. **On at launch** |
| **Completion bonus** | Up to $6 (10%) | Leaves $0.97–$2.47 | Only worth it where it creates a booking that wouldn't otherwise happen. **Off at launch**; an ops lever once liquidity data shows gaps |

**Fraud math (self-dealing pair, one person running both accounts):**
- **Welcome on a $40 task:** the pair pays $44.00 and receives $36.00 + a $50 gift card = **+$42 profit**. So linkage checks, the 7-day hold, and manual review are essential.
- **Repeat on three $60 tasks:** the pair pays $198.00 and receives $162.00 + $10 = **−$26**. Not profitable, so light controls are enough.
- The 5% acceptance reward is not profitable to fake while the platform's take (about $12 on $60) exceeds it.

**Alternative worth considering (product decision, outside this reward scope):** if the promotions budget is tight, a first-task credit for posters is likely to drive more liquidity per dollar than helper gift cards. It would be a discount on the poster's charge, funded by the platform, with the helper still earning in full.

## 4. Recommended launch policy (D8)

> **TasksNearMe helper rewards (Austin launch):**
> - **$50 welcome gift card** for our first 100 verified helpers, after your first completed and paid task of $40 or more within 60 days of verification.
> - **$10 repeat-client gift card** when you complete your 3rd paid booking with the same client within 90 days.
>
> Rewards unlock 7 days after the task is paid and must be redeemed within 90 days. One welcome reward per person. Rewards never depend on reviews or ratings. Rewards are gift cards, not wages, and may be taxable income.

The engine also supports the acceptance and completion programs, switched off by feature flag, so the team can run them as controlled campaigns later without code changes.

## 5. Redemption and delivery

1. The helper taps **Redeem** on a redeemable grant.
2. We create a Tremendous order with `external_id = grant_id` (an identical retry returns the same order; mismatched parameters return 409).
3. The order uses a **campaign** with a curated catalog: the recipient chooses from approved brands such as a prepaid Visa or major retailers. Confirm which brands allow promotional use (**F16**).
4. Delivery is **LINK**, shown in the app, with optional EMAIL. Delivery webhooks update the grant. Flagged or blocked fraud reviews move it to `in_review` or `voided`.
5. **Funding:** the Tremendous balance is prefunded by bank transfer (no fee; card funding costs 3%), sized to two weeks of expected redemptions.
6. **Reporting:** a monthly reward-spend dashboard and an annual per-recipient totals export for tax (**F7**).

## 6. Rewards terms checklist (for counsel, F8)

Eligibility and cohort cap; qualifying-task definition; hold and expiry; void and forfeiture rules; one-per-person rule and how it's determined; budget-exhaustion clause (the program can end at any time); no review or rating condition; tax notice; gift card brand terms; right to review for fraud; market limitation (Austin only).
