# TasksNearMe

Book trusted local help for everyday tasks, starting in Austin, Texas. People post a task, compare offers from verified helpers nearby, book and pay up front, and approve the work before the helper is paid.

- **How we work:** [docs/workflow.md](docs/workflow.md). Claude builds the app, Codex builds the UI from tickets.
- **Product blueprint:** [docs/blueprint/](docs/blueprint/README.md) (the source of truth, from the brief to the backlog)
- **UI:** design system [docs/ui/design-system.md](docs/ui/design-system.md) · contract [docs/ui/ui-contract.md](docs/ui/ui-contract.md) · tickets [docs/ui/tickets/](docs/ui/tickets/) · progress [docs/ui/progress.md](docs/ui/progress.md)
- **Real providers:** [docs/integration-points.md](docs/integration-points.md) (what runs as a stand-in today, and how to plug in the real one)
- **Decisions and status:** [docs/automation/decisions.md](docs/automation/decisions.md) · [docs/automation/state.md](docs/automation/state.md)
- **Agent instructions:** [CLAUDE.md](CLAUDE.md) (Claude) · [AGENTS.md](AGENTS.md) (Codex)

## Run it locally

You need Node.js 24 or later (26 recommended), npm, and Docker Desktop (for Postgres).

```
npm install
cp .env.example .env.local          # development values; no provider keys needed
npm run db:up                       # Postgres in Docker, port 54329
npm run db:migrate
npm run db:seed                     # Austin, categories, people, tasks, offers, bookings
npx playwright install chromium     # once, for the preview harness and e2e
npm run dev                         # http://localhost:3000
```

Every provider runs as a stand-in in development: payments, ID checks, payouts, background checks, email, texts, gift cards, geocoding and file storage. Nothing is charged or sent.

## Try it

| Where | What |
|---|---|
| `/` | The landing page, with the map of open tasks |
| `/dev/sign-in` | Sign in as any seeded person in one click (it runs the real email-code flow). Maya and Chris are clients, Jordan, Sam and Lee are helpers, Priya is a helper still onboarding |
| `/admin` | Staff tools. Sign in from `/dev/sign-in` as Alex (support agent), Morgan (support lead), Taylor (trust and safety), Casey (finance) or Riley (admin); the two-step code is `123456` in development |
| `/dev/ui` | Every UI screen and state with fixture data (the preview gallery) |
| `/dev/outbox` | Emails and texts the app sent (sign-in codes, notifications); `?to=` shows one recipient's |
| `/dev/providers/identity` · `payout` · `background` | Stand-ins for Stripe Identity, Stripe Connect and Checkr: pick the outcome |
| `/dev/gift-cards/<id>` | A redeemed reward's stand-in gift card |
| `/dev/clock` | The test clock (time travel for tests): `POST { offsetMs }` with `x-test-clock-secret` moves "now" for your browser only |

All `/dev` routes are development tools: they're not found in a production build.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server, with the job runner (timers, notifications, emails and texts every minute) |
| `npm run check` | Typecheck, lint and unit tests (Vitest) |
| `npm run test:db` | Integration tests against a real Postgres (`TEST_DATABASE_URL`; reset once per run) |
| `npm run test:ui` | Every UI preview at 360 and 1280 px: renders, axe, screenshots in `artifacts/ui-previews/` |
| `npm run check:ui` | `check` and `test:ui` |
| `npm run e2e` | App flows in Playwright, phone and desktop (reseeds the dev database first) |
| `npm run build` | Production build |
| `node scripts/gate.mjs` | `check`, `test:db`, `e2e` and `build` in order, the bar for every commit to `main` |
| `npm run db:generate` | A new migration from the schema (`db/migrations`) |
| `npm run db:reset` | Drop, migrate and seed the dev database |

## How it's built

- **Next.js 16.4** (App Router with Cache Components; the request middleware is `src/proxy.ts`), React 19, Tailwind CSS 4, next-intl.
- **Postgres** through Drizzle ORM; one migration per change in `db/migrations`. Exact addresses are encrypted at rest.
- **Better Auth** with email one-time codes; staff add a second step.
- **One app, many modules** (`src/modules/*`): each owns its tables, domain rules (pure functions), queries and Server Actions. Pages read contract types already filtered for the viewer (`src/contracts`), so the UI never decides who sees what.
- **Jobs** run in-process every minute (`src/modules/jobs/runner.ts`, an advisory lock keeps it to one instance): offer and hold expiry, automatic approval and its reminders, review publishing, notifications, and their emails and texts. Pages also run the due work they show, so nothing waits for the next tick. `JOBS_DISABLED=1` turns the runner off.
- **Money** is integer cents everywhere; times are UTC, shown in America/Chicago.

## Tests

- Unit tests sit next to the code (`*.test.ts`); jsdom only where a file asks for it.
- Integration tests (`tests/integration`) run the services against Postgres, including the launch scenarios that need no browser: double submits, money to the cent, rewards, deliveries, daylight saving.
- E2e tests (`tests/e2e`) drive two or three accounts through the app on phone and desktop. Tests that change bookings write their own rows (`tests/e2e/support/scenarios.ts`) and time-travel with the test clock (`tests/e2e/support/clock.ts`).
- The preview harness (`tests/ui-previews`) renders every registered screen state with axe.
