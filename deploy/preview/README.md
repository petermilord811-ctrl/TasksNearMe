# Preview site

**https://tasksnearme.com** shows the latest production build of `main`, running on the VPS, hidden from search
engines (`X-Robots-Tag: noindex`) until launch. `www` and the old `preview.40-160-239-201.sslip.io` redirect there. It's a
stopgap until the Render setup in the blueprint (07-architecture.md "Hosting", backlog B-002) takes over.

## How a change gets there

1. A push to any branch runs `.github/workflows/ci.yml` on GitHub: the quick checks only (typecheck, lint, unit
   tests, DB integration tests, and a standalone production build, `NEXT_OUTPUT=standalone`). Nothing deploys or
   merges, and a newer push to the same branch cancels the older run.
2. **Shipping** is a manual run (owner, 2026-11-14: e2e only before a merge into `main`): on GitHub, Actions → CI →
   Run workflow → pick the `feat/*` branch → tick **Ship**, or from the repo
   `gh workflow run ci.yml --ref feat/<branch> -f deploy=true`. A push straight to `main` ships too. The quick
   checks and the e2e suite run side by side. The e2e suite runs against the e2e production build in 3 parallel
   shards, each with its own Postgres, so it takes no lock and touches no dev database. Tick **e2e** without
   **Ship** to run the suite on any branch without deploying. Failed and flaky tests (passed on retry) leave
   their traces as the run's `e2e-results-<n>` artifacts, kept 5 days.
3. When every job is green and `main` can fast-forward to the branch, the ship job sends the build packed by
   `scripts/preview/bundle.sh` over SSH: `ssh tnm-preview@<vps> "deploy <sha>" < preview-bundle.tgz`.
4. Only after that deploy passes its health check does the run fast-forward `main` to the commit, so `main`
   always holds a build that passed e2e, started and served its pages. No review is needed, since one person
   develops this. If `main` has commits the branch lacks, nothing is deployed or merged and the run fails. Codex's
   `ui/*` branches never ship: they're reviewed into the work branch first.
