# UI-035 — Brand identity and the real landing page

**Status:** ready for Codex · **Branch:** `ui/UI-035-brand-and-landing-page` · **Plan first:** no (unattended) · **Depends on:** UI-001 (tokens, primitives), UI-002 (shells), UI-003 (public pages)

## Goal
Today's look is a placeholder ("There is no brand yet", `docs/ui/design-system.md`): one pale green everywhere, a small hero, and long lists. The owner wants to see the **real product landing page** before anything else: a distinctive, beautiful brand, and a home page (`/`) that sells the product to clients and helpers in Austin.

1. **Design the brand** and apply it everywhere through the tokens: palette (light and dark), typography, logo and mark, radius, shadows, and an illustration style.
2. **Rebuild the landing page** (`HomeScreen`) as a polished marketing page with the brand and the real data in `HomePageData`.
3. **Carry the brand** through the public header and footer, and check every existing screen still looks right with the new tokens (they all use tokens, so most of this is free).

## Creative brief
- **Product:** TasksNearMe books a verified local helper for one task (assemble a desk, help load a truck, rake leaves, a light clean, set up a laptop). The price is agreed up front and paid through the platform; rebooking someone you trust takes two taps. Launching in **Austin, TX**.
- **Two audiences:** clients (busy people who want it done well, safely, at a clear price) and helpers (locals who want fair work nearby, their own prices, and repeat clients).
- **Personality:** warm, neighborly, trustworthy, practical, a little bit Texan sun. Not corporate, not cute; confident and calm. Think "a good neighbor with a toolbox", not "gig app".
- **Do:** a palette with real character (a primary with enough contrast for white text, a warm accent, warm neutrals; a dark mode that feels designed, not inverted). A distinctive but very readable type pairing (headings with personality, a highly legible body face; two families at most, via `next/font`). Generous spacing, clear hierarchy, purposeful motion (respect `prefers-reduced-motion`).
- **Imagery:** original **SVG illustrations** in one consistent style (tools, boxes, leaves, a laptop, Austin landmarks or a stylized neighborhood map). **No stock photos of people** (design-system rule) and no AI photos of people.
- **Honesty:** no invented numbers, ratings, reviews, testimonials, press logos or user counts. Every figure comes from `HomePageData` (tasks, helpers, prices, the fee example, the reward). Claims match the product (see "What to say").

## What to say (true today; keep it short)
- Post a task in minutes: what, when, where, and your budget. Local helpers send offers, or you request someone you know.
- The price is agreed up front; the full total is shown before you book (`feeExample`: a $60 task → the client pays $66.00, the helper earns $54.00; show the fee engine's numbers, never compute them).
- Your exact address is shared only with the helper you book. Helpers are ID-verified; in-home categories also need a background check. Pay through the platform; the helper is paid after you approve the work.
- Double-blind reviews; save helpers and **Book again** in two taps.
- For helpers: choose your tasks and set your prices; see your earnings before you offer; build repeat clients; the **founding helpers' welcome reward** when `welcomeReward` is present ("$50 for each of the first 100 verified helpers; 63 spots claimed"). Hide it when absent.
- Live in Austin (`market`): its neighborhoods (`market.areaNames`) and service radius.

## You may edit
`src/ui/**` (including `src/ui/theme/*`), `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-035.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` (you may rewrite its brand sections to match what you design: palette, type, logo, illustration rules)
- `docs/blueprint/01-product-brief.md` (positioning, audiences), `02-sitemap-and-journeys.md` (public pages)
- Contracts: `src/contracts/marketing.ts` (`HomePageData`, now with `feeExample` and `welcomeReward`), `money.ts` (`PriceBreakdown`), `routes.ts` (`app.newTask`, `taskBoard`, `howItWorks`, `becomeAHelper`, `pricing`, `trustAndSafety`, `helperProfile`, `waitlist`).
- Fixtures: `src/fixtures/marketing.ts` (`homePageData`, `homeNoRewardData`). The landing previews live in `src/ui/previews/public-pages.preview.tsx` (`screen-home/default`, and `screen-home/no-tasks` built as `{ ...homePageData, recentTasks: [] }`).

## Build

| Item | File | Content |
|---|---|---|
| Brand tokens | `src/ui/theme/globals.css`, `src/ui/theme/fonts.ts` | The palette as CSS variables (light and dark), mapped to Tailwind as today; type scale, radius, shadows. WCAG AA for text and controls in both modes; keep every token name the components use (add new ones as needed) |
| Logo | `public/ui/brand/logo.svg`, `public/ui/brand/mark.svg` (and the shell's logo component) | A wordmark and a square mark that works at 16 px; also `public/ui/brand/icon.svg` for the favicon and app icon (Claude wires it in the app metadata) |
| Illustrations | `src/ui/components/illustrations/*` (inline SVG components) or `public/ui/illustrations/*` | The hero and section art, one style, decorative (`aria-hidden`), light and dark aware |
| Landing page | `src/ui/screens/public/home-screen.tsx` (and shared marketing sections) | `data: HomePageData`, `now`. Sections, in an order that sells: a strong hero (one `h1`, the value in one line, **Post a task** and **Become a helper**/**Browse tasks** calls to action, hero art); what people book (categories with real price guidance); how it works (3 steps); a pricing-transparency block from `feeExample`; trust and safety; recent tasks nearby (compact; the general area only, never an address); local helpers (`featuredHelpers`, compact cards with badges and rating); for helpers (earnings, own prices, repeat clients, the welcome reward when present); the neighborhoods served; FAQ; a closing call to action |
| Public shell | header and footer (UI-002) | The new logo and brand; the header CTA; a footer that feels finished |
| Other screens | everything that renders with the tokens | Look at every preview with the new brand; fix anything that breaks (contrast, badges, charts, focus rings) |

Copy namespace: `home` (rewrite it), `marketing` and `shell` as needed. No hard-coded strings.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-home/{default,no-tasks,no-reward}` | `homePageData`, `{ ...homePageData, recentTasks: [] }`, `homeNoRewardData` | The landing page (light) |
| `screen-home/dark` | `homePageData` in dark mode | The landing page (dark) |
| `component-brand/{logo,mark,palette,type}` | — | The brand at a glance: logo on light and dark, the mark at 16, 32 and 64 px, swatches with their token names, the type scale |
| every existing preview | as before | Still renders, axe clean, with the new brand |

## Tests
- The landing page renders every section from `homePageData`, hides the reward section without `welcomeReward`, and shows the fee example's numbers exactly as supplied.
- One `h1`; sections have headings; calls to action use the route builders.
- No address text, phone or email from the data ever renders on the landing page.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (all previews at 360 and 1280, axe clean in light mode, no runtime errors, no LCP warnings for above-the-fold images: the hero art is inline SVG or a priority image).
- The landing page looks like a real product at 360, 768, 1280 and 1440 px (check them all; no horizontal scroll).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings or money math. No invented numbers or testimonials.
- The handoff includes: the palette (token → hex, light and dark), the fonts, a short brand rationale, and the screenshots to look at first.
- **Last step:** the summary (AGENTS.md format) is written to `docs/ui/handoffs/UI-035.md`.

## Out of scope
- New routes or data beyond `HomePageData`; the signed-in app's layouts (they only change through tokens); a marketing CMS; photos of people.

## Claude wiring notes (filled in by Claude after review)
- Route(s): `/` already renders `HomeScreen` with `getHomePageData()` (now with `feeExample` and `welcomeReward`).
- The favicon and app icon from `public/ui/brand/icon.svg` in the app metadata.
- e2e: the public pages specs.
