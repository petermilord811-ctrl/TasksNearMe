# AGENTS.md — TasksNearMe

Standing instructions for coding agents (Codex) working in this repository. Task prompts live in `docs/codex/prompts/`. Each one says which documents to read.

## What this product is

TasksNearMe is a person-to-person marketplace for booking local help with specific everyday tasks, launching first in Austin, Texas. One account has two modes: **"I need help"** (poster) and **"I can help"** (helper). The product source of truth is `docs/blueprint/`.

## Current phase: the complete UI on mock data

- Build every screen (public site, signed-in app, admin workspace) against **typed mock data** that already has the final shapes.
- **No real backend** in this phase: no database, no auth provider, no payment, identity, background-check, maps, email, SMS, push, or AI provider calls. Each provider is a clearly marked placeholder component with its final props.
- Clicking through the app must work. Mock actions move the dev scenario forward (see `docs/codex/ui-contract.md` §8).

## Read before any task

1. `docs/codex/ui-contract.md`: data shapes, fixtures, scenarios, actions. **Binding.**
2. `docs/codex/design-system.md`: visual rules, tokens, components, copy. **Binding.**
3. `docs/ui-progress.md`: what's done. **Update it at the end of every task.**
4. Only the `docs/blueprint/` sections your task names. Don't read the whole blueprint every time.

If a task prompt conflicts with these documents, follow the documents, then explain the conflict in your summary.

## Stack (pin exact versions in package.json)

- **Node.js 26 LTS** (installed on the dev machine; keep `"engines": { "node": ">=24" }`).
- **npm** is the package manager (pnpm isn't installed and isn't needed).
- **Next.js 16** (App Router, React Server Components, Server Actions), **React 19**, **TypeScript strict**. In Next 16, request middleware lives in `src/proxy.ts`.
- **Tailwind CSS v4 + shadcn/ui** (Radix primitives), `lucide-react` icons, `sonner` toasts.
- **react-hook-form + zod** for forms and validation.
- **next-intl**: single locale `en`, no locale prefix in URLs; all strings in `messages/en.json`.
- **Vitest + Testing Library** for unit and component tests; **Playwright + @axe-core/playwright** for end-to-end, accessibility, and screenshots.

Don't add other runtime dependencies without naming each one and why in your summary. **Never add backend or provider SDKs** (Stripe, Twilio, database clients, auth libraries, map SDKs, AI SDKs) in this phase.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with the dev toolbar |
| `npm run build` / `npm start` | Production build and serve (the dev toolbar and `/dev` routes must not exist here) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run e2e` | Playwright smoke, flow, privacy, and axe tests |
| `npm run shots` | Saves review screenshots to `artifacts/screenshots/` (360×800 and 1280×800) |
| `npm run check` | typecheck + lint + test (run before finishing any task) |

## Folder layout (UI phase; matches `docs/blueprint/07-architecture.md` §4)

```
src/app/(public)/…          public routes
src/app/(app)/app/…         signed-in routes
src/app/admin/…             staff routes
src/app/dev/…               dev-only routes (component gallery); 404 in production
src/components/ui/          shadcn primitives (generated; edit sparingly)
src/components/…            shared components: layout/, money/, forms/, maps/, feedback/, data/
src/modules/<module>/
  types.ts                  view models and enums from the UI contract
  queries.ts                data access with the final signatures (mock-backed now)
  actions.ts                server actions (mock: validate → transition → result)
  domain/                   pure logic + co-located *.test.ts (actions, fees, visibility)
  ui/                       components specific to the module
