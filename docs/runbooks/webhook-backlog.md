# Webhook backlog

Use this when provider events arrive late, fail, or stop arriving. You'll see it as payments stuck after a bank step, payout accounts or payouts not updating, ID or background checks that never finish, or bounces that don't suppress email. It's **SEV2** when events are more than 15 minutes behind, and **SEV1** when money events (payments, payouts, chargebacks) have stopped for more than an hour.

**Who:** the on-call engineer. Finance watches the money side; a support lead answers the people waiting.

## The endpoints

Each endpoint answers **404 until its keys are set**, so a missing environment variable looks like "Stripe says our endpoint is gone".

| Route | Provider | Needs | Signature | Handles |
|---|---|---|---|---|
| `/api/webhooks/stripe` ([route](../../src/app/api/webhooks/stripe/route.ts)) | Stripe | `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY` | `stripe-signature` header | `payment_intent.*` and `charge.dispute.*` → [stripe-webhooks.ts](../../src/modules/payments/stripe-webhooks.ts); `account.updated` and `payout.*` → [connect.ts](../../src/modules/payments/connect.ts) (signed with `STRIPE_CONNECT_WEBHOOK_SECRET`, or the main secret); everything else → Stripe Identity ([verification/webhooks.ts](../../src/modules/verification/webhooks.ts)) |
| `/api/webhooks/checkr` | Checkr | `CHECKR_API_KEY` | `X-Checkr-Signature` (HMAC with the API key) | Background check results |
| `/api/webhooks/resend` | Resend | `RESEND_WEBHOOK_SECRET` | svix headers (401 if bad) | Bounces and complaints → `email_suppressions` |

Not built: a Postmark bounce webhook (if Postmark is the sender, bounces aren't suppressed) and a Tremendous webhook (gift-card deliveries are read from the order response).

**What each answer means to the provider:**
- **400**: bad signature or unreadable body. Providers don't retry a 400 for long. A run of 400s means the signing secret is wrong.
- **200 `{ ok: true, ignored: true }`**: an event we don't handle, or one for an object we don't know. Not retried.
- **500**: our handler threw (the database was down, or Stripe's API failed while we re-read the object). The provider retries with backoff: Stripe for up to 3 days.

**Watch out:** if the booking dependencies aren't available (`bookingDeps()` returns nothing, for example when `STRIPE_PUBLISHABLE_KEY` is missing in production), `payment_intent.*` and `charge.dispute.*` events get a 200 "ignored" **and Stripe won't send them again**. Chargebacks would then open no case. After fixing the key, replay those events from the Stripe Dashboard.

## The inbox

Every signed event goes through the webhook inbox (`webhook_events`, [src/modules/webhooks/inbox.ts](../../src/modules/webhooks/inbox.ts)):
- It's recorded once by `(provider, event id)`. A redelivery of a processed event is acknowledged with `{ ok: true, duplicate: true }` and not run again.
- A bad signature or an endpoint that's off isn't recorded.
- When processing throws, the event becomes `failed`: its payload is kept, the endpoint answers 500 (so the provider retries too), and the `webhooks.retry` job tries again after 5 minutes, 30 minutes, 2 hours and 12 hours. After that it's `dead`.
- **`/admin/webhooks`** (admins and finance) shows the last 24 hours per provider and every failing or dead event, with its last error. **Replay** runs it again; **Dismiss** takes it off the list when nothing more is needed. Both are in the audit log (`webhook.replayed`, `webhook.dismissed`).
- Retries and replays sign the stored payload again with our own secrets, so they pass the same checks as a delivery.

Running an event twice is safe anyway, because every handler only moves state forward:
- Payment events act only on a payment still in `requires_confirmation`, and re-read the PaymentIntent from Stripe instead of trusting the payload.
- Payouts are upserted by `provider_ref`; a payout marks earnings `transferred` → `paid_out` once.
- Chargebacks are deduped through the audit log (`action` `payment.chargeback_opened` or `payment.chargeback_closed`, `target_id` = the Stripe dispute id), so a replay doesn't open a second case.
- A background check stops at its final result (`clear`, `consider`, `canceled`, `expired`); a replay after that changes nothing ([src/modules/verification/tracks.ts](../../src/modules/verification/tracks.ts)).

## First 15 minutes

1. **Look at the inbox, then the provider's side.** `/admin/webhooks`: is anything failing or dead, and what's the error? Are events arriving at all (the last 24 hours per provider)? Then the Stripe Dashboard → Developers → Webhooks → the endpoint: failed deliveries, the response codes, and the time of the oldest pending event (Checkr and Resend have the same view). Events that never reached us are only there.
2. **Read the response codes.**
   - **404:** an environment variable is missing on the running deploy. Check the four above and redeploy.
   - **400:** the signing secret doesn't match. A rolled secret in the dashboard needs the new value in the environment. Connect events use their own secret.
   - **500 or timeouts:** our handler is failing. Check the server logs for the thrown error, and check the database is reachable.
   - **No deliveries at all:** the endpoint was disabled at the provider (Stripe disables endpoints that fail for days), or its URL is wrong.
3. **Check the symptoms in the app.**
   - Payments stuck in `requires_confirmation`: `select count(*) from payments where status = 'requires_confirmation' and updated_at < now() - interval '15 minutes';`
   - Payout accounts not updating (helpers stuck on "pending"), or payouts not moving (`payouts.status` stays `pending` or `in_transit` well past its date).
   - `/admin/payments` → Exceptions growing (`payout_failed`, `transfer_missing`).
4. **Declare the level** ([severity](README.md#severity)) and tell support what people may see: "Your payment is being confirmed. It can take a few minutes."

## Fix and catch up

1. Fix the cause: the environment variable, the secret, the database, or our bug.
2. **Replay what failed.** Events that reached us retry on their own; replay the dead ones from `/admin/webhooks` once the cause is fixed. Events that never reached us (a 404 or a 400 at the provider): resend them from the Stripe Dashboard's endpoint page, or with the Stripe CLI (`stripe events resend <id>`) for a long outage. Checkr can resend a report's webhook from its dashboard. Stripe keeps events for 30 days.
3. Watch the symptoms clear: the `requires_confirmation` count, then the exceptions.
4. **Anything older than the provider's retry window** won't come back by itself.
   - Payments: open each one at `/admin/bookings/[bookingId]` and compare with the PaymentIntent in Stripe. An engineer can finish one by re-running the handler for that PaymentIntent.
   - Payouts: they update on the next `payout.*` event for that account, or by hand.

## Not webhooks, but looks the same

- **Notifications not going out.** That's the outbox, not a webhook: `outbox_events` rows with `dispatched_at is null` piling up mean the `notifications.dispatch` job is failing (look for `[jobs] notifications.dispatch failed`). Failed deliveries retry at 5, 30 and 120 minutes and then stay `failed` in `notification_deliveries`; the person page's "Emails and texts" shows them.
- **Every timer stopped** (auto-approval, reminders, expiries): the job runner isn't running. Check that `JOBS_DISABLED` isn't set, and look for `[jobs] run failed` in the logs ([src/modules/jobs/runner.ts](../../src/modules/jobs/runner.ts)). Only one instance runs jobs at a time (advisory lock `72_200_001`), so a stuck transaction holding that lock stops them everywhere.

## Afterwards

Write the incident note ([README](README.md#after-every-sev1-or-sev2)). Before launch, blueprint 10 §5 asks for "webhook processing lag p95 < 1 min with an empty dead-letter queue": `/admin/webhooks` should show nothing dead.
