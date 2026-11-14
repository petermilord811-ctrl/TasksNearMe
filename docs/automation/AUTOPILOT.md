# AUTOPILOT — autonomous build of TasksNearMe (Claude × Codex)

The operating manual for long unattended runs. Claude follows it on every wake-up of the `/loop`. If context was compacted, re-read this file and `docs/automation/state.md` before doing anything else.

## Mission

Build the complete TasksNearMe web app described in `docs/blueprint/`, running locally with demo (fake) providers, **without asking the user anything**.
- **Claude** builds the app (data, domain, server actions, wiring, tests).
- **Codex** builds the UI through tickets that `scripts/codex-run.mjs` runs unattended in the sibling worktree `../TasksNearMe-ui`.

Keep going until the Build plan below is done, then stop.

**Done means:**
- Every route in `docs/blueprint/02-sitemap-and-journeys.md` §1 exists and works end to end, against the local database with fake providers.
- The e2e scenarios from `docs/blueprint/10-build-plan-and-launch.md` §3.2 that don't need real provider accounts pass.
- `npm run check`, `npm run test:ui`, `npm run e2e` and `npm run build` all pass on `main`.

**Out of reach without the user** (log in `blocked.md`, never wait): real provider accounts and keys, final legal text, deployment, real money, domains.

## Ground rules

1. **Never ask the user a question.** Decide from, in order:
   1. `docs/blueprint/`
   2. `CLAUDE.md` / `AGENTS.md`
   3. `docs/ui/`
   4. sensible defaults.

   Record every non-obvious decision in `docs/automation/decisions.md`: date, decision, why, alternative.
2. **Never idle-wait.** If something truly needs the user, write it to `docs/automation/blocked.md` with the workaround you used, and continue with other work.
3. **Safety:**
   - **Local only.** Never `git push`, deploy, create accounts, spend money, or use live credentials. If keys appear in `.env.local`, use test mode only.
     - The one exception (owner, 2026-11-13): tasksnearme-3c pushes the shared branch through the CI/CD pipeline the owner asked for. GitHub Actions runs check, test:db and build (not e2e), and a green `feat/*` push fast-forwards `main` and deploys the preview (decisions.md). Autopilot sessions still never push or deploy. Their local commits reach GitHub when the pipeline pushes, so commit only finished, green work. Because e2e isn't in CI, the coordinator keeps running the full local gate at commit points.
   - **No destructive git.** No `reset --hard` on `main`, no force pushes, no history rewrites. Delete only fully merged `ui/*` branches.
   - **Stay in this repo, the worktree `../TasksNearMe-ui`, and normal dev tooling** (npm packages, Docker containers for the database).
   - **Never commit secrets.** `.env*` stays ignored.
4. **Keep `main` green.**
   - Commit to `main` only when `npm run check` passes, plus `npm run build` when routes or config change.
   - Make small commits with clear messages, one after every finished increment.
   - **Commit with `node scripts/commit-own.mjs -m "Subject" -m "Body" -- <your paths>`, never a plain `git commit`.** The sessions share one git index, so `git commit` takes whatever anyone has staged. On 2026-11-14 that swept others' work into the wrong commit three times. The script commits only the paths you name, from a private index. For a shared file that also holds others' uncommitted lines, write HEAD's version plus your lines to a scratch file and pass `<path>=<scratch file>`. It never stages anything in the shared index.
   - Local commits are authorized for the autopilot. Pushing is not.
5. **Codex owns `src/ui`.**
   - Never restyle or rewrite Codex's UI.
   - A tiny unblocking fix during wiring (a missing export, a typo) is allowed. Log it, and list it at the top of the next ticket as a follow-up.
6. **Contracts first.** Before a ticket goes to Codex, its contract types, fixtures for every state, and ticket file are committed (`CLAUDE.md`, "Writing a UI ticket").
7. **Never weaken tests, lint rules, privacy rules, or the blueprint's money values** to get green.

## Files Claude maintains

| File | Purpose | When |
|---|---|---|
| `docs/automation/state.md` | Where we are: phase, active Codex run, next 5 steps, open issues | Rewrite at the end of **every** iteration |
| `docs/automation/log.md` | One dated entry per iteration: what changed, commits, checks | Append every iteration |
| `docs/automation/decisions.md` | Non-obvious decisions | When made |
| `docs/automation/blocked.md` | Needs-the-user items, with workarounds | When found |
| `docs/ui/progress.md` | UI ticket status (Claude fills Codex notes from handoffs) | After each Codex run |

