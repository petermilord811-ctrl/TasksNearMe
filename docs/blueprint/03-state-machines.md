# 03 — State machines and permitted actions

> Booking, payment, and reward states are **separate machines**, connected only by events. A reward never blocks earnings, and earnings never wait on a reward. Each machine lives in its module's `domain/` folder as a pure function, `transition(state, event, actor) → { next, effects }`, with table-driven tests (see [07-architecture.md](07-architecture.md)).

## 1. Conventions

- **Actors:** `poster`, `helper`, `support` (any staff role permitted by the action), `system` (jobs and timers), `provider` (Stripe, gift-card provider, or background-check provider events).
- Every transition writes a `booking_events` (or equivalent) row and an outbox event in the **same database transaction**.
- Money states change only on **provider-confirmed facts**: a synchronous API result later reconciled with the webhook, or the webhook itself. Until then the UI shows *Processing*.
- Default timers are market policy values, snapshotted onto each booking at confirmation (D16): auto-approve 72 h, invite TTL 48 h, pending-funding TTL 30 min, no-show threshold 30 min after window start, reward hold 7 days.

**Invariants (enforced in code and covered by tests):**
1. A booking cannot be `confirmed` unless its funding payment has `succeeded`.
2. An earnings transfer cannot be created unless the booking is `completed` and there is no open hold (dispute, chargeback, or risk).
3. A reward cannot become `redeemable` until its qualifying booking is `completed`, the earnings transfer exists, and the hold period has passed with no refund, dispute, or chargeback.
4. The helper can read the exact address only while the booking is `confirmed`, `in_progress`, `completion_submitted`, or `disputed`, and for 48 h after `completed`.
5. There is at most one active booking per one-time task, and at most one open change request per booking.

## 2. Task

```
draft ──publish──▶ open ──booking confirmed──▶ assigned ──booking completed──▶ completed
                   │  ▲                          │
                   │  └──── reopen (booking canceled before start, window still valid)
                   ├──poster cancels / support removes──▶ canceled ◀── booking canceled, not reopened
                   └──window ends or 14 days pass──▶ expired
```

| State | Poster can | Helper can | Support can | System |
|---|---|---|---|---|
| `draft` | Edit, delete, publish | — | — | Delete drafts after 30 days |
| `open` | Edit (a material edit to schedule, budget, or scope marks existing offers `stale`), invite helpers, accept an offer, cancel | View (bookable helpers see photos and details), send an offer, ask a question in the offer thread | Hide or remove, recategorize, strip photos | Send alerts to matching helpers; expire at window end |
| `assigned` | Manage via the booking | Manage via the booking | Via the booking | Mirror the booking outcome |
| `completed` / `canceled` / `expired` | Duplicate ("Post again"), Book again | — | View | Retain per data policy (**F20**) |

## 3. Offer and direct invite

**Offer** (helper → open task):

| State | Meaning | Poster can | Helper can | System |
|---|---|---|---|---|
| `pending` | Active, can be booked | Message, decline, **Book** (starts funding) | Edit (creates a revision), withdraw, message | Expire at window start or after 72 h |
| `stale` | The task changed materially | Message | Re-confirm or revise → `pending`, withdraw | Expire after 24 h |
| `accepted` | Its booking was confirmed | — | — | Auto-decline the other offers |
| `declined` / `withdrawn` / `expired` | Terminal | — | Send a new offer if the task is still open | — |

**Direct invite** (poster → one helper, funded by a short authorization):

| State | Meaning | Poster can | Helper can | System |
|---|---|---|---|---|
| `authorizing` | Card authorization in progress | Complete 3-D Secure | — | Becomes `auth_failed` on decline |
| `sent` | Authorized; waiting for the helper | Cancel (authorization released), message | **Accept**, decline, counter (price and/or time), message | Expire at 48 h or 2 h before start, whichever is first; release the authorization |
| `countered` | Helper proposed new terms | Accept the counter (re-authorizes if the total rises; the booking confirms immediately), decline, cancel | Withdraw the counter | Expire after 24 h |
| `accepted` | Captured; booking confirmed | — | — | Create the booking as `confirmed` |
| `declined` / `canceled` / `expired` / `auth_failed` | Terminal; authorization released | Invite someone else, post publicly | — | — |

