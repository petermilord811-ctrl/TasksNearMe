# Payments incident

Use this when card charges, scheduled charges, refunds, transfers to helpers or payouts fail, or when Stripe itself is degraded. Money incidents are **SEV1** when money moves wrongly (a double charge, a transfer to the wrong helper, refunds failing in bulk) or when every charge fails, and **SEV2** otherwise ([severity](README.md#severity)).

**Who:** the on-call engineer leads. Finance owns every money decision (refunds above $500, manual claw-backs, reconciliation). A support lead handles the messages to clients and helpers.

## How money moves (what can break)

| Step | What the app does | Where it's recorded | When it fails |
|---|---|---|---|
| Booking payment | The client pays when booking. The booking is `pending_funding` until the payment succeeds, then `confirmed`. | `payments` (`purpose='booking_funding'`, `status`, `failure_code` `payment_declined` or `insufficient_funds`) | The client sees friendly copy and can retry. Unpaid after 30 minutes, the `bookings.expire_unfunded` job cancels the booking (`cancel_reason='funding_failed'`) and the offer is open again. |
| Scheduled charge | Regular visits are charged 48 h before (retries at 36 h and 24 h); one-time bookings made more than 14 days ahead are charged 72 h before (retry at 48 h). Job `bookings.scheduled_charges` ([src/modules/bookings/scheduled.ts](../../src/modules/bookings/scheduled.ts)). | `bookings.funding_attempts`, `funding_failure`, `funding_due_at`; one `booking.funding_failed` notification | Still unpaid at `funding_expires_at`: `bookings.scheduled_deadlines` skips the visit (series) or cancels and reopens the booking. The client has "Pay now" on the booking page until then. |
| Invite hold | Direct invites place a hold that's captured when the helper accepts. | `payments` (`purpose='invite_authorization'`, `status='authorized'`) | The invite shows "Payment failed". Holds are released on decline or expiry (`invites.expire`). |
| Refund | Staff refunds, case resolutions and cancellations call `refundCharge` ([src/modules/support/staff-money.ts](../../src/modules/support/staff-money.ts)). | `refunds` (`status` `pending`, `succeeded`, `failed`); the payment becomes `partially_refunded` or `refunded` | Shows on `/admin/payments` → Exceptions as `refund_failed`. |
| Transfer to the helper | After completion the helper's earnings are `scheduled`; job `earnings.transfers` sends up to 50 a minute through Stripe Connect (idempotency key `transfer:<earningsId>`) ([src/modules/payments/connect.ts](../../src/modules/payments/connect.ts)). Only runs when the Stripe keys are set. | `earnings` (`status` `scheduled` → `transferred` → `paid_out`) | An error logs `Transfer <id> failed; it will be retried` and the row stays `scheduled`. A helper whose payout account isn't `active` waits. More than 2 days after completion with nothing transferred shows as `transfer_missing`. |
| Payout to the bank | Stripe pays out the connected account; `payout.*` webhooks update our rows. | `payouts` (`pending`, `in_transit`, `paid`, `failed`, `canceled`) | `payout_failed` on Exceptions; the helper sees "Action needed" on Earnings. |

The provider is Stripe only when both `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` are set. In production without them the app takes no payments at all, because it refuses the development stand-in ([src/integrations/payments/index.ts](../../src/integrations/payments/index.ts)).

## First 15 minutes

1. **Is it us or Stripe?** Check [status.stripe.com](https://status.stripe.com) and the Stripe Dashboard's Developers → Logs for API errors (5xx, timeouts, `rate_limit`). Then check our server logs for `[jobs] bookings.scheduled_charges failed` or `[jobs] earnings.transfers failed`, and for thrown errors in the booking pay action.
2. **How big is it?** Run the read-only queries below: failures in the last hour by code, scheduled charges waiting, earnings stuck at `scheduled`.
3. **Declare the level.** Every charge failing, or any double charge, is SEV1. Open the incident channel and name the lead.
4. **Stop making it worse.**
   - A bug of ours moving money wrongly (double charges, transfers to the wrong person): ask the engineer to stop the job runner with `JOBS_DISABLED=1` and a restart ([src/instrumentation.ts](../../src/instrumentation.ts)). This also stops auto-approval, reminders, notifications and retention, so note the time and restart the runner as soon as the bug is fixed. Every job is safe to rerun.
   - Stripe being down: don't stop anything. Charges fail cleanly, scheduled charges retry on their plan, and transfers retry every minute.
   - **No switch pauses new bookings** ([gaps](README.md#built-in-gaps)). If clients keep paying into a broken flow, the engineer can deploy a maintenance banner.
5. **Tell people what to expect.** Use the copy below, and post it before the queues fill up.

## Read-only queries

Run them against a read replica, or with a read-only role.

```sql
-- Booking and change payments in the last hour, by outcome.
select purpose, status, failure_code, count(*)
from payments where created_at > now() - interval '1 hour'
group by 1, 2, 3 order by 4 desc;

-- Scheduled charges due or failing (series visits and far-ahead bookings).
select id, series_id, funding_due_at, funding_expires_at, funding_attempts, funding_failure
from bookings where status = 'scheduled' and funding_due_at < now() + interval '6 hours'
order by funding_expires_at;

-- Earnings waiting to be transferred, oldest first.
select e.id, e.booking_id, e.helper_user_id, e.amount_cents, e.created_at, pa.status as payout_account
from earnings e left join payout_accounts pa on pa.user_id = e.helper_user_id
where e.status = 'scheduled' order by e.created_at limit 100;

-- Payments that a person has to refund: a second tip, or a change paid after its terms moved on.
-- Nothing turns these events into cases yet, so finance checks them daily.
select id, aggregate_id as payment_id, payload, created_at
from outbox_events where type = 'payment.refund_needed' and created_at > now() - interval '7 days'
order by created_at desc;

-- Possible double charges: more than one successful funding payment on one booking.
select booking_id, count(*), sum(amount_cents)
from payments where purpose = 'booking_funding' and status in ('succeeded', 'partially_refunded')
group by booking_id having count(*) > 1;
```

## Fixes by symptom

**Charges failing for everyone (Stripe outage or a bad key)**
- A key rotated or revoked: restore it in the environment and redeploy. The Stripe Dashboard's API keys page shows when it was rolled.
- A Stripe outage: wait. Clients see "Your card was declined…" copy on some errors; support tells anyone who writes in to try again later. Unpaid bookings expire after 30 minutes and their offers reopen.
- After recovery: count the `pending_funding` bookings that expired during the window (`cancel_reason='funding_failed'`, `canceled_at` in the window). Support writes to those clients with a link to book again.

**Scheduled charges failing**
- Retries follow the plan: series visits at 36 h and 24 h before, far-ahead bookings at 48 h. If an outage eats the retries, a visit is skipped (or a booking canceled) at its deadline. Before the deadline, a support lead can ask the client to use "Pay now" on the booking page.
- Many failures with `requires_bank_verification`: Stripe wants 3-D Secure. The client has to pay on the booking page; off-session retries won't succeed.

**Transfers stuck at `scheduled`**
- The payout account isn't `active` (the helper's onboarding at Stripe is incomplete or restricted): the helper's Earnings page says so. Support points them to Payouts.
- Stripe errors in the logs: transfers retry every minute with the same idempotency key, so a retry never pays twice. A platform balance that's too low (`balance_insufficient`) needs finance to top up the Stripe balance, or to wait for the client charges to settle.
- `transfer_missing` on Exceptions more than 2 days after completion: open the booking (`/admin/bookings/[bookingId]`) and check the helper's payout account, then the logs for that earnings id.

**Payouts failed**
- `payout_failed` and "Action needed" for the helper: almost always bank details. The helper fixes them in Stripe's hosted page (Earnings → Payouts); Stripe retries the payout. We never store bank details.

**A refund failed**
- Shows as `refund_failed` on Exceptions. Retry from the booking's refund tool: each click gets a fresh key (`refund:<booking>:staff:<id>`), so a retry is a new attempt.
- **A refund from a case resolution can't be retried by resolving again.** Its key is `refund:<booking>:case:<caseId>`; once that attempt failed, resolving again answers `unknown`. Use the booking's refund tool for the amount, note the case id in the reason, and add an internal note to the case.
- Limits: agents up to $100 per booking, leads and finance up to $500 without approval. Above your limit the tool files a refund request; a support lead approves up to $500, finance any amount, and never the person who asked ([src/modules/support/staff-domain.ts](../../src/modules/support/staff-domain.ts)). Each staff member can make 20 refunds an hour.

**A double charge (SEV1)**
1. Stop the runner if a job caused it (step 4 above).
2. Refund the duplicate in full from the booking's refund tool, with the reason goodwill and the note "duplicate charge". Finance confirms in the Stripe Dashboard that the client got one refund for each duplicate.
3. Find the cause before restarting the runner. Each funding payment has a unique `idempotency_key`; two successful rows on one booking mean two different keys, so look for the code path that made the second one.

**A transfer to the wrong helper, or one paid twice (SEV1)**
- The app can't reverse transfers ([gaps](README.md#built-in-gaps)). Finance reverses the transfer in the Stripe Dashboard (Connect → the account → Transfers → Reverse) and records the case link. Then mark it in our data with the engineer, because `earnings.status` won't change on its own.

## What to tell people

- **Clients, payments failing:** "Payments aren't going through right now because of a problem with our payment provider. You haven't been charged for any booking that didn't confirm. Please try again in a little while."
- **Helpers, transfers delayed:** "Transfers to helpers are delayed by a problem with our payment provider. Your earnings are safe and will be sent as soon as it's fixed. Nothing is needed from you."
- **One client, double-charged:** "You were charged twice for this booking by mistake. We've refunded {amount}; it usually shows on your statement within 5–10 business days."

## After the incident

1. Reconcile with finance: every `payments` row changed in the window against the Stripe Dashboard (charges, refunds), and every `earnings` row against Connect transfers.
2. Restart the runner if it was stopped, and watch one full minute of `[jobs]` logs.
3. Write the incident note ([README](README.md#after-every-sev1-or-sev2)).

## Tabletop exercise: a payments outage

B-066 is done when the team has run this exercise once. Run it with the on-call engineer, a support lead and finance, in about 45 minutes. Read each step out, and let the team answer from this runbook and the staff pages before you move on.

| Time | What happens | What the team should do |
|---|---|---|
| 0:00 | Saturday 10:15 am. Support gets three messages in ten minutes: "my card keeps getting declined." `/admin/payments` → Charges shows `failed` payments with `payment_declined`. | Check Stripe's status page and API logs. Run the outcome query. Decide: is it a few cards or everyone? |
| 0:05 | Stripe's status page reports elevated API errors. 80% of charges in the last 30 minutes failed. | Declare SEV1. Name the lead. Don't stop the runner (it's a provider outage). Post the client copy. |
| 0:15 | 14 bookings are `pending_funding`; their 30-minute window is running out. Two clients ask whether they were charged. | Explain the expiry: offers reopen, nobody is charged for a booking that didn't confirm. Answer from the copy. |
| 0:25 | 9 regular visits are due their 48-hour charge today. | Check `funding_attempts` and the retry plan (36 h, 24 h). Nothing to do yet; note the deadline. |
| 0:35 | Stripe recovers. The logs show `earnings.transfers` catching up. | Watch transfers move to `transferred`. Count the expired bookings and plan the follow-up message. |
| 0:40 | A helper writes: "I was paid twice for Thursday's job." | Treat as SEV1: run the double-transfer check, reverse in the Stripe Dashboard (no in-app reversal), and write the case note. |

Debrief questions:
- Who noticed first, and how could we have known sooner? (No alerting exists on the failure rate.)
- Did anyone need a switch to pause booking? (None exists.)
- Were the refund limits and approvals clear to everyone?

Record each run here:

| Date | Facilitator | Who took part | Findings | Backlog items |
|---|---|---|---|---|
| | | | | |
