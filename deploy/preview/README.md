# Preview site

**https://preview.40-160-239-201.sslip.io** is the latest production build of `main`, running on the VPS. It's a
stopgap until the Render setup in the blueprint (07-architecture.md "Hosting", backlog B-002) takes over.

## How a change gets there

1. A push to any branch runs `.github/workflows/ci.yml` on GitHub: typecheck, lint, unit tests, DB integration
   tests, and a standalone production build (`NEXT_OUTPUT=standalone`).
2. On `main` (or a manual run with **deploy** ticked), `scripts/preview/bundle.sh` packs that build, and the
   workflow sends it over SSH: `ssh tnm-preview@<vps> "deploy <sha>" < preview-bundle.tgz`.
3. On the VPS, that key can only run `deploy.sh`. The script unpacks the release, runs `prepare-db.cjs`
   (migrations, plus the sample data when the database is empty), switches `current`, restarts the service,
   and rolls back if the new release doesn't answer.

Building happens on GitHub's runner, not on the VPS. The VPS only runs `node server.js`, capped at 1.2 GB.

## What's on the VPS

| What | Where |
|---|---|
| Service (user `tnm-preview`, 127.0.0.1:3200) | `tasksnearme-preview.service` (this folder) |
| Releases, `current`, uploaded files | `/srv/tasksnearme-preview/` |
| Settings and secrets | `/srv/tasksnearme-preview/preview.env` (root:tnm-preview, 640) |
| `deploy.sh` and the Node binary (root-owned) | `/usr/local/lib/tasksnearme-preview/` |
| Database | `tasksnearme_preview` (role `tnm_preview`) in the `tasksnearme-db` container |
| Public address | the `preview.40-160-239-201.sslip.io` block in `/etc/caddy/Caddyfile` |

Set up on 2026-11-13 with `sudo bash deploy/preview/setup-vps.sh <deploy-key.pub> <node binary>`, plus the
database, `preview.env` and the Caddy block by hand. To set it up again, follow the same steps. After changing
`deploy.sh` in the repo, run `setup-vps.sh` again to install it.

## GitHub secrets

| Secret | Value |
|---|---|
| `PREVIEW_SSH_KEY` | the private key `/home/ubuntu/.ssh/tasksnearme-preview-deploy` |
| `PREVIEW_SSH_HOST` | the VPS address |
| `PREVIEW_SSH_KNOWN_HOSTS` | `<address> ` followed by `/etc/ssh/ssh_host_ed25519_key.pub` |

## Day to day

- Logs: `journalctl -u tasksnearme-preview -f`
- After editing `preview.env`: `sudo systemctl restart tasksnearme-preview`
- Not using it for a while (saves about 0.5 GB of RAM): `sudo systemctl stop tasksnearme-preview`. To bring it
  back: `sudo systemctl start tasksnearme-preview`.
- Roll back by hand: `sudo -u tnm-preview ln -sfn /srv/tasksnearme-preview/releases/<sha> /srv/tasksnearme-preview/current`
  and restart.
- Fresh sample data: drop and recreate `tasksnearme_preview` (owner `tnm_preview`, `CREATE EXTENSION postgis`).
  The next deploy migrates it and seeds it again.

## Production mode

The preview is a real production build: `/dev/*` doesn't exist, and every integration uses real providers only.
A feature whose keys are empty in `preview.env` is refused, the same as in production (see `.env.example`):

- **Sign-in code, sign-up, posting a task:** need `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
- **Payments, Stripe Identity:** need the Stripe keys (test mode for a preview).
- **Texts:** need Twilio.
- **Gift-card rewards:** need Tremendous.
- **Google sign-in:** needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, plus the redirect URI
  `https://preview.40-160-239-201.sslip.io/api/auth/callback/google` registered with Google.

Email (Resend), AI (Anthropic) and address search (Mapbox) use the same keys as development.