Availability-slot requests and quick rebooks are direct invites with pre-filled fields. A slot is held while its invite is `sent` or `countered`.

## 4. Booking

```
pending_funding ──payment succeeded──▶ confirmed ──check-in──▶ in_progress
      │                                    │                       │
      └─TTL / failure─▶ canceled           ├────────complete───────┴──▶ completion_submitted
                                           └─cancel / no-show─▶ canceled        │      │
                                                                     approve / auto / support
                                                                                │      └─report problem─▶ disputed
                                                                                ▼                          │
                                                                            completed ◀──settle / release──┘
                                                                                          (rework → completion_submitted;
                                                                                           full refund → canceled)
```

`canceled` always carries a `cancel_reason`: `funding_failed`, `poster_early`, `poster_late`, `helper`, `helper_no_show`, `poster_no_show`, `refunded_in_dispute`, or `admin`. `completed` carries `completed_via`: `poster`, `auto`, `support`, or `settlement`.

| State | Poster can | Helper can | Support can | System |
|---|---|---|---|---|
| `pending_funding` | Pay, retry, abandon | Sees "Maya is booking you" | Cancel | On payment success → `confirmed`; after 30 min → `canceled (funding_failed)`, and the offer returns to `pending` |
| `confirmed` | Message; propose, accept, or decline a change; **cancel** (policy preview first); **report a no-show** once 30 min past start with no check-in or late update | Message; **read the address**; *On my way* / *Running late* / *Arrived* (check-in); propose a change; **cancel** (strike if < 24 h); submit completion (remote tasks) | Cancel with or without a policy override (reason required); extend timers; edit the schedule with both parties' consent | Reminders at T-24 h and T-2 h; enable no-show reporting at start + 30 min |
| `in_progress` | Message; change requests (for example, more hours); safety report | Message; change requests; **submit completion**; **Can't access** after a 20-minute wait (→ the poster has 30 min to respond, then `canceled (poster_no_show)`) | As above | No-show timers |
| `completion_submitted` | **Approve**; **report a problem** until `approval_due_at` | Message; add evidence | Approve on the poster's behalf (with a note); extend the window; open a case | Reminders 24 h and 4 h before the deadline; **auto-approve** at `approval_due_at` (job keyed by booking, re-checks state) |
| `disputed` | Reply in the case; accept or decline a settlement | Reply; offer **rework** (new visit time) or a **settlement** (a reduced final price) | Resolve: release in full, settle at a price, full refund, or rework; apply strikes | Hold the earnings transfer; track SLA timers |
| `completed` | Review; save the helper; **Book again**; report damage within 14 days (opens a case; any refund is platform goodwill, see 04 §6) | Review; **My clients**; offer to rebook | Goodwill refund (platform-funded); assemble chargeback evidence | Create transfers; refund unused cap or allowance; open the review window; evaluate rewards; hide the address after 48 h |
| `canceled` | **Find a replacement** (reopens the task) or post again | — | Add notes; reverse strikes on appeal | Apply refunds and fees per policy; void pending rewards; notify both people |

### 5. Change requests (both people must accept)

| State | Proposer can | Counterparty can | System |
|---|---|---|---|
| `proposed` | Withdraw | **Accept**, decline | Expire at booking start (before work) or after 24 h (during work) |
| `accepted_pending_funding` (total goes up) | — | Poster: **pay the difference** | Expire after 24 h; the previous terms stay in force |
| `applied` | — | — | Create a new `booking_terms` version. If the total goes down, refund the difference. Recalculate fees on the new price |
| `declined` / `withdrawn` / `expired` | — | — | Previous terms stay in force |

