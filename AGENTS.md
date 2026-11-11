# AGENTS.md — TasksNearMe (Codex builds the UI)

TasksNearMe is a person-to-person marketplace for booking local help with everyday tasks, launching first in Austin, Texas. One account has two modes: **"I need help"** (poster) and **"I can help"** (helper). Product source of truth: `docs/blueprint/`.

## Your role

- **You (Codex) build the user interface only:** the design system, components, page shells, and screens, one **UI ticket** at a time (`docs/ui/tickets/UI-xxx-*.md`).
- **Claude (Claude Code) builds everything else:** routes, data, business rules, server actions, integrations, and app-flow tests. Claude also connects your screens to real data.
- The handshake:
  - **Claude gives you:** TypeScript contracts (`src/contracts`), canonical fixtures (`src/fixtures`), formatters (`src/shared`), and a ticket.
  - **You give back:** components, screens, and previews in `src/ui`, plus copy in `messages/en/ui`.

## Unattended runs (the normal case)

Claude starts most tickets automatically with `scripts/codex-run.mjs`. That runs you in a separate copy of the repo (a git worktree) on the ticket's branch. When your prompt says you're running unattended:
- **Don't ask questions and don't wait for plan approval.** Decide within the ticket, this file, and the design system, and list your decisions in the handoff summary.
- **Don't run git commands that change state** (commit, branch, stash, reset, checkout). The pipeline commits your work.
- **Use the port in `PORT`** for the dev server and Playwright. Never use 3000, which belongs to Claude's copy.
- If npm fails with a permission error on its cache, retry with `npm_config_cache=.npm-cache`.

## Paths

**You may create and edit:**
- `src/ui/**`: theme, primitives, components, shells, screens, previews, lib. This includes UI tests (`src/ui/**/*.test.tsx`).
- `messages/en/ui/**`: UI copy. One JSON file per namespace, registered in `messages/en/ui/index.ts`. Never use the top-level namespace `server`.
- `public/ui/**`: UI images and illustrations.
- `components.json`: shadcn configuration.
- `package.json` / `package-lock.json`: **only** by running `npm install <ui-package>`. Never edit scripts or other fields.
- `docs/ui/handoffs/UI-xxx.md`: your ticket's handoff summary, written **last** (see Definition of done).