`automation/runs/*.json` and `automation/logs/` are runtime files (git-ignored) written by `codex-run.mjs`.

## Every iteration

1. **Orient.** Read `docs/automation/state.md`. Run `git status`. Read every `automation/runs/*.json`.
2. **P0: process a finished Codex run.** If a run file says `handed_off` or `failed` and has no `"processed": true`, follow "Processing a Codex run" below. Then add `"processed": true` to that JSON.
3. **P1: keep Codex busy.**
   - If no run file is `running`, take the next UI ticket in the Build plan whose dependencies are merged.
   - If its contracts, fixtures, or ticket aren't ready, prepare them now (top priority), run `npm run check`, and commit to `main`.
   - Then launch it with Bash `run_in_background: true` from the repo root: `node scripts/codex-run.mjs UI-xxx`.
   - Only one Codex run at a time. Its exit re-invokes you.
4. **P2: build the next app increment** from the Build plan: backend, domain, wiring, tests. Work in increments of about 30–90 minutes, each ending with green checks and a commit.
5. **Close.** Update `state.md` and `log.md` (and `progress.md` if a ticket moved), commit, then call `ScheduleWakeup` with the same `/loop` prompt:
   - Work remains and nothing to wait for: **60 s**.
   - Only waiting for Codex (nothing else unblocked): **1800 s**. The run's exit notification usually arrives first.
   - Everything done: see "Stopping".

## Processing a Codex run

**`handed_off`** (handoff written and the independent `check:ui` passed):
1. Make the main worktree clean: commit your own finished work first. Don't merge onto half-done work.
2. Run `git merge --no-ff <branch> -m "Merge UI-xxx (Codex)"`. Resolving conflicts:
   - `package-lock.json`: keep `main`'s, merge `package.json` dependencies by hand, then `npm install` to regenerate the lock.
   - `src/contracts`, `src/fixtures`, `docs/`: keep `main`.
   - Anything else: keep both intents.
3. If `package.json` changed, run `npm install`.
4. Review using the `CLAUDE.md` checklist:
   - The diff stays in Codex paths. `npm run check:ui` passes.
   - Read `automation/runs/UI-xxx.handoff.md`.
   - Look at 3–6 phone screenshots of the new previews in `artifacts/ui-previews/ui-mobile/`.
   - Check privacy and that no business logic landed in the UI.
5. Handle contract requests. Implement the accepted ones, with tests. Write the rejected ones into the next ticket's notes, with the reason.
6. Wire the screens into routes (`CLAUDE.md` wiring pattern). Add e2e tests for the flows. Run `npm run e2e` for them.
7. Update `progress.md` (status, Codex notes, wiring), the ticket's "Claude wiring notes", and `log.md`. Commit. Delete the merged branch with `git branch -d`.
8. Codex follow-ups go at the top of the next ticket: "First: follow-ups from UI-xxx".

**`failed`:** read the run JSON (`reason`), `UI-xxx.last-message.md`, and the end of the log (and the check log, if any).
- **Usage limit, rate limit, network, or auth errors:** keep doing P2 work and retry in 30–60 minutes. Up to 4 retries, then log it in `blocked.md`.
- **Timeout, or no handoff after partial work:** retry once with `--note "<what remains, plus decisions to keep>"`. The branch is reset to `main` on each run.
- **`check:ui` failed:** read the check log and retry with `--note` listing the exact failures.
- **Two failed attempts for non-capacity reasons:**
  - First choice: split the ticket (UI-0xxa/b).
  - Last resort: build that UI yourself in `src/ui`, following the ticket and `AGENTS.md`, and record it in `decisions.md`.

