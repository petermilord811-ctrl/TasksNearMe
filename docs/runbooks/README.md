# Runbooks and on-call

What staff and the on-call engineer do when something goes wrong in production (blueprint 11, B-066). Each runbook names the staff pages, jobs, tables and code paths involved, so you can check what the app did before you act.

| Runbook | Use it when |
|---|---|
| [Payments incident](payments-incident.md) | Charges, scheduled charges, transfers or payouts fail, or Stripe is down. Includes the tabletop exercise for a payments outage. |
| [Webhook backlog](webhook-backlog.md) | Stripe, Checkr or Resend events arrive late, fail, or stop. |
| [Dispute handling](dispute-handling.md) | A client reports a problem with a booking, or a bank opens a chargeback. |
| [Reward fraud review](reward-review.md) | Gift-card rewards are under review, show risk signals, or fail to deliver. |
| [Safety escalation](safety-escalation.md) | Someone reports a safety problem, or an exact address or message may have reached the wrong person. |
| [Gainesville launch day](gainesville-launch.md) | Taking Gainesville (or the next city) live, watching its waitlist emails, and rolling a launch back. Rehearsed 2026-11-21. |
| [Staff handbook](staff-handbook.md) | Working the staff tools from launch day: ID photos and proofs of address, the support queue, refunds and disputes, hiding content, suspensions and bans, and what staff never do. Walked on the e2e build 2026-11-21. |
| [Email or texts down](email-and-sms-down.md) | Postmark, Resend or Twilio refuse or don't answer: sign-in codes, notifications, pages. |
| [Stripe errors and late webhooks](stripe-errors.md) | Paying fails, Stripe is slow, or its events arrive late or not at all. |
| [Background jobs stall or crash](job-runner.md) | A job keeps failing, the runner is stuck, or a server stopped mid-run. |
| [The database is unreachable](database-unreachable.md) | Postgres stops answering. |
| [Live updates stop](realtime-dropping.md) | Open pages stop updating by themselves. |
| [A deploy rolled back](deploy-rollback.md) | A deploy switched back, by `deploy.sh` or by hand, while people were using the site. |
| [Backups and restoring](backup-and-restore.md) | Turning on the nightly backup, checking it runs, or getting data back after a mistake or a lost server. |

## Who is on call

Blueprint 10 §5 asks for these before launch. Fill in the names before the beta starts.

| Duty | Hours | Who | Authority |
|---|---|---|---|
| Support | Published support hours (for example 8 am–8 pm Eastern, daily: Gainesville's time zone) | Support agents, with a support lead | Refunds up to $100 per booking (agents) or $500 (leads) without approval |
| Safety escalation | 24/7 | Trust & safety on-call | Suspend helpers, read restricted data with a reason, call emergency services |
| Money | Business hours, plus paging for a SEV1 | Finance | Any refund; approves refunds above $500 (never their own) |
| Engineering | 24/7 for SEV1 | On-call engineer | Production logs, the database (read first), provider dashboards, deploys |

## Severity

| Level | Examples | Response |
|---|---|---|
| **SEV1** | Someone is unsafe now. Money moves wrongly: double charges, a transfer to the wrong person, refunds failing in bulk. An exact address or private messages reached the wrong person. Every payment is failing. | Start at once, any hour. Page the on-call engineer and the duty lead, and open an incident channel. |
| **SEV2** | Part of the service is degraded: some charges failing, a webhook backlog over 15 minutes, payouts delayed, the jobs runner stopped. | Within 1 hour in support hours. Page the engineer if money is piling up. |
| **SEV3** | A single booking or person is affected, and a workaround exists. | Work it through the normal queues (`/admin/cases`). |

## Where to look

| What | Where |
|---|---|
| Cases by queue, and response targets | `/admin` (queues), `/admin/cases`, `/admin/response-times` (first reply 4 h for disputes and safety, 24 h otherwise; resolution 72 h) |
| Money exceptions | `/admin/payments` (tabs: exceptions, charges, refunds, transfers, payouts), `/admin/bookings/[bookingId]` |
| Rewards | `/admin/rewards?status=in_review`, `failed` or `all` |
| A person | `/admin/users/[userId]` (verification, strikes, suspension, emails and texts) |
| Who did what | `/admin/audit` (admins and support leads only) |
| Market health | `/admin/metrics` (the launch targets, the funnel, liquidity, reward spend) |
| Feature flags and policies | `/admin/config` (admins only) |
| Background jobs | `/admin/jobs` (admins and finance): each job's last runs on this server since it started. The on-call pages for a job that keeps failing or a stuck run; otherwise server logs: lines starting `[jobs] <name> failed` ([src/modules/jobs/runner.ts](../../src/modules/jobs/runner.ts)). Logs carry no personal details: a failed query shows its statement without its values, and emails, phones and secrets are masked ([src/platform/redact.ts](../../src/platform/redact.ts)) |
| Is it up? | `/api/health`: 200, or 503 with the part that's down (the database, the job runner), for an outside monitor |
| Provider events | `/admin/webhooks` (admins and finance): the webhook inbox's failing and dead events, with replay and dismiss. Older history and events that never reached us: each provider's dashboard |

## Built-in gaps

These aren't built yet, so the runbooks handle them by hand. Close them before the gaps cost more than the manual steps.

- **Jobs have no lasting history.** `/admin/jobs` shows the last runs since the server started, the runner pages for a job that keeps failing or a stuck run, and the log has the rest; nothing is kept across restarts.
- **Nothing outside watches the site.** The pager needs the database, so a database that's down, or a server that's gone, pages no one until an outside monitor calls `/api/health` (decisions, 2026-11-21).

## After every SEV1 or SEV2

1. Write a short incident note: timeline, impact (people, bookings, money), what fixed it, and what would have caught it sooner.
2. Store it with the team's incident notes (`docs/runbooks/incidents/YYYY-MM-DD-<slug>.md` until there's a better home).
3. Turn each "would have caught it" into a backlog item. Most of them are the gaps above.