**Read-only for you:**
- Code and copy: `src/app/**`, `src/contracts/**`, `src/fixtures/**`, `src/shared/**`, `src/modules/**`, `src/platform/**`, `src/integrations/**`, `src/i18n/**`, `messages/en/app/**`, `tests/**`.
- Config: `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `playwright.config.ts`.
- Docs and instructions: `docs/**` (except your handoff file; Claude updates `docs/ui/progress.md` from it), `CLAUDE.md`, `AGENTS.md`, `scripts/**`, `automation/**`.

If a ticket seems to need a change in a read-only path (a new prop, a missing fixture, a type change), **don't make it**. Add a **Contract request** to your summary saying what you need, why, and the shape you propose. Claude handles it.

## Read before every ticket

1. The ticket: scope, contracts, states, acceptance.
2. `docs/ui/design-system.md`: tokens, layouts, components, status labels, voice, accessibility. **Binding.**
3. The contract and fixture files the ticket lists.
4. `docs/ui/ui-contract.md` for background (people, canonical money values, scenarios). If it disagrees with `src/contracts`, the code wins.
5. The Next.js block at the end of this file: this version differs from your training data.

## Stack (installed; don't change versions)

- Next.js 16.4 (App Router, **Cache Components on**), React 19.3, TypeScript strict.
- Tailwind CSS 4.3 through the Turbopack loader (no PostCSS config); global CSS is `src/ui/theme/globals.css`.
- next-intl 4 (`useTranslations`) and zod 4.

You add the UI libraries a ticket needs:
- shadcn/ui and its Radix packages
- lucide-react, sonner
- class-variance-authority, clsx, tailwind-merge
- react-hook-form and @hookform/resolvers (when a ticket has forms)
- whatever shadcn pulls in itself (vaul, cmdk, react-day-picker)

Anything else needs a contract request first.

## How UI code is written

1. **Presentational only.** Data comes in as typed props from `@/contracts`. Components never fetch, read cookies or headers, call server code, or compute business rules: no fees, permissions, visibility, or deciding which actions are available.
2. **Synchronous and isomorphic.**
   - No `async` components, no `next/headers`, `next/cache`, `server-only`, or `'use server'`.
   - Add `'use client'` only where you need state, effects, event handlers, or browser APIs, and keep those client components small.
3. **Mutations are handler props:** `ActionHandler<TInput>` → `Promise<ActionResult>`.
   - While pending: disable the control, show a spinner, set `aria-busy`.
   - Map **every** `ActionErrorCode` to friendly copy, and success codes to a toast or inline confirmation.
   - Follow `redirectTo` with `router.push`.
   - Never assume success.
4. **Actions:** render `ActionDescriptor[]` exactly as received: order, kind, enabled, disabled reason, confirm. Never add, hide, or reorder actions yourself.
5. **Links:** build every href with `routes` from `@/contracts`. No hard-coded paths.
6. **Money and time:**
   - Money: `formatMoney` (integer cents). Never compute an amount.
   - Dates and times: the `@/shared/format` helpers (America/Chicago).
   - Distance bands: map to copy.
7. **Privacy.** Only `ExactAddressPanel` renders an `ExactAddress`. Never render last names, emails, or phone numbers unless a contract field gives them to that screen. Message text arrives as `MessageSegment[]`; render masked segments, and never try to detect contact details yourself.
8. **Copy.**
   - Every user-facing string goes in `messages/en/ui/<namespace>.json` and is read with `useTranslations`.
   - Use ICU syntax for plurals and parameters.
   - Follow the voice, glossary, and banned words in design-system §6.
   - Content such as names, titles, and task text arrives in props.
9. **Accessibility: WCAG 2.2 AA** (design-system §7).
   - Semantic HTML, labelled controls, visible focus, full keyboard paths.
   - `aria-live` for async results; touch targets ≥ 44 px; never color alone; respect reduced motion.
10. **Mobile first:** design at 360 px, then 768, 1024, and 1280. No horizontal scrolling.
11. **Styling:**
    - Tailwind utilities on the design tokens (CSS variables), merged with `cn()`.
    - No CSS-in-JS. No inline style objects except for truly dynamic values.
12. **Rewards never reference reviews or ratings.**

## Previews (required)

- Every component, shell, or screen in a ticket gets previews in `src/ui/previews/<area>.preview.tsx`. Export them as `PreviewEntry[]` and register them in `src/ui/previews/registry.ts`.
- Cover **every state the ticket lists**: loading, empty, error, and each status and role variant.
  - Use fixtures from `@/fixtures`. You may derive variants, but never change canonical numbers.
  - Use `fakeHandler()` for handler props, covering success and the error codes you handle.
- Ids are `"<group>/<variant>"` in kebab-case. Use `layout: 'fullscreen'` for shells and screens.
- Browse them at **http://localhost:3000/dev/ui** (`npm run dev`).

## Tests

- Component tests with Testing Library go next to the component (`*.test.tsx`). Put `/** @vitest-environment jsdom */` on the first line, and wrap renders in `NextIntlClientProvider` with `messages/en/ui`.
- Test the UI's own logic: label maps, disabled reasons, pending and error handling, and that every action id has a label.
- **`npm run check:ui` must pass.** It runs typecheck, lint (including the import boundaries), and unit tests, then the preview harness. The harness renders every preview at 360×800 and 1280×800 and requires no runtime errors and no serious or critical axe violations. Screenshots go to `artifacts/ui-previews/`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server; previews at `/dev/ui` |
| `npm run check` | typecheck + lint + unit tests |
| `npm run test:ui` | Preview harness (Playwright) |
| `npm run check:ui` | Both; run before you finish |
| `npx shadcn@latest add <name>` | Adds primitives into `src/ui/primitives` (per `components.json`) |

## Definition of done

- Everything in the ticket's **Build** and **Acceptance** sections.
- `npm run check:ui` passes.
- **Last step: hand off.**
  - When everything above is done and `npm run check:ui` passes, write your summary to `docs/ui/handoffs/UI-xxx.md` (the ticket's id) in the format below. Show the same summary in your final message.
  - **Creating this file tells Claude you're finished.** Claude watches for it and starts the review automatically. Never create it early, and don't change any other file after writing it.
  - Follow-up fixes in the same conversation: make the fixes, run the checks again, then append a `## Follow-up N` section to the same file as your last step.
- Summary format:
  1. **Built:** components and screens (paths) and preview ids.
  2. **Contracts used:** props and handlers, and from which files.
  3. **Message namespaces** added or changed.
  4. **Dependencies added**, and why.
  5. **Contract requests**, or "none".
  6. **Known gaps or follow-ups.**
  7. **Previews to review first.**

## Don'ts

- Don't touch files outside your paths, not even to "fix" something. Report it instead.
- Don't edit contracts or fixtures, and don't change canonical values.
- Don't add data fetching, API routes, server actions, or business rules.
- Don't delete or weaken tests or lint rules.
- Don't add global state libraries, CSS-in-JS, or other component libraries.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