## Environment gotchas
- **The machine (since 2026-11-13):** an Ubuntu 26.04 VPS (4 vCPU, 7.7 GB RAM plus 8 GB swap, no GPU) that also serves live sites (Caddy on 80/443, `sm-relay` on 8080) and has no host firewall. Keep every dev port on loopback: `npm run dev` binds `localhost` (not `127.0.0.1`: Next then treats the language rewrites to `localhost` as another origin and loops). The same holds for every production server: `next start --hostname localhost`, and HOSTNAME=localhost for the standalone server.js. Bound to 127.0.0.1, every English page loops with 307s over http, or answers 500 behind Caddy, while /es still works (found 2026-11-14) and Postgres publishes on `127.0.0.1:54329`. The owner opens the app through VS Code's port forwarding at `http://localhost:3000`, or through the Caddy URL in the memory note `vps-server`. With this little memory, the dev server is run by `node scripts/dev-supervisor.mjs`, started by one session in the background. It keeps one server on :3000 in a memory-capped systemd scope (5 GB RAM plus 1 GB swap), restarts it once it passes 3 GB while no heavy job holds the lock, and starts a new one whenever the old one exits. A Playwright run that finds the port empty starts its own temporary server, and the supervisor takes over when that exits. Don't start dev servers by hand. Restart one by stopping the server process, and the supervisor brings it back. **e2e runs against a production build, not the dev server** (since 2026-11-14). Under e2e load, Turbopack's native memory (not the JS heap; GET /dev/memory shows both) takes the dev server past its cap within minutes. A fresh server reached 3.8 GB in 85 s on two specs with one worker, and full runs were OOM-killed every 3–6 minutes. For e2e, use `node scripts/heavy.mjs --e2e-build npx playwright test <spec> --project=app-desktop`. It pauses the dev server, makes the e2e build (`npm run e2e:build`, with the development helpers kept on: src/shared/dev-helpers.ts), and runs the command with `E2E_TARGET=build`, so Playwright serves the build itself on localhost:3300. The build takes a few minutes, and pages then answer at once. The gate does the same for its whole e2e step (`--e2e-target build`, the default; `--e2e-target dev` is the old way). For preview runs, which need the dev server, use `node scripts/heavy.mjs --fresh-dev <command>`, which asks the supervisor for a fresh server once you hold the lock. A gate or `--e2e-build` run pauses the dev server (automation/dev-pause.request), and it comes back when that run ends or exits.
- **Read the gate's `<step> exit <code>` lines** before committing. A command that pipes the gate into `tail` exits 0 even when a step failed. Under heavy load, vitest workers can fail to start ("Failed to start forks worker"): rerun the step when the machine is quieter.
- **One heavy job at a time.** Run the full gate with `node scripts/gate.mjs --logs <dir>` (check, test:db, e2e, build). It takes `automation/heavy.lock`, and so do `scripts/heavy.mjs` and the runner's independent `check:ui`, which also retries once. Running two together starved the machine: vitest workers timed out and Playwright navigations failed. A heartbeat (a worker thread that beats every minute, even while the holder is blocked in `execSync`) keeps the lock for as long as the job runs. Another job takes it over only when the holder's process is gone, its heartbeat is 10 minutes old, or it has been held for 4 hours (`scripts/lib/heavy-lock.mjs`). Before heartbeats, a 45-minute age limit let peers take over a live gate's lock mid-run. To stop a gate, send SIGTERM to its pid: it stops the running step's process group and releases the lock. The gate keeps each shard's Playwright output in `<logs>/e2e-results/shard-<n>`, not `test-results/`.
- Never run `npm ci` in the main checkout while `next dev` (or a Playwright-started server) is running. Native binaries are locked and `npm ci` leaves `node_modules` half-deleted. Stop the server first, or use `npm install`.
- The Codex worktree needs `.env.local`. `scripts/codex-run.mjs` copies it; copy it by hand after recreating the worktree.
- If many pages answer 500 with `SyntaxError: Unexpected non-whitespace character after JSON` in the dev log, two parallel compiles corrupted a dev manifest (seen: `.next/dev/prerender-manifest.json`). Stop the server (and whatever still listens on port 3000: `ss -ltnp | grep :3000`), delete `.next/dev`, restart, and request the main pages one at a time before running e2e.
- Server Actions added to an existing file while `next dev` runs may not reach the client (the action fails before any POST shows in the log): restart the dev server.
- Never run `vitest --config vitest.db.config.mts` while a gate's `test:db` runs: each run resets the shared test database.
- If the dev server throws "X is not a function" for an export that typecheck sees, its module graph is stale (seen after `sed -i` edits). Restart it: stop the process listening on port 3000 (`ss -ltnp | grep :3000`, then `kill <pid>`) and start the logged server again. Don't use `pkill -f '<pattern>'` for this: the pattern also matches the shell running the command, which then kills itself.

## Build plan

Order matters. A UI ticket starts once its contracts are ready and the tickets it depends on are merged. **Prepare the next ticket while Codex works on the current one.**

**Phase 1 — Foundation**
- **UI-002 shells:** Codex's first unattended run.
- **Database:**
  - Try Docker first. On the VPS, Docker Engine is a system service that starts on boot: if `docker info` fails, run `sudo systemctl start docker`. A shell that says "permission denied" on the Docker socket started before the `docker` group was added, so use `sg docker -c '<command>'`. (On the old Windows machine: start Docker Desktop and wait up to 3 minutes.) Then run `postgis/postgis` from a `docker-compose.yml`.
  - Otherwise use PGlite for dev and tests: no PostGIS, so geo math runs in SQL or TS on lat/lng.
  - Record the choice in `decisions.md`.
  - Drizzle schema for the core tables (blueprint 08 §3), committed SQL migrations, and a seed script built from `src/fixtures` (people, the desk / moving / remote tasks, staff).
