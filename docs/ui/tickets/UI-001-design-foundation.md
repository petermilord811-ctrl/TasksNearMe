# UI-001 — Design foundation: theme, primitives, core components

**Status:** ready for Codex · **Branch:** `ui/UI-001-design-foundation` · **Plan first:** yes · **Depends on:** —

## Goal
The design system exists in code: tokens, fonts, shadcn/ui primitives, and the shared display components every later screen uses, each with previews. Nothing app-specific yet (no shells, no screens).

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and the UI-001 row in `docs/ui/progress.md`.

## Read first
- `AGENTS.md` (all of it)
- `docs/ui/design-system.md` (all of it)
- Contracts: `src/contracts/common.ts`, `status.ts`, `money.ts`, `people.ts`, `location.ts`, `actions.ts`, `action-ids.ts`, `timeline.ts`, `messaging.ts`, `routes.ts`
- Fixtures: `src/fixtures/` (people, money, locations, timeline, actions, messaging)
- Formatters: `src/shared/format` (`formatMoney`, `formatDate`, `formatTime`, `formatDateTime`, `formatTimeRange`, `formatRelative`, `formatHours`)
- Badge meanings: `docs/blueprint/06-verification-trust-compliance.md` §1

## Build

### 1. shadcn/ui setup
- Run `npx shadcn@latest init`. Check `--help` for non-interactive flags. Settings:
  - CSS file `src/ui/theme/globals.css`; CSS variables on; base color neutral; RSC on; icon library lucide.
  - Aliases: components `@/ui/components`, ui `@/ui/primitives`, utils `@/ui/lib/utils`, lib `@/ui/lib`, hooks `@/ui/hooks`.
- If the CLI writes anything outside your paths (for example `src/lib/utils.ts` or `src/app/globals.css`), move it into `src/ui`, revert the outside change, and mention it in your summary.
- Add the primitives listed in design-system §4.1.

### 2. Theme: `src/ui/theme/globals.css` (keep `@import "tailwindcss";`)
- All tokens from design-system §2.1–§2.3:
  - Light colors, plus dark under the custom variant `@custom-variant dark (@media (prefers-color-scheme: dark));`.
  - The 7 badge tones, the reward tone, radius, and shadows.
- Map everything to Tailwind with `@theme inline`, including `--font-sans` and `--font-heading` from `src/ui/theme/fonts.ts`. Keep exporting `fontVariables`; the root layout uses it.
- Base styles:
  - Body background and foreground; headings in the heading font.
  - A 2 px focus ring with offset; a `tabular-nums` utility.
  - Reduced motion turns off transitions and shimmer.
  - 16 px minimum font size on inputs.

### 3. Components
Put them in `src/ui/components/<group>/` and export them from `src/ui/components/index.ts`.

| Component | Props (contract types) | Notes |
|---|---|---|
| `Money` | `cents: Cents`, `signDisplay?: 'auto' \| 'always'`, `size?: 'sm' \| 'md' \| 'lg'` | Uses `formatMoney`; `tabular-nums`. |
| `StatusBadge` | `tone: BadgeTone`, `label: string`, `icon?` | Text is always visible; color is never the only signal. |
| Status label hooks (`components/status/`) | `BookingStatus` + `ViewerRole`; `OfferStatus` + viewer; `InviteStatus` + viewer; `PaymentStatus`; `EarningsStatus`; `RewardStatus`; `CaseStatus` | Return `{ label, tone }` per design-system §5. Strings live in the `status` namespace. |
| `PriceBreakdown` | `breakdown: PriceBreakdown`, `variant: BreakdownVariant`, `title?: string` | Lines per variant (see the comment in `src/contracts/money.ts`). Hourly: "$35.00 × 4 h (cap)" / "× 3.5 h". Final breakdowns show charged, refund, and total. The helper fee shows as a negative. Reimbursement is its own line. Admin adds platform revenue. Use a `<dl>` and emphasize totals. **No arithmetic: display the given numbers only.** |
| `Deadline` | `at: ISODateTime`, `now: ISODateTime`, `label?: string`, `tone?: 'neutral' \| 'warning' \| 'danger'` | "Tue, Nov 24 · 11:48 am — in 3 days", in a `<time dateTime>`. |
| `EmptyState` | `title`, `body?`, `icon?`, `action?` (a link, from `routes`) | — |
| `ErrorState` | `title?`, `body?`, `onRetry?: () => void` | Default copy comes from messages. |
| `PageSkeleton` | `variant: 'list' \| 'detail' \| 'form' \| 'cards'` | Respects reduced motion. Claude will use these as `<Suspense>` fallbacks. |
| `DemoBadge` | `label?` | Marks provider placeholders. |
| `InitialsAvatar` | `initials`, `size` | Brand-tinted circle. |
| `VerificationBadges` | `badges: VerificationBadges`, `compact?` | "ID verified · Nov 2026", "Background checked · Nov 2026", "Phone verified". Each has a tooltip explaining what it means and doesn't mean (blueprint 06 §1). |
| `RatingStars` | `rating?: RatingSummary` | Display only, with a text equivalent ("4.9 out of 5, 112 reviews"). Shows "New" when no rating is given. |
| `PageHeader`, `Section`, `KeyValueList` | Titles and children; `items: { label, value }[]` | Layout helpers. |
| `MaskedText` | `segments: MessageSegment[]` | Masked phone: "•••-•••-0134 (hidden until booking)". Masked email: "•••@••• (hidden until booking)". |
| `GeneralArea` + `AreaMapPlaceholder` | `location: TaskLocation`, `showMap?: boolean` | Area name and distance band copy. An SVG with a ~1-mile circle; no map SDK. Descriptive `aria-label`. Remote variant: "Remote — no address needed". |
| `ExactAddressPanel` | `address: ExactAddress`, `visibleUntil?: ISODateTime` | Address, access notes, a **Copy address** button, an **Open in maps** link (Google Maps search URL, new tab), and "Visible to you until {date}". |
| `Timeline` | `events: TimelineEvent[]` | Copy per `type` from the `timeline` namespace, with params (money via `formatMoney`, times via `formatTime`). |
| `ActionBar` | `actions: ActionDescriptor[]`, `onAction: (id: string) => Promise<ActionResult>`, `sticky?: boolean` | Details below. |
| `AppToaster` | — | Sonner wrapper; Claude mounts it in the root layout after this ticket. |

