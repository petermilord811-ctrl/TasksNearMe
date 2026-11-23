# 04 — Payments, fees, payouts, refunds, and disputes

> Provider facts were checked against Stripe's official docs and pricing pages on 2026-11-10 (sources in [README.md](README.md#verification-log)). Anything marked **F#** still needs confirmation on our own account, or from counsel or a tax advisor.

> **Changed 2026-11-23 (owner: "Totally remove service fee feature … Just receive fee when helper needs upfront from taskers and tasksnearme holds money … send money to helper after tasker says task done").** There are no service fees. Each offer says how the helper is paid: **directly** (the default: the client pays the helper after the task, outside TasksNearMe, with no fees) or **upfront, held by TasksNearMe** (the flow below: charged at booking, held, sent to the helper when the client says the task is done). The only fee is the client's **hold fee** on a held payment, `max(5% × P, $1.00)`, waived for Plus members; helpers pay nothing. Revenue is the hold fee and the plans (Plus and Pro, LinkedIn-Premium-style; [decisions.md](../automation/decisions.md), 2026-11-23). Bookings made under an older policy keep its fees (10% each side, the client's at least $3) and its plan rebates. Everything below about charging, holding, transfers and refunds applies to **held** bookings only.

## 1. Provider and model (D4)

- **Stripe Connect**, US platform account.
  - **Posters** are Stripe Customers paying through the Payment Element (cards, Apple Pay, Google Pay).
  - **Helpers** get connected accounts created with **Accounts v2**, which Stripe recommends for new integrations (its legacy `type=express` pages are marked deprecated). Settings: **Express Dashboard**, **the platform collects fees**, **the platform is liable for losses**, a recipient configuration with the `stripe_transfers` capability, and onboarding through Stripe-hosted Account Links. These settings can't be changed later. The Accounts v1 fallback is the equivalent controller properties (`stripe_dashboard.type=express`, `fees.payer=application`, `losses.payments=application`, `transfers` capability).
- **Charge type: separate charges and transfers.** The poster is charged on the platform account. Each helper payment is a separate Transfer with `transfer_group = booking:{id}`.
  - Why: (1) charge at confirmation and pay after completion; (2) split one booking into earnings and reimbursement transfers; (3) pay whoever actually did the work (replacement matching, phase 2); (4) settle partial outcomes.
  - Stripe recommends this charge type **only when the platform is responsible for connected accounts' negative balances**, which is why losses sit with the platform.
- **Tradeoffs we accept:**
  - The platform is the merchant on the card statement.
  - The platform pays all Stripe fees and absorbs refunds, disputes, and negative balances.
  - Tax collection and reporting fall on the platform (**F6**, **F7**).
- **Paid directly (the default since 2026-11-23).** No money moves through TasksNearMe: the client pays the helper once the task is done, however they agree (cash, a payment app). The booking, its agreed terms, messages and reviews are recorded as usual; there's nothing to charge, refund, transfer or settle, so tips, paid changes and money resolutions aren't offered on these bookings.
- **Not escrow.** User-facing language for a held booking: *"You pay when you book. TasksNearMe holds it and pays your helper when you say the task is done."* Funds wait in the platform's Stripe balance, with no interest and no stored value for posters.
  - Stripe's guidance is to hold funds only when there's a clear purpose and a commitment to transfer. It names on-demand services waiting for job completion as the typical case, which matches this design. No hard maximum delay is documented for this charge type.
  - **Our own policy: every funded booking is transferred or refunded within 30 days of its scheduled start**, unless a dispute is open. Admin alerts fire at 21 days.
  - The legal structure, with the platform as each helper's limited payment collection agent, needs counsel (**F4**).

## 2. Money flows

```
Poster card ──PaymentIntent (capture)──▶ Platform Stripe balance ──Transfer: earnings──────▶ Helper connected account ──Payout──▶ Helper bank
                                              │                  └─Transfer: reimbursement──▶ (same account, separate transfer)
                                              ├──Refund──▶ Poster card
                                              └──Fees (platform revenue) ──manual platform payout job──▶ Platform bank

Promotions budget (separate bank account) ──prefund──▶ Tremendous balance ──gift card──▶ Helper     (never through Stripe)
```

Four kinds of money are **kept apart at every layer**:

