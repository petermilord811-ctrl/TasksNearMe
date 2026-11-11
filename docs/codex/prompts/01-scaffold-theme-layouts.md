# Prompt 01 — Scaffold, theme, layouts, tooling

**Plan first:** yes · **Depends on:** — · **Branch:** `ui/01-scaffold`

## Read first
- `AGENTS.md` (all of it)
- `docs/codex/design-system.md` §2 (tokens), §3 (layout and navigation), §4.1 (primitives)
- `docs/codex/ui-contract.md` §13 (routes added in the UI phase)
- `docs/blueprint/02-sitemap-and-journeys.md` §1 (every route)
- `docs/blueprint/07-architecture.md` §4 (repository tree)

## Goal
A running Next.js 16 app with the theme, the three layouts, a stub page for every route, and the test tooling. Later prompts only add screens.

## Build
1. **Scaffold.** `create-next-app` can't scaffold in place here: the repo root already has files (`AGENTS.md`, `docs/`, `.gitignore`) and its folder name has capital letters. So:
   - Run `create-next-app@latest` non-interactively in a temporary **sibling** folder `../tnm-scaffold` with TypeScript, ESLint, Tailwind CSS, App Router, `src/` directory, import alias `@/*`, and npm. Check `npx create-next-app@latest --help` for current flag names, and accept the defaults for any other question.
   - Move everything except `.git` and `node_modules` into the repo root. **Merge** its `.gitignore` into ours, keeping our lines. **Never overwrite** `AGENTS.md` or `docs/`.
   - Set `"name": "tasksnearme"`, delete the temporary folder, and run `npm install`.
   - Pin exact versions (no `^` or `~`). Add `"engines": { "node": ">=24" }` and an `.nvmrc` containing `26`.
2. **shadcn/ui.** Initialize it (check `npx shadcn@latest --help` for non-interactive flags) and add every primitive in design-system §4.1.
3. **Theme.**
   - Put the design-system §2 tokens in `src/app/globals.css`: light, plus dark through `prefers-color-scheme`. Map the extra tokens (success, warning, info, reward, badge tones) with `@theme inline`.
   - Load Plus Jakarta Sans and Inter with `next/font` as `--font-heading` and `--font-sans`.
   - Add a `tabular-nums` utility for money.
4. **i18n.**
   - next-intl **without locale routing**: a single locale, `en`.
   - Put strings in `messages/en.json` with namespaces `common`, `nav`, `public`, `app`, `admin`, `errors`.
   - Request config in `src/i18n/request.ts`, plugin in `next.config.ts`.
5. **Layouts** (design-system §3):
   - **Root:** fonts, `<html lang="en">`, `NextIntlClientProvider`, Sonner `Toaster`, skip link.
   - **`(public)`:** header (SVG wordmark logo, links, **Post a task**, **Sign in**, phone menu sheet) and footer.
   - **`(app)/app`:** top bar with the mode switch, bell, and avatar menu. On phones, a bottom nav (poster and helper item sets); from 1024 px, a sidebar. Also add a `DetailPageShell` for detail and flow pages: top bar with back and title, no bottom nav, and a sticky action-bar slot.
   - **`admin`:** sidebar, "Staff area" badge, role badge, a search box (non-functional for now), and a breadcrumbs slot.
   - Until prompt 02 adds the toolbar, use a stub `src/platform/viewer.ts`. `getViewer()` returns Maya in poster mode on `/app`, Alex on `/admin`, and public elsewhere. The mode switch toggles a cookie.
6. **Route stubs.** Create a page for **every** route in blueprint 02 §1 and ui-contract §13; dynamic segments accept any value.
   - Each stub renders its title in a `PageHeader` and an `EmptyState` reading "Coming in prompt NN" (take the numbers from `docs/ui-progress.md`).
   - Add `loading.tsx` and `error.tsx` per route group, plus a branded `not-found.tsx`.
7. **PWA basics.** `src/app/manifest.ts` (name, short name, colors from the tokens) and `src/app/icon.svg` (the logo mark).
8. **`src/proxy.ts`** (Next 16). No auth yet. Set only harmless security headers: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
9. **Tooling.**
   - Add the scripts listed in AGENTS.md.
   - ESLint (Next config) plus `no-restricted-imports` with two rules: forbid `@/mocks` and `@/mocks/*` in `src/app/**`, and forbid `@/modules/reviews*` in `src/modules/rewards/**`.
   - Vitest + Testing Library + jsdom, with one sample test.
   - Playwright with projects `mobile` (360×800) and `desktop` (1280×800). Its `webServer` runs `npm run dev`. Add `@axe-core/playwright`, and install the Chromium browser.
   - `tests/e2e/routes.ts`: an array of `{ name, path, viewer?, scenario? }` covering every stub route. Use sample IDs such as `desk` and `sam`.
   - `tests/e2e/smoke.spec.ts`: visit every entry; expect status 200 (or an intended 404), no console errors, and no serious or critical axe violations.
   - `tests/e2e/shots.ts` and `npm run shots`: full-page screenshots for every entry at both viewports, saved to `artifacts/screenshots/<viewport>/<name>.png`.
10. **Root `README.md`:** install, `npm run dev`, the scripts, and a link to `docs/codex/README.md`.

## Acceptance
- `npm run check`, `npm run build`, and `npm run e2e` pass.
- Every route from blueprint 02 §1 and ui-contract §13 resolves and passes axe at both viewports.
- At 360 px the bottom nav shows the five poster items, and switching to "I can help" shows the helper items. At 1280 px the sidebar shows instead.
- No hard-coded UI strings outside `messages/en.json`.
- `docs/ui-progress.md`: mark 01 done and every stub route as `[~]`.

## Out of scope
Real content, mock data, and the dev toolbar (all prompt 02).

## Review (for the human)
Run `npm run dev`. In a phone-width window, open `/`, `/app`, `/app/bookings/abc`, and `/admin`. Toggle the mode switch. Check colors and fonts in both light and dark OS settings.
