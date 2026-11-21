# A deploy rolled back mid-traffic

A Ship run deploys with `deploy/preview/deploy.sh` (runbook: deploy/preview/README.md). What it does, in order:
1. migrates the database and seeds it;
2. switches the `current` link to the new release and restarts `tasksnearme-preview`;
3. checks `/`, `/es` and `/sign-in`;
4. if they don't answer, links the previous release again and restarts (automatic rollback);
5. keeps the 3 newest releases.

By hand: `sudo -u tnm-preview ln -sfn /srv/tasksnearme-preview/releases/<sha> /srv/tasksnearme-preview/current`, then `sudo systemctl restart tasksnearme-preview` (a VPS shell; the deploy key can only run `deploy.sh`).

Severity: **SEV2** while people get errors; usually a minute.

## What a restart does to traffic

There's one server process, so each switch (and each rollback) restarts it.

| What | What happens |
|---|---|
| Requests in flight | Cut. Caddy answers `502` for the few seconds until the new process listens. A form submitted then shows its error, and nothing half-done is saved. |
| Live updates | Streams drop. Signed-in pages, task boards and community pages reconnect by themselves within 10 to 60 s. The landing page's live map needs a reload. |
| A job run in progress | Cut, and safe: [Background jobs stall or crash](job-runner.md), "What happens to work in flight". |
| Provider webhooks during the restart | Answered `502` and sent again by the provider. |

## The database doesn't roll back

Migrations are forward-only, and `deploy.sh` runs them **before** switching. A rollback therefore runs the previous release on the **new** schema. That's only safe when each migration works with the release before it: add columns (nullable, or with defaults) and tables first; drop or rename only in a later deploy, once no live code reads them. Decisions, 2026-11-21. A migration that breaks the previous release turns a rollback into an outage. If that happened:
1. Fix forward with a new migration and release.
2. Don't hand-edit the schema: the migration journal would no longer match.

## After a rollback

1. Note which release is live: `readlink /srv/tasksnearme-preview/current`.
2. Check:
   - `curl -s https://tasksnearme.com/api/health`;
   - `/admin/webhooks` (events refused during restarts are redelivered);
   - the **exceptions** tab of `/admin/payments`.
3. The failed release's migrations stay applied, so the next deploy must include them. Ship the fix on top; don't revert the migration commit.
