# Background jobs stall or crash

The job runner (`src/modules/jobs/runner.ts`) runs every minute in the server process. It handles:
- offer, task, booking and invite expiries;
- scheduled charges and their deadlines;
- auto-approval and completion money;
- reminders;
- notifications and their emails and texts;
- webhook retries and on-call page retries;
- privacy requests, retention, gift cards, transfers, and the reading of IDs and proofs.

One Postgres advisory lock lets one server run them at a time. Severity: **SEV2** (things that should happen on time don't). **SEV1** if charges or transfers pile up past their deadlines.

## How you find out

- **A page: "A background job keeps failing".** One job failed 3 runs in a row. It names the job; at most one page a day per job.
- **A page: "The background jobs are stuck".** A run started more than 10 minutes ago and hasn't finished, so no job runs. Usually a provider call or a query that hangs. At most one a day.
- `/api/health` says `"jobs":"stalled"` (for an outside monitor).
- The server log: `[jobs] <name> failed` with the error. Logs carry no personal details: a failed query shows its statement without its values, and emails, phones and secrets are masked.

Pages need the database. If it's down, see [The database is unreachable](database-unreachable.md).

## What happens to work in flight when the server stops (a crash, a deploy)

| Work | Safe because |
|---|---|
| A scheduled charge | The job claims the booking for 10 minutes, not for good. The next run asks the payment provider about the open attempt with the same idempotency key: no second charge, and the booking doesn't wait unseen for its deadline (since 2026-11-21). |
| Unfunded bookings expiring | Canceling the booking, closing its payment and telling people happen in one transaction. |
| Auto-approval | Completing the booking, its task, its conversation line and its notices happen in one transaction. The money after it is swept again by `bookings.completion_money` if it didn't finish. |
| Transfers | `transfer:<id>` idempotency keys: a retry within 24 h doesn't pay twice. |
| Notifications | Outbox claims are taken again after 5 minutes, a delivery stuck in `sending` after 10. |
| Webhook events | Kept with their payload and retried after 5 m, 30 m, 2 h and 12 h. After 5 tries they're dead and page on call. |

## What to do

1. Find the job and its error: `journalctl -u tasksnearme-preview --since "-1h" | grep '\[jobs\]'`.
2. Provider errors (Stripe, Postmark or Resend, Twilio, Claude): see [Stripe errors](stripe-errors.md) or [Email or texts down](email-and-sms-down.md). The job retries every minute by itself; nothing to replay.
3. A stuck run:
   - see who holds the lock: `select pid, state, now() - query_start as running, left(query, 80) from pg_stat_activity where datname = current_database() and state <> 'idle' order by query_start;`
   - restart the server: `sudo systemctl restart tasksnearme-preview`. Safe, per the table above, and the next minute runs everything due.
4. A job doing damage: add `JOBS_DISABLED=1` to `preview.env` and restart. **Nothing** runs then (no expiries, charges or notifications), so fix forward quickly and remove it.
5. Check what came due while the jobs were down:
   - **Scheduled charges past their deadline** were canceled as `funding_failed`: [Payments incident](payments-incident.md).
   - Read the **exceptions** tab of `/admin/payments` and `/admin/webhooks`.

## Gaps

There's no jobs dashboard or run history (README, "Built-in gaps"), only the pages and the log. A job that keeps failing pages once a day, so check the log for whether it's still failing.