- **Auth and session:**
  - Better Auth with email one-time codes, delivered to a dev mail outbox page.
  - Dev-only "sign in as" for seeded people.
  - `getViewer()` / `getShellViewer()`.
- **Route groups** `(public)`, `(app)/app`, `admin` with the UI-002 shells. Server Actions `setMode` and `signOut`. The admin two-step check (dev code `123456`).
- **Platform:**
  - An injectable clock with dev time travel.
  - Outbox and jobs: graphile-worker on Postgres, or an in-process runner on PGlite.
  - The audit log and feature flags.
  - A **fake-provider registry** behind interfaces: payments (Stripe-shaped), identity, background checks, gift cards, email, SMS, maps, AI drafting.

**Phase 2 — Public site and sign-in.** UI-003, UI-004, UI-005. Markets and categories config, public task and helper profile queries, waitlist.

**Phase 3 — Posting and offers.** UI-006, UI-007, UI-009.
- Tasks with location privacy: encrypted exact address, deterministic fuzzed public point.
- Offers, invites, availability.
- The fee domain, reproducing ui-contract §3 exactly.
- Contact masking.

**Phase 4 — Helper onboarding.** UI-008. The verification module with fake identity, payout, and background providers, and bookable gating.

**Phase 5 — Booking and money.** UI-010, UI-011, UI-012, UI-013.
- The booking state machine (blueprint 03) and cancellation policy.
- Change requests; completion, approval, and auto-approve timers; disputes.
- A fake payment provider implementing the payments port: charges, authorizations, captures, refunds, transfers.
- Ledger and reconciliation, and idempotency (blueprint 09 §4).

**Phase 6 — Messaging and notifications.** UI-014, UI-017. Threads with masking, in-app notifications, the email/SMS dev outbox, a push placeholder.

**Phase 7 — Repeat business, money pages, rewards.** UI-015, UI-016. Double-blind reviews, saved helpers, rebooking, earnings and receipts, and the rewards engine (blueprint 05) with a fake gift-card provider.

**Phase 8 — Admin.** UI-018, UI-019, UI-020. Staff roles and limits, queues, cases and resolutions, refunds with approvals, moderation, config, audit.

**Phase 9 — Quality.**
- UI-021.
- The e2e suite for every blueprint 10 §3.2 scenario possible without real providers.
- Authorization and privacy tests, accessibility and performance passes.
- `README.md` and `docs/integration-points.md`, which explain how to swap fakes for real providers.

**Phase 10 (optional) — Real provider adapters in test mode,** only if keys exist in `.env.local`. Otherwise document what's needed in `blocked.md`.

Ticket scopes are listed in `docs/ui/progress.md`. Keep each ticket small enough for Codex to finish in about 2 hours (≤ ~8 screens or components). Split larger ones.

## Preparing a UI ticket

1. Contract types and zod schemas in `src/contracts`.
2. Fixtures for every state in `src/fixtures`.
3. The ticket from `docs/ui/tickets/TEMPLATE.md`, starting with any "First: follow-ups".
4. A row in `docs/ui/progress.md`.
5. `npm run check`, commit to `main`, launch `codex-run`.

## Notifications

Call `PushNotification` only when a phase completes, when a hard blocker needs the user, or for the final report. One line, under 200 characters.

## Resuming after a restart

1. Read `state.md`.
2. If a run file says `running` but its log hasn't changed for 10+ minutes and no run is active:
   - Codex already wrote `docs/ui/handoffs/UI-xxx.md` in the worktree (the session ended during the independent check): run `node scripts/codex-run.mjs UI-xxx --finish` (background). It reruns the check, commits Codex's work and records the result.
   - Otherwise mark it `failed` (reason: interrupted) and retry.
   - A stale `automation/heavy.lock` from a dead process is taken over automatically.
3. If the worktree `../TasksNearMe-ui` is in a bad state, `codex-run.mjs` stashes and resets it on the next run.

## Stopping

When everything is done, or the user says stop:
1. Write `docs/automation/final-report.md`: what was built, test status, blocked items, how to run.
2. Send a `PushNotification`.
3. End the loop with `ScheduleWakeup` (`stop: true`).