Change types: `price`, `scope`, `schedule`, `hours_cap`, `expense_allowance`, and `settlement` (final price during a dispute or partial completion). Every version shows both people the total cost, the helper's expected earnings, the fees, and the expenses before they accept.

## 6. Payment states

### 6.1 Poster payments (one row per funding attempt: booking, change, invite)

| State | Meaning | Poster can | Support or finance can | Driven by |
|---|---|---|---|---|
| `requires_confirmation` | Created; waiting on the poster's card or wallet | Confirm, complete 3-D Secure | — | Client confirmation |
| `processing` | Waiting for the provider result | Wait | — | Provider |
| `authorized` | Invite only: held, not captured | Cancel the invite | Cancel | Provider |
| `succeeded` | **Funded**: captured into the platform balance | See the receipt | Refund (support up to their limit; finance above it) | Provider webhook |
| `failed` | Declined | Retry or change method | — | Provider |
| `canceled` | Authorization released, or abandoned | — | — | System, provider |
| `partially_refunded` / `refunded` | Derived from refund rows | See refund details | Further refunds up to the remaining amount | Refund webhooks |
| Overlay: `chargeback_open` → `chargeback_won` / `chargeback_lost` | Card dispute filed with the bank | Contact support | Submit evidence (finance) | Provider dispute events |

### 6.2 Helper earnings (one row per transfer: earnings, reimbursement, cancellation compensation)

| State | Meaning | Helper sees | Support or finance can | Driven by |
|---|---|---|---|---|
| `not_due` | Booking not completed yet | "Pending completion" | — | — |
| `on_hold` | Dispute, chargeback, or risk hold | "On hold: we'll update you" | Release or keep the hold (reason required) | Cases, provider |
| `scheduled` | Transfer job queued | "Sending" | — | System |
| `transferred` | Transfer created to the helper's payout account | "Transferred: arrives on your payout schedule" | Reverse (finance only, with policy reason) | Provider |
| `paid_out` | Included in a bank payout | "Paid out to ••1234 on Nov 18" | — | Payout reconciliation job |
| `reversed` / `partially_reversed` | Clawed back under policy | Explanation and case link | — | Finance action plus provider |
| `failed` | Could not transfer (for example, payout account restricted) | "Action needed: update payout details" | Retry after the fix | Provider plus system retries |

Payouts mirror the provider's states (`pending`, `in_transit`, `paid`, `failed`, `canceled`) on the helper's connected account. A failed payout prompts the helper to update their bank account in the provider-hosted dashboard.

## 7. Recurring visits (phase 2; data model at launch)

A **series** (`booking_series`) holds cadence (weekly, every 2 weeks, monthly), weekday and time window, per-visit terms, and status: `active`, `paused`, `canceled`, or `ended`. Each **visit is its own booking** (`series_id`, `visit_index`), so all of §4 to §6 applies per visit. **Payment is tracked per visit.**

| Behavior | Rule (configurable) |
|---|---|
| Visit creation | Keep the next 4 visits materialized as `scheduled` placeholders (not yet bookings with money) |
| Funding | Charge the saved payment method off-session **48 h before each visit**. On failure, notify the poster and retry at 36 h and 24 h. If still unpaid at 12 h, skip the visit (no fees) and alert both |
| Skip one visit | Free up to 24 h before the window; inside 24 h the late-cancellation fee applies to that visit |
| Reschedule one visit | A change request on that visit; both must accept |
| Pause | Choose a resume date. Visits in between are skipped (free if ≥ 24 h ahead). The series stays `paused` until resume |
| Cancel series | All future unfunded visits are removed. A funded visit follows §4 cancellation rules |
| Helper can't make a visit | Skipping ≥ 48 h ahead is free with no strike. Inside 24 h it counts as a helper cancellation for that visit. Replacement matching (phase 2) offers a one-time substitute |
| Price or scope change | A series-level change request; applies to visits not yet funded |
| End | Either person can end with ≥ 7 days' notice; outstanding funded visits complete normally |

