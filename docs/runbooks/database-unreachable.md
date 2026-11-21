# The database is unreachable

The app's Postgres (`tasksnearme_preview` in the `tasksnearme-db` container) stops answering: the container restarted, the disk filled, connections ran out, or the network dropped. Severity: **SEV1** while it lasts. Everything that reads or writes stops, but nothing is lost: people retry, providers redeliver, jobs catch up.

## How you find out

- **Nothing in the app can page you.** The on-call pager needs the database for its contacts and its once-only keys. An outside check has to catch this: a monitor calling `https://tasksnearme.com/api/health` every minute, paging when it isn't `200`. `/api/health` answers `503` with `{"database":"down"}` within 3 seconds while the database is away. Setting the monitor up is a decision for the owner (decisions.md, 2026-11-21).
- People report errors. Pages show "Something went wrong on our side" with **Try again** and the way home; the reference on that page is the error's digest, which matches the server log.
- The server log (`journalctl -u tasksnearme-preview -f`):
  - `[db] an idle connection was lost: Connection terminated unexpectedly`: the pool dropped a connection. Logged, not fatal: the server keeps answering (before 2026-11-21 this ended the process).
  - `[jobs] run failed`: the job runner couldn't start its minute.
  - `[realtime] listener …; reconnecting`: live notices are paused.

## What people get meanwhile

| Where | What happens |
|---|---|
| Pages | The error page within a second or two (a request gives up on the database after 5 s at most), in the page's language. |
| Forms and actions | Their error: "We couldn't complete that action. Try again, or contact support…". Nothing half-done is saved. |
| Live updates | Paused. Open pages keep what they show. |
| Background jobs | No runs. Expiries, scheduled charges, notifications and transfers wait. |
| Provider webhooks | Answered `500`. Stripe, Resend, Checkr and Persona send them again later (Stripe for 3 days). |

## Recovery

Once Postgres answers again, everything comes back by itself:
- connections reopen on the next request;
- **Try again** on the error page reloads it (0.8 s in the rehearsal);
- the realtime listener reconnects, backing off from 1 to 30 seconds;
- the job runner's next minute runs everything that came due: scheduled charges before their deadlines, expiries, the notification backlog.

## What to do

1. Confirm it's the database: `docker ps --filter name=tasksnearme-db` (running? restarting?), `docker logs --tail 50 tasksnearme-db`.
2. Common causes:
   - **Disk full:** `df -h /var/lib/docker`.
   - **Connections exhausted:** `select count(*), state from pg_stat_activity group by state`. The app uses at most 10 per server, plus one for live notices.
   - **The container stopped:** `docker start tasksnearme-db`.
3. When it's back, check that the app answers: `curl -s https://tasksnearme.com/api/health` should give `{"ok":true,"database":"ok",…}`.
4. Afterwards:
   - read `/admin/webhooks` (events failing while it was down are retried, and dead ones page);
   - read the **exceptions** tab of `/admin/payments`;
   - check scheduled charges whose deadline passed during the outage. They were canceled as `funding_failed`; see [Payments incident](payments-incident.md).
5. Write the incident note (README, "After every SEV1 or SEV2").

## Rehearsed

2026-11-21 on the e2e build, with the database cut off for one server for a minute (sweep, "When things break", J-O). The error page came in 169 ms, the server answered all minute, and **Try again** brought the page back 0.8 s after the database returned.