src/mocks/                  the ONLY place fake data lives: fixtures, scenarios, transitions
src/platform/               viewer.ts (mock session), clock.ts, flags.ts, format/, i18n/
src/dev/                    dev toolbar (never rendered in production)
messages/en.json            all user-facing strings
tests/e2e/                  Playwright specs, routes.ts (route × scenario matrix), shots.ts
```

Modules: `accounts`, `profiles`, `verification`, `markets`, `tasks`, `offers`, `bookings`, `payments`, `rewards`, `messaging`, `notifications`, `reviews`, `support`, `admin`.

## UI rules

1. **Mobile first.** Build and check at 360×800 first, then 768 and 1280. No horizontal scrolling. Touch targets at least 44×44 px. The signed-in app uses a bottom nav on phones and a sidebar from 1024 px.
2. **Thin pages.** Route files fetch through module `queries.ts` and render components. **Route files never import from `src/mocks`** (an ESLint rule enforces this).
3. **Every screen** has a loading state (`loading.tsx` or skeletons), an empty state, and an error state (`error.tsx` with retry). The dev toolbar can force each one.
4. **Actions come from domain functions.** Which buttons a booking, offer, invite, or reward shows comes from `getBookingActions` (and its siblings) in `domain/`, mirroring `docs/blueprint/03-state-machines.md`. Never hard-code button visibility in a page.
5. **Address privacy.** `PublicLocation` and `ExactAddress` are different types. Only `ExactAddressPanel` renders an `ExactAddress`, and only on the booking hub when the query layer allows it.
   - Never put exact addresses, phone numbers, emails, or last names in public pages, page metadata, JSON-LD, URLs, or console logs.
6. **Money.** Data holds integer cents. Display with `<Money>` and breakdowns with `<PriceBreakdown variant="poster" | "helper" | "admin">`. Fee math lives only in `src/modules/payments/domain/fees.ts`, never inside components.
7. **Strings.** All user-facing text goes in `messages/en.json` through next-intl; tests and fixtures are the only exceptions. Spanish comes later, so don't concatenate translated fragments.
8. **Accessibility: WCAG 2.2 AA.**
   - Semantic HTML, labelled controls, visible focus, complete keyboard paths.
   - `aria-live` for async results; color is never the only signal.
   - Respect `prefers-reduced-motion`.
   - axe must pass on every route.
9. **Placeholders for providers.** Payment form, Apple Pay / Google Pay, ID check, payout onboarding, background check, maps, address autocomplete, photo upload, AI drafting, push, and realtime each get one placeholder component with the final props.
   - Each shows a small "Demo" marker and simulates outcomes through the dev toolbar.
   - Mark each with `// TODO(integration): <provider> — see docs/blueprint/<doc> §<n>`.
10. **Copy.** Follow the voice and glossary in `design-system.md` §6. Never say "escrow", "wallet", "wages", "employer", "employee", or "hire" when referring to helpers.
11. **Rewards** never reference reviews or ratings, in the UI or in code (`src/modules/rewards` must not import from `src/modules/reviews`).
12. **Time.** Show dates and times in `America/Chicago` using `src/platform/format`, with explicit day, date, and time ("Sat, Nov 21 · 10:30 am"). Deadlines always say what happens when they pass.

## Mock data rules

- Canonical people, tasks, scenario IDs, and **money values** come from `docs/codex/ui-contract.md`. Don't change those numbers.
- Everyone and everything is fictional. Addresses use "Example Lane". Avatars use initials, with no photos of real people.
- Mock server actions validate input with zod, apply the transition table (or show a success toast if no transition exists), call `revalidatePath`, and return `{ ok, message }`. **No in-memory databases.**
- Query functions apply the **real visibility rules** (role-aware projections), so later wiring to the backend can't leak data.

## Definition of done (every task)

- `npm run check` and `npm run build` pass.
- Every new or changed route is in `tests/e2e/routes.ts`, passes the smoke + axe test at both viewports, and appears in `npm run shots`.
- Flows named in the task have Playwright tests. Domain functions have unit tests.
- `docs/ui-progress.md` is updated.
- End with a summary: what you built; files changed; decisions and assumptions; anything not done; new dependencies and why; which scenarios a reviewer should open.

## Don'ts

- Don't edit `docs/blueprint/`. Report gaps in your summary instead.
- Don't delete, skip, or weaken tests to make them pass.
- Don't build outside the task's scope. List ideas in your summary.
- Don't add global state libraries, CSS-in-JS, or other component libraries.
- Don't commit secrets or real personal data. There are no API keys in this phase.
