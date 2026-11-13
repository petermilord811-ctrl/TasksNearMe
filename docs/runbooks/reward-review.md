# Reward fraud review

Use this to work the gift-card reward review queue, and when a reward looks like self-dealing, a program's spend jumps, or deliveries fail. Routine reviews aren't incidents. A suspected ring (several linked accounts), or a gift card delivered to someone who shouldn't have had it, is **SEV2**: gift cards can't be clawed back.

**Who:** support leads and admins approve reviews. Leads, trust & safety and admins reject them. Support agents, leads, trust & safety and admins void and reissue. Finance owns the budgets and reads spend on `/admin/metrics` ([src/modules/rewards/staff.ts](../../src/modules/rewards/staff.ts)).

## How a reward reaches review

A grant moves `pending` → `qualified` → `redeemable`, with checks at each step ([src/modules/rewards/domain.ts](../../src/modules/rewards/domain.ts)):

1. **`pending`** as soon as its trigger happens (blueprint 05 §2). Over the helper's **$75 monthly cap** across programs, no grant is created; it waits for a later month.
2. **`qualified`** once its booking is completed and the helper's earnings were transferred, with a **7-day hold** (`hold_until`). Below the program's price threshold ($40 welcome, $25 repeat), it's `voided` (`below_threshold`). A canceled booking voids it (`booking_canceled`).
3. When the hold ends, the grant goes to **`in_review`** if:
   - it's a **welcome** reward (every one is reviewed at launch, blueprint 05 §1), or
   - it carries a review signal: **`shared_card`** (the client paid with a card the helper saved: one person running both accounts) or **`new_client_account`** (the client's account was under 14 days old when the booking was paid).
   Otherwise it becomes **`redeemable`**, and expires 90 days later.
4. A grant whose booking is **`disputed`** doesn't leave `qualified` until the case is resolved.

Two more signals show on the queue for context but don't send a grant to review: `new_helper_account` and `repeat_pair` (3 or more bookings between the same pair within 30 days) ([src/modules/rewards/risk.ts](../../src/modules/rewards/risk.ts)).

## Working the queue

`/admin/rewards?status=in_review` lists reviews oldest hold first. For each grant:

1. **Open the booking** from the row: its price, completion photos and timeline. Was real work done at a real address?
2. **Look at the people** (`/admin/users/[userId]` for the helper and the client):
   - When each account was made, how each was verified (phone, ID, address proof).
   - Their other bookings. Does this client book only this helper, at the reward's threshold price?
   - Reports and cases on either side.
3. **Weigh the signals.**
   - `shared_card` is the strongest: the same card on both sides almost always means one person. Reject unless there's a clear innocent reason, such as a household paying with a shared card, and record that reason.
   - `new_client_account` with a first booking just over $40 to a brand-new helper is the welcome-fraud pattern in blueprint 05 §3: the pair pays $44, gets $36 back plus a $50 gift card, and makes $42.
   - `repeat_pair` alone is usually a happy repeat client. Repeat-reward fraud doesn't pay (the pair loses $26 over three $60 bookings), so light review is enough.
4. **Decide, with a note of at least 10 characters.** It's stored in the audit log as `reward.approve_review` or `reward.reject_review`.
   - **Approve**: the grant becomes `redeemable`.
   - **Reject**: the grant becomes `voided` with `void_reason='risk_review'`, which **ends that program for the helper** (welcome) **or for the pair** (repeat). A rejected reward doesn't come back later.
5. **If you find a ring** (the same card, device or address across several accounts), switch to SEV2:
   - Void every live grant in the ring (`void` works on any status except `delivered`, `voided`, `expired` and `issuing`).
   - Ask trust & safety to suspend the helper profiles involved ([safety escalation](safety-escalation.md)).
   - Tell finance what was already delivered: those losses are booked, because gift cards can't be clawed back.

Never let a review depend on reviews or ratings. The rewards module has no access to review data, and the review decision must not use it either (blueprint 05 §1).

## Delivery problems

Redeeming creates a Tremendous order with `external_id` = the grant id, so a retry can't issue twice.

| Status | What it means | What to do |
|---|---|---|
| `failed` ("Delivery problem") | Tremendous refused the order, or is holding it for approval | Check the order in the Tremendous dashboard (search by the grant id). Approve it there, or fix the cause (the campaign, or the funding balance), then **Reissue** from `/admin/rewards?status=failed` |
| `issuing` for more than an hour | The server stopped between creating the order and saving the answer | No staff action exists. An engineer checks Tremendous for an order with that `external_id`, then sets the grant to `delivered` (with the link) or `failed`, by hand |
| Many `failed` at once | The Tremendous balance ran out, or the API key or campaign changed | Finance tops up the balance (bank transfer, no fee; card funding costs 3%), or the engineer fixes `TREMENDOUS_API_KEY` or `TREMENDOUS_CAMPAIGN_ID`. Then reissue each one |

## Budgets and switches

- **Budgets.** The welcome program's budget is 100 × $50 = $5,000. The other programs run on the monthly cap alone. `/admin/metrics` → Reward spend shows each program's committed, delivered and remaining amounts, and the helpers at the cap this month. `/admin/rewards` shows the same budgets.
- **Stopping a program.** An admin switches it off per market at `/admin/config`: `reward.welcome`, `reward.repeat` and `reward.recurring_month` are on at launch, `reward.acceptance` and `reward.completion` are off. Switching one off stops new grants; it doesn't void the ones already earned.
- **Spend jumping.** A week with far more welcome grants than new verified helpers points at fake helper accounts. Pause `reward.welcome` while you review, and tell the helpers affected that their pending rewards are under review.

## Afterwards

For a ring: write the incident note ([README](README.md#after-every-sev1-or-sev2)) with the accounts, the money delivered, and the signal that would have caught it sooner. Blueprint 05 §1 also lists signals that aren't built yet (shared payout bank, shared device, shared IP within 24 h, addresses within 100 m); a ring caught by hand is the case for building them.
