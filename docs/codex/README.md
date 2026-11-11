# Codex UI kit — how to use it

This kit lets Codex build the complete TasksNearMe UI (public site, signed-in app, admin) on mock data, one reviewed step at a time.

| File | Role |
|---|---|
| `AGENTS.md` (repo root) | Standing rules. Codex reads it automatically on every task |
| `docs/codex/ui-contract.md` | Data shapes, mock people, money values, actions, scenarios, transitions |
| `docs/codex/design-system.md` | Tokens, layouts, components, status labels, voice, accessibility |
| `docs/codex/prompts/01…21` | One ready-to-run prompt per step |
| `docs/ui-progress.md` | Checklist Codex updates after each step |
| `docs/blueprint/` | Product source of truth (prompts point to the exact sections) |

## One-time setup

1. **Commit the baseline** so every Codex step is a clean diff:
   ```
   git add -A
   git commit -m "Blueprint and Codex UI kit"
   ```
2. **Pick a Codex surface:**
   - **VS Code extension** (simplest on this Windows machine): install OpenAI's Codex extension, sign in, and open this folder.
   - **Codex CLI**: install it with `npm install -g @openai/codex` and run `codex` from this folder. On Windows, check OpenAI's current instructions first; WSL has often been the smoother path.
   - **Codex cloud** (in ChatGPT): push this repo to a **private** GitHub repository and connect it. Each task returns a pull request. Allow network access for package installs. After prompt 01 creates `package-lock.json`, set the environment's setup command to `npm ci && npx playwright install --with-deps chromium`.
3. **Permissions:** let Codex edit files and run commands in this folder. Prompt 01 needs network access (npm and Playwright downloads).
4. Node.js 26 is installed and npm comes with it. pnpm is **not** needed.

## The loop for each prompt

1. Make a branch: `git switch -c ui/03-public-pages`.
2. Start a **fresh** Codex conversation or task (one prompt per conversation keeps the context clean).
3. Send: **`Read AGENTS.md, then follow docs/codex/prompts/03-public-pages.md exactly.`** (or paste the prompt file's contents).
4. Prompts marked **Plan first: yes** make Codex reply with a plan before coding. Check it against the prompt's *Build* list, then reply **"Approved, go ahead"** or correct it.
5. When it finishes:
   - Run `npm run dev` and open the routes and scenarios in the prompt's **Review** section. The dev toolbar is the round button at the bottom-left.
   - Run `npm run shots` and look through `artifacts/screenshots/` (phone and desktop).
   - Confirm `npm run check` passes, the diff stays inside the prompt's scope, and `docs/ui-progress.md` is updated.
6. Commit and merge: `git add -A && git commit -m "UI 03: public pages"`, then `git switch main && git merge ui/03-public-pages`. On cloud, merge the pull request.

### When something is off

Send a focused follow-up in the same conversation:
```
Follow-up on prompt 03. Problems:
1. On /pricing at 360 px, the breakdown wraps badly. Expected: design-system §4.2 PriceBreakdown, one line per item.
2. /helpers/sam shows "Sam Kowalski". Expected: first name + last initial only (AGENTS.md rule 5).
Fix only these. Keep everything else unchanged. Run npm run check and update your summary.
```
If a step went badly wrong, don't stack fixes. Throw the branch away (`git switch main && git branch -D ui/03-public-pages`) and run the prompt again with a short "Notes from the last attempt" paragraph at the end.

## Order and parallel work

| # | File in `docs/codex/prompts/` | What it builds | Plan first | Depends on |
|---|---|---|---|---|
| 01 | `01-scaffold-theme-layouts.md` | Scaffold, theme, layouts, tooling, route stubs | yes | — |
| 02 | `02-mock-data-toolbar-components.md` | Mock data, scenarios, dev toolbar, domain functions, shared components | yes | 01 |
| 03 | `03-public-pages.md` | Public site | yes | 02 |
| 04 | `04-posting-wizard.md` | Posting wizard | yes | 02 |
| 05 | `05-poster-home-tasks-offers.md` | Poster home, tasks, offers, browse helpers | yes | 02 |
| 06 | `06-helper-onboarding-profile.md` | Helper onboarding and profile | yes | 02 |
| 07 | `07-helper-work-offers-invites.md` | Find work, offers, invites, availability | yes | 06 |
| 08 | `08-booking-confirmation-invites.md` | Booking confirmation, payment placeholder, direct invites | yes | 05, 07 |
| 09 | `09-booking-hub-states.md` | Booking page: structure and every state | yes | 08 |
| 10 | `10-booking-actions-before-during.md` | Status updates, changes, cancel, no-show, safety | yes | 09 |
| 11 | `11-completion-approval-disputes.md` | Completion, approval, disputes | yes | 10 |
| 12 | `12-messaging.md` | Messaging | yes | 09 |
| 13 | `13-reviews-repeat-business.md` | Reviews, saved helpers, Book again, My clients | no | 11 |
| 14 | `14-payments-earnings-rewards.md` | Receipts, earnings, rewards | yes | 11 |
| 15 | `15-notifications-account-support.md` | Notifications, account, support | yes | 12 |
| 16 | `16-admin-shell-queues-users.md` | Admin I: shell, queues, users, moderation | yes | 02 |
| 17 | `17-admin-bookings-cases-payments.md` | Admin II: bookings, cases, refunds, payments | yes | 16, 11 |
| 18 | `18-admin-rewards-config-audit.md` | Admin III: rewards, config, audit, staff | no | 16, 14 |
| 19 | `19-quality-pass.md` | Accessibility, responsive, states, copy, privacy pass | yes | all above |
| 20 | `20-final-qa-handoff.md` | Final QA and backend handoff | no | 19 |
| 21 | `21-optional-recurring-visits.md` | *(optional, phase 2)* Recurring visits | yes | 11 |

Run 01 and 02 alone, in order. After 02 is merged, these groups can run on separate branches at the same time: **{03}**, **{04, 05}**, **{06, 07}**, **{16}**. Merge often; later prompts build on earlier components.

## What Codex can't do for you

- Real provider accounts (Stripe, Checkr, Tremendous, Twilio, Google Maps).
- Final legal text. Legal pages are marked "Draft — pending legal review".
- Brand assets. The design system defines a placeholder brand you can swap.

After prompt 20, `docs/integration-points.md` lists every placeholder and mock query the backend phase must replace (see `docs/blueprint/11-initial-backlog.md`).