| Kind of money | Payment lines | Transfer kind | Ledger accounts | Where the helper sees it |
|---|---|---|---|---|
| Service price | `task_price` | `earnings` | `liability:helper_payable` | Earnings |
| Platform fees | `poster_fee` (the hold fee; a helper fee only on bookings made before 2026-11-23) | — | `revenue:poster_fees`, `revenue:helper_fees` | Fee lines |
| Expenses | `expense_allowance` | `reimbursement` | `liability:reimbursements_payable` | "Reimbursed expenses" (not earnings) |
| Promotional rewards | — | — (gift card) | `expense:rewards`, `liability:rewards_payable` | Rewards page only |

## 3. Fee model (A5, D5)

Configurable per market policy version. Migration 0078 published these defaults for every market on 2026-11-23.

| Term | Formula (defaults since 2026-11-23) |
|---|---|
| How it's paid | The helper chooses on each offer: `direct` (the default) or `held`. Requests to a helper, Book again proposals and regular visits are held (they're built on a card hold or a charge) |
| Task price **P** | Fixed agreed price, or approved hours × rate (≤ funded cap) |
| Hold fee (client) | `max(5% × P, $1.00)` on a held booking; **0** paid directly; **0** for a Plus member |
| Helper fee | **0** (10% × P before 2026-11-23, deducted from earnings) |
| Client total at booking | Held: `P (or rate × cap) + hold fee + expense allowance`. Direct: nothing is charged |
| Helper earnings | **P**, the whole price |
| Reimbursement | Approved receipts ≤ allowance, **no fees either side** |
| Platform revenue | The hold fee (and the plans, §8) |
| Rounding | Half-up to the cent once per line; totals are sums of lines |

| Example (held unless it says otherwise) | Client pays | Helper gets | Platform revenue |
|---|---|---|---|
| **$60 desk (fixed), paid directly** | **$60.00** to the helper | **$60.00** | — |
| **$60 desk (fixed), held** | $60.00 + $3.00 = **$63.00** | **$60.00** | $3.00 |
| $15 small task (minimum fee) | $15.00 + $1.00 = $16.00 | $15.00 | $1.00 |
| $45 bookshelf rebook | $47.25 | $45.00 | $2.25 |
| Moving help, $35/h, 4 h cap, 3.5 h worked | Funded $140 + $7.00 = $147.00; final $122.50 + $6.13 = $128.63; **refund $18.37** | **$122.50** | $6.13 |
| $60 desk + $20 expense allowance, $8 receipt | Charged $83.00; refund $12.00; **net $71.00** | $60.00 earnings + **$8.00 reimbursement** | $3.00 |
| $60 desk held for a Plus member | **$60.00** | $60.00 | — |

Both people see these lines before confirming (02 J4). Each accepted change produces a new `booking_terms` version with recalculated lines (a direct booking's change moves no money).

## 4. When the poster is charged

| Situation | Timing | Mechanism | Notes |
|---|---|---|---|
| Poster accepts an offer paid directly | **Never** | None: the booking is confirmed at once | The client pays the helper after the task, outside TasksNearMe |
| Poster accepts an offer paid upfront (held) | **At confirmation** | PaymentIntent, automatic capture | "Funded" means captured |
| Direct invite, slot request, Book again | **Authorized at invite, captured when the helper accepts** | PaymentIntent with `capture_method=manual`; invite TTL ≤ 48 h | Card authorization windows for online customer-initiated payments are 7 days on Visa, Mastercard, Amex, and Discover (Visa merchant-initiated: about 5). **48 h fits every window.** We don't use extended or incremental authorizations; both need IC+ pricing and limited merchant categories |
| Change request that raises the total | When the counterparty accepts | New on-session PaymentIntent for the difference | The new terms apply only after funding |
| Recurring visit (phase 2) | 48 h before each visit, off-session | Saved payment method (SetupIntent) | Retries and skip rules in 03 §7 |
| One-time task more than 14 days ahead | Not offered at launch (A7) | Phase 2: save the card at booking, charge 72 h before | Avoids long holds and refunds |

## 5. Completion, transfers, and payouts

1. **On `completed`** (approved, auto-approved after 72 h, support, or settlement) of a held booking, one job does three things (a direct booking has no money to move):
   - Creates an **earnings** transfer and, if there are approved expenses, a separate **reimbursement** transfer. Each has `source_transaction` set to the funding charge, `transfer_group`, and metadata. A transfer can't exceed its source charge, so an amount funded by two charges (original plus change) becomes two transfer rows.
   - Refunds any unused hourly cap or expense allowance.
   - Writes ledger journals.
2. **`source_transaction`** lets a transfer succeed before its charge settles. **After settlement (about 2 business days), the transfer draws on the platform's available balance.** If automatic platform payouts had already swept that balance to the bank, the transfer would fail and Stripe wouldn't retry. Therefore:
   - **The platform account's payout schedule is manual.** A daily job pays out only `available − (funds held for open bookings + helper payable + reimbursements payable + pending refunds + buffer)`. The buffer is the greater of $2,000 or 10% of held funds.
   - An alert fires if the available balance ever drops below those obligations.
   - We'll evaluate Stripe's **funds segregation** (private preview, US), which ring-fences charge funds until they're transferred and requires platform liability for losses (**F1**).
3. **Helper payouts** use Stripe's default for US connected accounts: **automatic daily payouts, with funds available after 2 business days, rolling.**
   - The first payout usually arrives about **7 days after the first live payment** (up to 14 depending on risk). Helper onboarding says this plainly.
   - Instant Payouts (1% of volume on Connect; the platform may mark it up) is phase 2, as an option the helper pays for.
4. **Payout failures** (`payout.failed`) show the helper "Action needed: update your bank in your payout dashboard" with an Express Dashboard link.

## 6. Cancellations, refunds, and disputes

Policy defaults (D15, configurable). The numbers use the $60 desk held for $63.00. **Paid directly,** nothing moves through TasksNearMe: a cancellation carries only its strike and reliability rules, and support can mediate, warn and remove people but can't refund or settle (money resolutions aren't offered).

