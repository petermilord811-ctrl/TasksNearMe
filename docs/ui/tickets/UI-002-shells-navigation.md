# UI-002 — Page shells and navigation

**Status:** ready for Codex · **Branch:** `ui/UI-002-shells-navigation` · **Plan first:** yes · **Depends on:** UI-001 (merged)

## First: UI-001 follow-ups
Claude answered both UI-001 contract requests. Do these two small changes before the shells:
1. **`VerificationBadges`:** replace the full-date fallback with `formatMonthYear` from `@/shared/format`, so the badge reads "ID verified · Nov 2026" and "Background checked · Nov 2026". Update its tests.
2. **Maps link:**
   - The `location/exact-address` preview passes `mapsHref={routes.external.googleMapsSearch(deskExactAddress)}`, so **Open in maps** is enabled.
   - Add `location/exact-address-no-maps` for the disabled state.
   - In the app, Claude passes `mapsHref` the same way.

Then update the "App handoff and contract requests" notes in `src/ui/README.md` to say both requests are resolved.

## Goal
The four page frames every route sits in: public site, signed-in app tab pages, detail/flow pages, and admin. They include the mode switch, bottom nav, sidebar, and account menus, all driven by props.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-002.md` (last step).

## Read first
- `AGENTS.md`
- `docs/ui/design-system.md` §3 (layout and navigation), §4, §6, §7
- Contracts:
  - `src/contracts/shell.ts`: `ShellViewer`, `SignedInViewer`, `StaffViewer`, `AppShellHandlers`, `AdminShellHandlers`, `Breadcrumb`
  - `src/contracts/routes.ts`: `routes`, `LEGAL_DOCS`
  - `src/contracts/common.ts`: `CATEGORY_SLUGS`, `STAFF_ROLES`, `Mode`
  - `src/contracts/actions.ts`
- Fixtures: `src/fixtures/shell.ts` (`publicViewer`, `mayaShell`, `jordanShell`, `priyaShell`, `alexStaff`, `morganStaff`, `rileyStaff`), `fakeHandler`
- Product context: `docs/blueprint/02-sitemap-and-journeys.md` §1

## Build (in `src/ui/shells/`)
| Component | Props | Notes |
|---|---|---|
| `Logo` | `variant?: 'full' \| 'mark'` | SVG wordmark plus a pin-with-check mark; links to `routes.home()` where used. |
| `PublicShell` | `viewer: ShellViewer`, `children`, `currentPath?: string` | Details below. |
| `AppShell` | `viewer: SignedInViewer`, `handlers: AppShellHandlers`, `children`, `currentPath?: string` | Tab pages. Details below. |
| `DetailPageShell` | `title: string`, `backHref: string`, `actions?: ReactNode`, `children` | Top bar with a back link (`aria-label`) and the title. No bottom nav. A sticky bottom slot for `actions` with safe-area padding. Content max width 720 px. |
| `AdminShell` | `viewer: StaffViewer`, `handlers: AdminShellHandlers`, `breadcrumbs?: Breadcrumb[]`, `children`, `currentPath?: string` | Details below. |
| `nav.ts` | — | Pure functions that build the nav items for poster mode, helper mode, and each admin role, plus the active-item matching. Unit-tested. |

**Every shell:**
- Has a skip link and a `<main id="main">`.
- Highlights the active nav item by matching `currentPath`, defaulting to `usePathname()`. Home matches exactly; other items match by prefix.

**`PublicShell`**
- **Header:** `Logo`; How it works, Become a helper, Pricing.
- **Primary CTA "Post a task":**
  - Signed in: `routes.app.newTask()`.
  - Public: `routes.signIn(routes.app.newTask())`.
- **Account link:** public: Sign in; user: "Go to the app" (`routes.app.home()`); staff: "Staff area" (`routes.admin.home()`).
- **Phones:** a menu sheet.
- **Footer:** Austin, the 5 categories (`routes.category`), Trust & safety, Help, the legal docs (`routes.legal` for each of `LEGAL_DOCS`).

**`AppShell`**
- **Top bar:** `Logo`, **ModeSwitch**, notifications bell (count from `unreadNotifications`, links to `routes.app.notifications()`), and the avatar menu.
- **Avatar menu:** Account, Rewards (helper), Saved helpers (poster), Payments, Support, and Sign out (calls `handlers.onSignOut`, then goes home).
- **Bottom nav** (below 1024 px):
  - Poster: Home · Tasks · Bookings · Messages (badge `unreadMessages`) · Account.
  - Helper: Home · Find work · Bookings · Messages · Earnings.
- **Sidebar** (1024 px and up): the same items plus secondary ones.
  - Poster: Saved helpers, Payments, Support.
  - Helper: Offers, Availability, My clients, Rewards, Support.
- **Banner:** when `mode === 'helper'` and `!helperReady`, show "Finish setting up to start helping" linking to `routes.app.helperOnboarding()`.

**ModeSwitch**
- A two-option segmented control, "I need help" / "I can help", with proper radio or pressed semantics.
- Calls `handlers.onModeChange({ mode })` and shows a pending state.
- On `redirectTo`, calls `router.push`. On an error code, shows a toast.

**`AdminShell`**
- **Sidebar:** Queues, Cases, Reports, Users, Bookings, Payments, Rewards, Config*, Audit, Staff*. Items marked * appear only for the `admin` role.
- A "Staff area" badge and role badge(s).
- A search form that submits GET to `routes.admin.search(q)`.
- Breadcrumbs, and the avatar menu with Sign out.
- On phones the sidebar opens in a sheet.

Handlers and result codes:

| Handler | Input | Success | Errors to handle |
|---|---|---|---|
| `AppShellHandlers.onModeChange` | `{ mode: Mode }` | `updated` (optionally with `redirectTo`) | `not_allowed`, `rate_limited`, `unknown` |
| `onSignOut` (both shells) | — | `updated` | `unknown` |

Copy namespace: `shell`.

## States to preview (all `layout: 'fullscreen'`)
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `shell/public-signed-out` | `publicViewer` | Header, menu sheet on phones, footer |
| `shell/public-signed-in` | `mayaShell` | "Go to the app" instead of Sign in |
| `shell/app-poster` | `mayaShell`, `currentPath: '/app/bookings'` | Poster nav, Bookings active, badges |
| `shell/app-helper` | `jordanShell`, `currentPath: '/app/find-work'` | Helper nav |
| `shell/app-helper-not-ready` | `priyaShell` | Setup banner |
| `shell/app-mode-switch-redirect` | `priyaShell` + `fakeHandler({ ok: true, code: 'updated', redirectTo: '/app/helper/onboarding/profile' })` | Pending → redirect |
| `shell/detail-page` | — | `DetailPageShell` with a sticky primary action |
| `shell/admin-agent` | `alexStaff`, breadcrumbs | No Config or Staff items |
| `shell/admin-admin` | `rileyStaff` | Config and Staff visible |

## Tests (jsdom)
- `nav.ts`: the item sets for poster and helper modes; the active item for `/app` (Home), `/app/bookings/abc` (Bookings), and `/app/find-work` (Find work); Config and Staff only for `admin`.
- ModeSwitch calls the handler with the other mode, disables itself while pending, and follows `redirectTo`. Mock `next/navigation`.
- The skip link targets `#main`.

## Acceptance
- Every item in **Build** exists, and every **State to preview** is registered.
- `npm run check:ui` passes.
- No imports outside the allowed areas (lint).
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-002.md`. That file tells Claude you're done.

## Out of scope
Page content; the notifications list; auth logic; redirects for staff who haven't passed the two-step check (Claude handles those on the server).

## Claude wiring notes (after review)
- `(public)/layout.tsx` → `PublicShell`. `(app)/app/layout.tsx` → `AppShell` with `getShellViewer()` and server actions `setMode` / `signOut`. `admin/layout.tsx` → `AdminShell` plus the server-side two-step redirect.
- Detail routes use `DetailPageShell` in their page components.