**`ActionBar` details:**
- Render the actions in the order given. Primary first; on phones the rest go behind **More**, on desktop they're buttons. Destructive actions use destructive styling.
- A disabled action shows its reason as helper text (`actionReasons.<code>`, with `at` formatted).
- `confirm: true` opens an alert dialog before calling the handler.
- While a call is pending, that button shows a spinner.
- When the result comes back: success shows a toast (`feedback.success.<code>`); an error shows a toast or inline message (`feedback.error.<code>`).
- **Every id in `ALL_ACTION_IDS` needs a label** (`actions.<id>`).

### 4. Messages
Add the namespaces `common`, `money`, `status`, `actions`, `actionReasons`, `feedback`, `timeline`, `verification`, `location`, and `layout`, each as a JSON file registered in `messages/en/ui/index.ts`. Copy follows design-system §6.

### 5. Previews
Add the previews listed below and **delete `harness.preview.tsx`** from the registry.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `money/amounts` | — | 6600, −600, +2200 (delta), 0, in three sizes |
| `status-badge/booking-poster`, `status-badge/booking-helper` | — | Every `BookingStatus` as each viewer |
| `status-badge/offers`, `/invites`, `/payments`, `/earnings`, `/rewards`, `/cases` | — | Every value of each enum |
| `price-breakdown/desk-poster`, `/desk-helper`, `/desk-admin` | `deskBreakdown` | $66.00 / $54.00 / platform revenue $12.00 |
| `price-breakdown/small-task-poster` | `smallTaskBreakdown` | $3.00 minimum fee |
| `price-breakdown/moving-funded-poster`, `/moving-final-poster`, `/moving-final-helper` | `movingFundedBreakdown`, `movingFinalBreakdown` | Cap vs approved hours; refund $19.25; earnings $110.25 |
| `price-breakdown/expenses-final-poster`, `/expenses-final-helper` | `deskWithExpensesFinalBreakdown` | Allowance, approved $8.00, refund $12.00, reimbursement separate |
| `price-breakdown/settled-poster`, `/settled-helper` | `deskSettledBreakdown` | Refund $16.50; earnings $40.50 |
| `deadline/upcoming`, `/soon`, `/passed` | `DESK_TIMES` | Approval due (in 3 days), in 30 minutes, passed |
| `feedback/empty`, `/error`, `/skeletons`, `/demo-badge` | — | Each with variants |
| `people/avatars`, `/verification-badges`, `/ratings` | `jordan`, `sam`, `priya`, `lee` | Sizes; all badges, some badges, none; 4.9 (112), 4.6 (9), New |
| `location/general-area-poster`, `/general-area-helper`, `/remote` | `muellerArea`, `muellerAreaForJordan`, `remoteLocation` | With and without a distance band |
| `location/exact-address` | `deskExactAddress`, `DESK_TIMES.addressHidden` | Copy and open-in-maps, with the visible-until note |
| `masked-text/phone`, `/email`, `/unmasked` | `maskedPhoneMessage`, `maskedEmailMessage`, `unmaskedMessage` | — |
| `timeline/desk-completed` | `deskTimelineCompleted` | Full desk journey |
| `action-bar/approve-confirm` | `deskCompletionSubmittedPosterActions` + `fakeHandler()` | Confirm dialog before approve |
| `action-bar/disabled-reason` | `deskBeforeNoShowPosterActions` | "Available at 11:00 am" |
| `action-bar/day-of-helper` | `deskDayOfHelperActions` | "Another change is already open" |
| `action-bar/error-result` | Any set + `fakeHandler({ ok: false, code: 'payment_declined' })` | Error toast |
| `layout/page-header`, `/section`, `/key-value-list` | — | — |

## Tests (jsdom, with next-intl provider)
- `PriceBreakdown` with `deskBreakdown`: the poster variant shows $66.00, the helper variant shows $54.00. With `movingFinalBreakdown`, the poster variant shows the $19.25 refund.
- Every id in `ALL_ACTION_IDS` has an `actions.<id>` message.
- `ActionBar`:
  - A disabled action shows its reason text.
  - With `confirm`, the handler isn't called until the dialog is confirmed.
  - The button is disabled while pending.
  - An error result shows the error copy.
- Booking status labels: `completion_submitted` reads "Needs your approval" for the poster and "Waiting for approval" for the helper.
- `Money(-600)` renders "−$6.00".

## Acceptance
- Every item in **Build** exists, and every **State to preview** is registered.
- `npm run check:ui` passes.
- No imports outside the allowed areas (lint).
- The UI-001 row in `docs/ui/progress.md` says **UI done**.
- Summary in the AGENTS.md format, including contract requests.

## Out of scope
Page shells and navigation (UI-002); any screen or route; mounting `AppToaster` (Claude does that).

## Claude wiring notes (after review)
- Mount `AppToaster` in `src/app/layout.tsx`. Use `PageSkeleton` variants as `<Suspense>` fallbacks.
