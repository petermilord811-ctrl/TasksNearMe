# How we build TasksNearMe: Claude × Codex

| Who | Builds | Works from |
|---|---|---|
| **Claude** (Claude Code, in VS Code) | Project setup, routes, data, business rules, payments, rewards, server actions, integrations, tests. **Connects Codex's screens to real data.** | `CLAUDE.md`, `docs/blueprint/` |
| **Codex** | **Only the UI:** design system, components, page shells, screens, previews | `AGENTS.md`, one UI ticket at a time in `docs/ui/tickets/` |
| **You** | Decide, run Codex, review screens, merge | `docs/ui/progress.md` |

The two meet at **contracts** (`src/contracts`): the exact data each screen receives and the actions it can call. Claude writes a contract and a ticket. Codex builds screens that take that data as props. Claude then plugs real data into those same props. Neither side has to guess.

## The loop for each UI ticket

1. **Claude** prepares the ticket: contracts, sample data, and the ticket file. Tell Claude: *"Prepare UI-003."*
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
3. **You** review: `npm run dev`, open **http://localhost:3000/dev/ui**, and look at the screenshots in `artifacts/ui-previews/`. Then commit:
   ```
   git add -A
   git commit -m "UI-003: public pages (Codex)"
   ```
4. **Claude** reviews and wires. Tell Claude: *"UI-003 is done"*, and paste Codex's final summary, especially any **contract requests**. Claude checks the work, connects the screens to routes and data, adds tests, and updates `docs/ui/progress.md`.
5. Merge to `main` and move on to the next ticket.

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
