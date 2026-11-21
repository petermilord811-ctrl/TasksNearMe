# Stripe errors and late webhooks

Stripe answers with errors (5xx, rate limits), doesn't answer (our client gives up after 30 s), or its webhooks arrive late, out of order, or not at all. Severity: **SEV1** if every payment is failing or money moves wrongly; **SEV2** if some charges fail or webhooks are late by more than 15 minutes. The money queries and the tabletop exercise are in [Payments incident](payments-incident.md); replaying events is in [Webhook backlog](webhook-backlog.md).

## How you find out

- Clients report that booking fails.
- **A page: "Provider events failed for good".** Stripe events failed 5 times and stopped retrying. At most one page a day while any are dead.
- `/admin/webhooks` (admins and finance): failing and dead events, counts per provider for the last day, replay and dismiss.
- The **exceptions** tab of `/admin/payments`: failed refunds, a failed payout, bookings completed over 2 days ago with no transfer, canceled bookings paid and not refunded.
- Stripe's status page and dashboard.

## What people get meanwhile

| Flow | What happens |
|---|---|
| Booking and paying | The confirm page's error: "We couldn't complete that action. Try again, or contact support if it keeps happening." Nothing is booked. If the money did move before the error, the webhook settles the payment when it arrives, and a payment that comes in for a booking that no longer goes ahead is refunded by itself. **Trying again is refused** ("This action isn't available to you…") until that first attempt is settled or its 30-minute hold ends: an attempt whose charge never answered still counts as in flight. Support can tell the client to wait half an hour. The fix is a decision (sweep, "When things break"). |
| Scheduled charges (bookings more than 14 days out) | A charge with no answer is asked again 10 minutes later with the same idempotency key, never twice. A decline is retried at 48 h; still unpaid 24 h before, the booking is canceled and the task opens again. |
| Transfers to helpers | Retried each run with `transfer:<id>`. A booking without one after 2 days shows on the exceptions tab. |
| Late or out-of-order webhooks | Each event is recorded once by its id, a repeat is acknowledged, and handlers act only from the state they expect. A late "succeeded" for a canceled payment refunds it. |

## What to do

1. During a Stripe outage, pause new bookings in the affected markets with the outage switch (`/admin/config`, admins, with a reason). People see that bookings are paused and nothing is charged; bookings they already have go ahead.
2. When Stripe is back:
   - turn the switch off;
   - replay dead events on `/admin/webhooks` (failing ones retry by themselves after 5 m, 30 m, 2 h and 12 h);
   - check the exceptions tab;
   - run the checks in [Payments incident](payments-incident.md): charges stuck in `processing`, transfers missing.
3. Webhooks not arriving at all: check the endpoint and its signing secrets in Stripe's dashboard (`STRIPE_WEBHOOK_SECRET`, and the Connect secret). Events with a bad signature aren't recorded, so `/admin/webhooks` can't show them.

## Rehearsed

2026-11-21 on the e2e build, with the payment stand-in failing on purpose (`/dev/faults`; sweep, "When things break"):
- paying showed the error above and kept the attempt as `processing`;
- paying again once the provider was back was refused, as described.