| Scenario | Poster refund | Helper receives | Platform keeps | Unrecovered Stripe cost |
|---|---|---|---|---|
| Poster cancels ≥ 24 h before start | **$63.00** (everything, the hold fee included) | — | — | $2.13 (processing fees aren't returned on refunds) |
| Poster cancels < 24 h, or poster no-show / can't access (03 §4) | **$51.00** | **$12.00** cancellation compensation: `max($10, 20% × P)` up to P | — | $2.13 + $0.28 payout fee |
| Helper cancels or no-shows | **$63.00** | — (strike) | — | $2.13 |
| Dispute settled at $45 (a price change both accept) | **$15.75** | **$45.00** | $2.25 | $2.13 |
| Dispute resolved as a full refund | **$63.00** | — | — | $2.13 |
| Unused hourly cap or expense allowance | The unused amount plus its fee share | — | — | 2.9% of the refunded part |
| Goodwill refund after the transfer (for example, damage found later) | From **platform funds** | Unchanged: **no clawback** except for fraud or with the helper's agreement | −refund | — |

**Mechanics and limits (verified):**
- Refunds and disputes are debited from the **platform** balance. A refund does **not** reverse a transfer automatically.
- **Transfer reversals** (full or partial) work only while the helper's Stripe balance covers them, which in practice means before the payout. Stripe says to use them only for refunds, disputes, or correcting errors.
- If a helper's account goes negative, the platform is liable. Stripe can debit the helper's bank if `debit_negative_balances` is on, and after 180 days negative it takes the platform's funds to zero the account.

**Card disputes (chargebacks):**
- **Early fraud warning or chargeback before the task starts:** support cancels the booking, refunds proactively where still possible, notifies the helper, and reviews the poster.
- **Chargeback while the helper's money hasn't gone out yet** (the work waits for approval, or is approved but not transferred): that money waits until the bank decides, then goes out whichever way it ended. Money already transferred stays the helper's.
- **Chargeback after the work is done and approved:** the helper keeps the earnings. The platform contests with an evidence pack (approval log, completion photos, messages, check-in) and absorbs any loss, unless there's helper fraud or collusion. A lost chargeback is recorded in the ledger as the platform's loss (the disputed amount and Stripe's fee).
- **Costs:** a **$15 dispute fee**, plus a **$15 dispute-countered fee** when we respond (returned if we win). Appeals cost $15 more.

## 7. Ledger and reconciliation

A double-entry ledger mirrors every provider movement (held bookings; a direct booking has none). Journals for the $60 desk held for $63.00:

| Event | Debit | Credit |
|---|---|---|
| Funding captured ($63.00, Stripe fee $2.13) | Stripe balance $60.87; processing expense $2.13 | Customer funds held $63.00 |
| Booking completed | Customer funds held $63.00 | Helper payable $60.00; poster fee (hold fee) revenue $3.00 |
| Transfer created | Helper payable $60.00 | Stripe balance $60.00 |
| Payout fee (billed) | Connect expense $0.40 | Stripe balance $0.40 |
| Welcome reward qualifies / delivered | Rewards expense $50 / rewards payable $50 | Rewards payable $50 / Tremendous prefunded balance $50 |

Revenue is recognized at completion (the accountant should confirm). A daily job reconciles Stripe balance transactions (charges, fees, refunds, transfers, reversals, disputes, payouts) with the ledger. Exceptions land in an admin queue. The launch criterion is 14 days with zero unexplained differences.

## 8. Illustrative margin on the $60 booking

Since 2026-11-23 a booking paid directly costs the platform only its notifications and infrastructure (about $0.10) and earns nothing; a held one earns the hold fee. **Revenue is the plans.**

**Assumptions** (state them in every model):

| # | Assumption | Value | Status |
|---|---|---|---|
| 1 | Hold fee | 5% (minimum $1), held bookings only; waived with Plus; no helper fee | Owner's choice (2026-11-23) |
| 2 | Card processing | 2.9% + $0.30 per successful domestic card charge | Verified on Stripe US pricing. International cards and currency conversion cost more; ignored here |
| 3 | Connect (platform handles pricing) | **$2 per monthly active account** (a month with ≥ 1 payout) + **0.25% + $0.25 per payout** | Verified. One ambiguous line on the pricing page is to confirm (**F3**) |
| 4 | Refunds | Processing and Connect fees are not returned | Verified |
| 5 | Disputes | $15 + $15 if countered (returned on a win) | Verified |
| 6 | Identity verification | $1.50 per document + selfie check; first 50 free | Verified; one-time per helper |
| 7 | Background check | From about $30 per check (Checkr list prices vary by package) | Partly verified; in-home categories only; one-time |
| 8 | 1099 forms | $2.99 IRS e-file + $1.49 state e-file per form, only for helpers above thresholds | Verified; negligible per booking |
| 9 | Gift card delivery | No fee when the provider balance is bank-funded (3% if card-funded) | Verified on Tremendous pricing |
| 10 | Notifications and variable infrastructure | $0.10 per booking | Estimate |
| 11 | Loss and dispute reserve | 0.5% of the charge | Estimate |
| 12 | Sales tax | Not modelled (**F6**) | Open |
| 13 | Payouts | One payout per booking. Conservative: the helper's only payout this month. Typical: 4 payouts this month | Estimate |
| 14 | Plans | Plus $4.99 a month ($39.99 a year), Pro $7.99 ($59.99); card processing as in #2, plus Stripe Billing's usage fee (about 0.7%, to confirm) | Prices verified in the policy; Billing fee to confirm |
| — | Support labor and marketing | Excluded (fixed costs) | — |

**A held $60 desk:**

| Line | Conservative | Typical |
|---|---|---|
| Hold fee revenue | $3.00 | $3.00 |
| Card processing (2.9% × $63 + $0.30) | −$2.13 | −$2.13 |
| Payout fee (0.25% × $60 + $0.25) | −$0.40 | −$0.40 |
| Monthly active account fee share | −$2.00 | −$0.50 |
| Notifications and infrastructure | −$0.10 | −$0.10 |
| Loss and dispute reserve (0.5% × $63) | −$0.32 | −$0.32 |
| **Contribution** | **−$1.95** | **−$0.45** |

**A month of a plan:** Plus nets about $4.51 ($4.99 − $0.44 card − $0.03 Billing), Pro about $7.40 ($7.99 − $0.53 − $0.06); yearly plans a little more per month.

- **At 5% a held payment doesn't quite cover Stripe's costs** (−$0.45 typical, −$1.95 when it's the helper's only payout that month). The hold fee is a market policy setting (a new policy version in admin config): at 6% a typical held $60 booking breaks even, at 8% it makes about $1.30. That's the owner's call.
- **Client credits (the welcome credit) come back only up to what a held booking earns**, its hold fee: $3.00 on the $60 desk, the rest kept for later bookings; none on a booking paid directly.
- **The welcome gift card is no longer paid back by bookings.** It's a marketing cost against plan revenue: $50 is about 11 months of one Plus member, or 7 of one Pro member.
- Other rewards on the same booking (acceptance reward, completion bonus, the $10 repeat reward) are likewise pure cost now.
- Economics and launch policy: [05-rewards.md](05-rewards.md).
