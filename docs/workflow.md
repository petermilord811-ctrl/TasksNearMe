# How we build TasksNearMe: Claude × Codex

| Who | Builds | Works from |
|---|---|---|
| **Claude** (Claude Code, in VS Code) | Project setup, routes, data, business rules, payments, rewards, server actions, integrations, tests. **Connects Codex's screens to real data.** | `CLAUDE.md`, `docs/blueprint/` |
| **Codex** | **Only the UI:** design system, components, page shells, screens, previews | `AGENTS.md`, one UI ticket at a time in `docs/ui/tickets/` |
| **You** | Decide, run Codex, review screens, merge | `docs/ui/progress.md` |

The two meet at **contracts** (`src/contracts`): the exact data each screen receives and the actions it can call. Claude writes a contract and a ticket. Codex builds screens that take that data as props. Claude then plugs real data into those same props. Neither side has to guess.

## Autopilot: fully automatic (the default)

Claude runs the whole build on its own for hours: it builds the app, writes UI tickets, starts Codex on them through the Codex CLI (`scripts/codex-run.mjs`), reviews and merges Codex's work, connects it, and moves on. Nobody is asked anything. The operating rules are in [docs/automation/AUTOPILOT.md](automation/AUTOPILOT.md).

| Command / place | What it's for |
|---|---|
| `/loop Continue the TasksNearMe autopilot …` (in Claude Code) | Starts or resumes it (see "Start or resume" below) |
| "Stop the autopilot" (to Claude) | Claude writes a final report and stops |
| [docs/automation/state.md](automation/state.md) | Where things stand right now |
| [docs/automation/log.md](automation/log.md) | What happened, iteration by iteration |
| [docs/automation/decisions.md](automation/decisions.md) | Choices Claude made on its own |
| [docs/automation/blocked.md](automation/blocked.md) | Things only you can provide (keys, legal text, deployment) |
| `D:\4. Application\TasksNearMe-ui` | Codex's working copy (don't edit it by hand) |

**For a long run:** keep VS Code and this Claude Code session open, and stop Windows from sleeping. Both Claude and Codex use your plan's usage limits; when Codex is rate-limited, Claude keeps building and retries later.

### Start or resume

```
/loop Continue the TasksNearMe autopilot: follow docs/automation/AUTOPILOT.md exactly. Read docs/automation/state.md first, do the next most valuable step, keep Codex busy with UI tickets via scripts/codex-run.mjs, never ask me questions, record decisions, commit after green checks, and schedule the next wake-up.
```

## Manual mode: you run Codex yourself

### The loop for each UI ticket

1. **Claude** prepares the ticket: contracts, sample data, and the ticket file. Tell Claude: *"Prepare UI-003."* Claude then **starts watching** for Codex's handoff.
2. **You** start Codex on a branch:
   ```
   git switch -c ui/UI-003-public-pages
   ```
   Then send Codex (in a new conversation):
   ```
   Read AGENTS.md, then implement the UI ticket docs/ui/tickets/UI-003-public-pages.md.
   Work only inside the paths the ticket allows. Reply with your plan first and wait for my approval before changing any files.
   ```
   Reply `Approved, go ahead.` once the plan looks right.
3. **Codex finishes and Claude takes over on its own.**
   - Codex's last step writes `docs/ui/handoffs/UI-003.md`.
   - Claude notices within about 20 seconds. It reviews the work, handles any contract requests, connects the screens to routes and data, adds tests, and updates `docs/ui/progress.md`.
   - Claude then sends you a desktop notification.
   - This works only while the Claude Code session is open in VS Code. If you closed it, tell Claude *"UI-003 done"*.
4. **You** look at the screens (`npm run dev`, then **http://localhost:3000/dev/ui**), then commit and merge with the commands Claude gives you. Move on to the next ticket.

While Codex builds one ticket, Claude can build the backend for the next ones. Two tickets can be open at once as long as they don't depend on each other (see "Depends on" in each ticket).

## If Codex gets something wrong

Send a follow-up in the same Codex conversation:
```
Follow-up on UI-001. Problems:
1. <what you saw: preview id, phone or desktop> — expected <what the ticket or design system says>.
2. ...
Fix only these. Stay inside your allowed paths. Run npm run check:ui and update your summary.
```
If it went badly wrong, delete the branch and start the ticket again in a fresh conversation.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Runs the app; UI previews at `/dev/ui` |
| `npm run check` | Typecheck, lint, unit tests |
| `npm run test:ui` | Renders every preview on phone and desktop, checks accessibility, saves screenshots |
| `npm run build` | Production build |