## 8. Reward grant

```
pending ──qualifying booking completed + transfer created──▶ qualified ──hold passes clean──▶ redeemable
   │                                                            │                               │
   ├──booking canceled / refunded / below threshold──▶ voided ◀─┘ refund, dispute, chargeback   ├──helper redeems──▶ issuing ──provider ok──▶ delivered
   │                                                                                              │                     └──provider fails──▶ failed ──retry / reissue──▶ issuing
   └──risk flag──▶ in_review ──approve──▶ (back to the prior state)   ──reject──▶ voided           └──not redeemed in 90 days──▶ expired
```

| State | Helper sees / can | Support can | System |
|---|---|---|---|
| `pending` | "$50 pending: unlocks after this task is completed and paid" | View; void (reason required) | Created when the qualifying booking is funded (welcome, acceptance, completion) or completed (repeat) |
| `qualified` | "Unlocking on Nov 22" | Void | Starts the hold. Any refund, dispute, or chargeback on the booking → `voided` or `in_review` |
| `in_review` | "Under review" | Approve or reject | Triggered by risk signals; budget counted as reserved |
| `redeemable` | **Redeem**, choose delivery email | Void (fraud), extend expiry | Expire after 90 days |
| `issuing` | "Sending your gift card" | — | Provider order created with an idempotent external id |
| `delivered` | Link to the gift card | Reissue on a delivery problem (new link, same order) | — |
| `failed` | "We're fixing this" | Retry or reissue | Automatic retry with backoff |
| `voided` / `expired` | Reason shown | Reinstate (lead only, audited) | Release the budget reservation |

Rules for each program (amounts, caps, stacking, cancellation) are in [05-rewards.md](05-rewards.md). **No transition reads review or rating data.**

## 9. Support case

| State | Participants can | Support can | System |
|---|---|---|---|
| `open` | Add details and evidence | Triage, set priority, assign | First-response SLA: disputes and safety reports within 4 business hours (safety is 24/7 on-call) |
| `awaiting_poster` / `awaiting_helper` | The named person replies | Remind, move on | Auto-reminder at 24 h; proceed on the evidence after 48 h |
| `awaiting_support` | Wait | Investigate: timeline, messages (access logged), evidence | Resolution target: 3 business days |
| `escalated` | Wait | Lead, finance, or trust and safety decides | — |
| `resolved` | Appeal once within 7 days | Record the resolution: `no_action`, `release_full`, `settle(price)`, `refund_full`, `rework`, `goodwill_refund`, `account_action`, or `reward_action` | Apply the money effects through the payments module; notify |
| `closed` | — | Reopen (lead) | Close 7 days after `resolved` |

Case types: `dispute`, `no_show`, `cancellation_review`, `report_user`, `report_content`, `safety`, `payment_issue`, `reward_issue`, `account`.

**From the support assistant (2026-11-22).** Members can ask TasksNearMe Help in Messages first: an AI answers from the help center and says when a person should take over. "Talk to a person" opens an ordinary request (`open`, the topic's type and first-response target; high priority for safety or a flagged danger) with the chat attached: the member's questions as their messages, the assistant's answers marked as the assistant's (never counted as support's reply), and a note for support. Only answers the server signed reach the case. Nothing about the chat is stored before that.

**Live chat (2026-11-22).** Every hand-off from TasksNearMe Help, and asking for one on an open case, puts the case in the live queue: `waiting` (`live_requested_at`; the member sees their place in line, or that no one is online) → `joined` (a support worker joins from `/admin/live`, or replies to the member from the case page; it's theirs, and assigned to them if nobody had it) → `ended` (the one on it, a lead, or anyone for one nobody joined; or the case is resolved or closed). The case's status moves as with any reply. After `ended` the member may ask again (back to `waiting`).
