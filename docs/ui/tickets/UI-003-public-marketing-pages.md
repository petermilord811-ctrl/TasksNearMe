# UI-003 — Public marketing pages

**Status:** ready for Codex · **Branch:** `ui/UI-003-public-marketing-pages` · **Plan first:** no (unattended) · **Depends on:** UI-002 (merged)

## Goal
The public site's marketing screens: home, market, category, how it works, become a helper, pricing, trust and safety. Also two reusable cards, a public task card and a helper card, that later screens reuse. These are presentational screens; Claude wires them into the public routes inside `PublicShell`.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-003.md` (last step).

## Read first
- `AGENTS.md`
- `docs/ui/design-system.md` §3 (public site), §4.2, §6 (voice, glossary, key sentences), §7, §8 (category icons)
- Contracts: `src/contracts/tasks.ts` (`TaskPublicView`), `marketing.ts`, `people.ts` (`HelperSummary`), `money.ts`, `location.ts`, `routes.ts`, `common.ts`
- Fixtures: `src/fixtures/marketing.ts` (all page data and public tasks), `people.ts`, `money.ts`, `locations.ts`
- Product content (write the copy from these; don't copy whole paragraphs):
  - `docs/blueprint/01-product-brief.md` §1, §3, §5, and **§6.1 (what's included and excluded per category)**
  - `docs/blueprint/02-sitemap-and-journeys.md` J1–J8 (how it works)
  - `docs/blueprint/04-payments-and-fees.md` §3–§6 (pricing explanations; never say "escrow")
  - `docs/blueprint/05-rewards.md` §4 (helper reward terms)
  - `docs/blueprint/06-verification-trust-compliance.md` §1–§2 (what verification means, safety)

## Build

**Components** (export from `src/ui/components/index.ts`):

| Component | File | Props | Notes |
|---|---|---|---|
| `PublicTaskCard` | `components/tasks/public-task-card.tsx` | `task: TaskPublicView`, `now: ISODateTime`, `headingLevel?: 2 \| 3` | Title links to `routes.publicTask(slug)`. Shows the category icon and name; the area name or "Remote"; the date and window ("Sat, Nov 21 · 10:00 am–1:00 pm", or "Any time on Wed, Nov 25" when flexible); the budget ("$60.00", or "$35.00/h, up to 4 h"); the offer count ("3 offers" / "No offers yet"); "Posted 2 days ago"; and poster trust signals (name, phone verified, member since). **No photos, no address.** |
| `HelperCard` | `components/people/helper-card.tsx` | `helper: HelperSummary`, `variant?: 'compact' \| 'full'` | Initials avatar, name, headline, area, compact `VerificationBadges`, `RatingStars`, completed count, "Usually responds in about 20 min", services with "from $45.00" or "$35.00/h", and a founding-helper badge when `foundingHelperNumber` is set. Links to `routes.helperProfile(handle)` |

**Screens** (`src/ui/screens/public/`). Each has exactly one H1, and is synchronous; use small client islands only for tabs and accordions.

| Screen | Props | Content |
|---|---|---|
| `HomeScreen` | `data: HomePageData`, `now: ISODateTime` | Hero with **Post a task** (`routes.app.newTask()`); how it works in 3 steps; category grid (`routes.category`); a trust strip using the design-system key sentences (payment timing, address privacy, ID-verified helpers); recent tasks (`PublicTaskCard`, with an empty state); featured helpers (`HelperCard`); coverage (market area names); a become-a-helper band (`routes.becomeAHelper()`); FAQ accordion |
| `MarketScreen` | `data: MarketPageData`, `now` | Market landing: categories, recent tasks, featured helpers, coverage note ("Austin and nearby, within about 15 miles"), and a link to `routes.waitlist()` for people outside the area |
| `CategoryScreen` | `data: CategoryPageData`, `now` | What's included and what isn't, **per category, from blueprint 01 §6.1**. Typical price ("Typical in Austin: $50.00–$80.00 per item"). How fixed or hourly pricing works for this category. A background-check note for in-home categories; a remote note for computer help (screen sharing; you keep control). Recent tasks (empty state when none), top helpers, CTA |
| `HowItWorksScreen` | none | Tabs "I need help" / "I can help" with 4–5 steps each, from blueprint 02. Includes the payment-timing and address-privacy sentences |
| `BecomeHelperScreen` | `data: BecomeHelperPageData` | Requirements: ID check, payout setup, and a background check for in-home categories. Earnings example (`PriceBreakdown` helper variant). First-payout timing. Reward cards only when present: welcome ("$50.00 gift card for our first 100 verified helpers · 37 spots left", from `cohortLimit − spotsClaimed`, plus the terms) and repeat. The sentence "Rewards never depend on reviews or ratings." CTA to `routes.signIn(routes.app.helperOnboarding())` |
| `PricingScreen` | `data: PricingPageData` | How fees work (percentages and minimum from `data.fees`). The fixed example, with poster and helper breakdowns side by side on desktop and stacked on phones. The minimum-fee example. Hourly: funded, then final. Expenses. A cancellation table (free until 24 h; late fee with the helper receiving all of it; helper cancels → full refund). Auto-approval after 72 h. Invite holds for 48 h. Values come only from `data` |
| `TrustSafetyScreen` | none | What the badges mean (and don't); address privacy; payment timing; reviews (two-way, no rewards for reviews); reporting and safety (call 911 first); prohibited tasks (`routes.legal('prohibited-tasks')`) |

Copy namespaces: `publicPages` (one sub-object per screen, plus `categories.<slug>` for included/excluded lists), `taskCard`, `helperCard`.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `task-card/desk`, `/yard`, `/cleaning-flexible`, `/remote` | `deskPublicTask`, `yardPublicTask`, `cleaningPublicTask`, `remoteComputerPublicTask`; `now` = `2026-11-17T15:00:00.000Z` | Local fixed, outdoor, flexible window, remote |
| `task-card/hourly` | Derived from `deskPublicTask` with `budget: { type: 'hourly', rateCents: 3500, estimatedHours: 3, hoursCap: 4 }` | Hourly budget |
| `helper-card/sam-full`, `/jordan-founding`, `/lee-compact` | `sam`, `jordan`, `lee` | Variants |
| `screen-home/default`, `/no-tasks` | `homePageData` (and `recentTasks: []`) | Phone and desktop |
| `screen-market/default` | `homePageData` (as `MarketPageData`) | — |
| `screen-category/furniture`, `/moving-empty`, `/computer-remote` | `furnitureCategoryPageData`, `movingCategoryPageData`, and computer help (`categoryViews[4]` + `remoteComputerPublicTask`) | With tasks, empty, remote |
| `screen-how-it-works/default` | — | Both tabs (use the poster tab in the screenshot) |
| `screen-become-helper/with-rewards`, `/no-rewards` | `becomeHelperPageData`, `becomeHelperNoRewardsData` | Reward cards present and absent |
| `screen-pricing/default` | `pricingPageData` | $66.00 / $54.00, $28.00 minimum, $154.00 → $134.75, expenses, cancellation |
| `screen-trust-safety/default` | — | — |

## Tests
- `PublicTaskCard`: shows "Mueller" for the desk, "Remote" for computer help, "$60.00" for fixed, "$35.00/h, up to 4 h" for hourly, and "No offers yet" when the count is 0.
- `PricingScreen` shows $66.00 and $54.00 and the $19.25 refund from the fixture.
- `BecomeHelperScreen` shows "37 spots left" with rewards and no reward cards without them.
- A test fails if any `publicPages`, `taskCard`, or `helperCard` message contains a banned word (design-system §6: escrow, wallet, wages, employer, hire).

## Acceptance
- Every item in **Build** exists, and every **State to preview** is registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint).
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-003.md`.

## Out of scope
Routes and data fetching (Claude). Sign-in, waitlist form, help center, and legal pages (UI-004). The public task board, public task page, and helper profile page (UI-005).

## Claude wiring notes (after review)
- Routes `/`, `/[market]`, `/[market]/[category]`, `/how-it-works`, `/become-a-helper`, `/pricing`, `/trust-and-safety` inside `(public)` with `PublicShell`.
- Data from markets, tasks, and profiles queries. Pricing and become-a-helper data come from the fee engine and the reward programs.