5. On the VPS, that key can only run `deploy.sh`. The script unpacks the release, runs `prepare-db.cjs`
   (migrations, plus the sample data when the database is empty, then the demo marketplace from `db/seeds/demo`
   written again with today's dates), switches `current`, restarts the service,
   and rolls back unless `/`, `/es` and `/sign-in` answer 200 when asked the way Caddy asks (public host, https).

Building happens on GitHub's runner, not on the VPS. The VPS only runs `node server.js`, capped at 1.2 GB.

## What's on the VPS

| What | Where |
|---|---|
| Service (user `tnm-preview`, 127.0.0.1:3200) | `tasksnearme-preview.service` (this folder) |
| Releases, `current`, uploaded files | `/srv/tasksnearme-preview/` |
| Settings and secrets | `/srv/tasksnearme-preview/preview.env` (root:tnm-preview, 640) |
| `deploy.sh` and the Node binary (root-owned) | `/usr/local/lib/tasksnearme-preview/` |
| Database | `tasksnearme_preview` (role `tnm_preview`) in the `tasksnearme-db` container |
| Public address | the `tasksnearme.com` block in `/etc/caddy/Caddyfile` (`www` redirects there) |

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
- If the shared `'use cache'` handler (`cache-handlers/shared-tags.mjs`) misbehaves, add `SHARED_CACHE_HANDLER=off`
  to `preview.env` and restart: that falls back to Next's built-in handler without a code change.
- Not using it for a while (saves about 0.5 GB of RAM): `sudo systemctl stop tasksnearme-preview`. To bring it
  back: `sudo systemctl start tasksnearme-preview`.
- Roll back by hand: `sudo -u tnm-preview ln -sfn /srv/tasksnearme-preview/releases/<sha> /srv/tasksnearme-preview/current`
  and restart.
- Fresh sample data: drop and recreate `tasksnearme_preview` (owner `tnm_preview`, `CREATE EXTENSION postgis`).
  The next deploy migrates it and seeds it again.
- The demo marketplace (Austin and 14 more markets such as `/pretty-prairie` and `/chicago`: about 600 people with
  `demo_` ids, 1,200 tasks, their offers, bookings and reviews) comes back up to date on every deploy. To refresh it
  between deploys, from the repo with the preview's `DATABASE_URL` and `FIELD_ENCRYPTION_KEY` in the environment:
  `npm run db:demo` (about 10 seconds). Its market, board and category pages are indexable under the rules above.

## Search engines

What Google may index is set in the code, `LIVE_SITE_INDEXING` in `src/shared/search-indexing.ts`, so it ships
with each deploy and no server setting is needed. It applies to a production build whose `APP_URL` is
`https://tasksnearme.com`; every other copy (the dev server, the e2e build, a staging server) stays out of search.

- `site`, the owner's choice (2026-11-14) while the preview shows sample tasks and helpers: the site's own pages are
  indexed (home, markets, categories, task boards, how it works, pricing, becoming a helper, trust and safety,
  help); task pages and helper profiles answer `noindex` and the sitemap leaves them out.
- `on`: every public page (launch, once the sample data is gone). Change the constant and its test, and deploy.
- `off`: nothing; robots.txt says `Disallow: /` and every page answers `noindex`.

`SEARCH_INDEXING` (off, site or on) in `preview.env` would override it without a deploy; nothing needs it.

Caddy leaves the decision to the app: the `tasksnearme.com` block in `/etc/caddy/Caddyfile` only repeats, as a second
layer, `noindex, nofollow` on `/app`, `/admin` and `/api/*`; `dev.tasksnearme.com` keeps `noindex, nofollow` on
everything, and since 2026-11-21 asks for a password (basic auth) and answers 404 to Next's dev endpoints
(`/__nextjs*`, `/_next/mcp*`); backup of the file before that: `/etc/caddy/Caddyfile.bak-20261121-devlock`. (Until the SEO build shipped, Caddy also held the listings back; backups of the earlier files:
`/etc/caddy/Caddyfile.bak-2026-11-14-seo` and `…-seo2`.) After an edit: `sudo caddy validate --config
/etc/caddy/Caddyfile`, then `sudo systemctl reload caddy`.

IndexNow (Bing, Yandex, Seznam, Naver, Yep; Google doesn't take part) hears about new and changed pages from the
server itself: the job runner's `seo.indexnow` step announces the sitemap's pages every 15 minutes, on the live site
only (`src/modules/seo/indexnow.ts`; the key file is `public/<key>.txt`). To announce everything at once after a
deploy: `node scripts/seo/indexnow.mjs`. Search Console from the command line, with the owner's service account
(key outside the repo, in `~/.config/tasksnearme/`): `node scripts/seo/google.mjs sites | sitemaps |
submit-sitemap | inspect <url> | queries [days] | pages [days]`.

Check: `curl -sI https://tasksnearme.com/ | grep -i x-robots` prints nothing, a task page prints `noindex`, and
(with the SEO build) `curl -s https://tasksnearme.com/robots.txt` shows `Allow: /` and the `Sitemap:` line. In
Google Search Console: add the domain property (a DNS TXT record at Cloudflare), ask for indexing of the home page
with URL Inspection, and once the SEO build is live, submit `https://tasksnearme.com/sitemap.xml`. The sitemap
(`src/app/sitemap.ts`) lists every indexable public page in English and Spanish and refreshes within the hour when
tasks or helpers change. The link-preview cards are `public/og/tasksnearme-{en,es}.png`; redraw them with
`node scripts/seo/share-image.mjs` when the brand mark or tagline changes.

## Production mode

The preview is a real production build: `/dev/*` doesn't exist, and every integration uses real providers only.
A feature whose keys are empty in `preview.env` is refused, the same as in production (see `.env.example`):

- **Sign-in code, sign-up, posting a task, offers** (sending one, the one-tap offer, countering): need
  `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
- **Payments, Stripe Identity:** need the Stripe keys (test mode for a preview), plus the two webhook
  secrets for ID-check results, payouts and late bank steps (`STRIPE_WEBHOOK_SECRET`,
  `STRIPE_CONNECT_WEBHOOK_SECRET`; the events are listed in `src/app/api/webhooks/stripe/route.ts`).
- **Persona** (optional): with `PERSONA_API_KEY`, `PERSONA_INQUIRY_TEMPLATE_ID` and `PERSONA_WEBHOOK_SECRET` all
  set, Persona does the ID double check instead of Stripe Identity. Until then, `/api/webhooks/persona` answers 404.
- **Texts:** need Twilio.
- **Gift-card rewards:** need Tremendous.
- **Google sign-in:** needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, plus the redirect URI
  `https://tasksnearme.com/api/auth/callback/google` registered with Google.

Email (Resend) and address search (Mapbox) use the same keys as development.

**AI (writing help, AI search, the home page's assistant): free models only** (the owner, 2026-11-21). Without a
model key these features are off in production, so put in `GEMINI_API_KEY` and `GROQ_API_KEY` (the same free keys as
development) and list the other AI lines from `.env.example` empty: `AI_PROVIDERS`, `GEMINI_MODEL`,
`GEMINI_BASE_URL`, `GEMINI_TIMEOUT_SECONDS`, `GROQ_MODEL`, `GROQ_BASE_URL`, `GROQ_TIMEOUT_SECONDS`, `KIMI_API_KEY`,
`KIMI_MODEL`, `KIMI_BASE_URL`, `KIMI_TIMEOUT_SECONDS`, `KIMI_IN_PRODUCTION`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`.
Kimi's key stays empty: development's is NVIDIA's free trial key, whose terms keep it out of production and away from
real people's data, and even copied in, a production build ignores it without `KIMI_IN_PRODUCTION=yes` (set both only
with a paid plan). Claude is paid and answers only if `AI_PROVIDERS` names it. Details: docs/integration-points.md,
"Writing help and AI search".

The Content Security Policy is enforced in production builds (development only reports it), so it applies
here first. When the preview blocks a script, a frame or a connection, the browser console names the
directive. Fix the policy, not the preview.
