# Design system (binding for the UI phase)

The brand (from UI-036): warm paper, ember orange and iridescent light. Every color and font is a CSS variable in `src/ui/theme/globals.css`, so a change is a token change, not a rewrite.

## 1. Personality

**Help, right where you are.** Warm, quick, and exact about money and time, with a little delight. Calm surfaces and clear numbers carry the product pages; the landing page adds light and motion that respond to the visitor. No hype, no dark patterns, no invented numbers. Trust signals (verification, payment timing, privacy) appear at the moment they matter, not as decoration.

## 2. Tokens

Tokens live in `src/ui/theme/globals.css` (the single global stylesheet, imported by the root layout) as shadcn/ui CSS variables.

- **Light and dark.** The OS decides until the visitor picks in the top bar's switch. The choice is saved (`tnm-theme`) and applied before paint by `src/ui/theme/theme-script.ts` as `data-theme` on `<html>`. Tailwind's `dark:` variant follows both: it matches `[data-theme="dark"]`, and the OS setting unless `data-theme="light"`.
- Any subtree can force a theme with `data-theme="light"` or `"dark"` (previews use this).
- Map extra tokens into Tailwind with `@theme inline`, the same way shadcn does for its own tokens.

### 2.1 Colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#FBF7F2` | `#0F0D0B` | Page background (warm paper) |
| `--foreground` | `#17120E` | `#F7F1EA` | Body text (ink) |
| `--card` / `--popover` | `#FFFFFF` | `#181511` / `#1D1914` | Surfaces |
| `--primary` | `#C13F12` (4.9:1 on the page, 4.6:1 on paper) | `#FF8B5C` | Main actions and links (ember) |
| `--primary-foreground` | `#FFFFFF` (5.3:1 on primary) | `#1A0B04` | Text on primary |
| `--primary-hover` | `#AB3510` | `#FFA47E` | Primary hover |
| `--secondary` / `--secondary-foreground` | `#FFEBDD` / `#8A3410` | `#2C1E16` / `#FFD3B8` | Secondary buttons, brand tint |
| `--muted` / `--muted-foreground` | `#F3EDE5` / `#6A6158` | `#1F1B16` / `#B8AEA2` | Subtle fills, secondary text |
| `--accent` / `--accent-foreground` | `#F1ECFF` / `#17120E` | `#231E35` / `#F7F1EA` | Hover fills (menus, rows) |
| `--violet` / `--violet-soft` | `#6D4EF5` / `#EFEAFF` | `#B4A0FF` / `#231E35` | The one vivid word in a headline; small accents |
| `--ring` | `#7C5CFF` | `#A48BFF` | Focus ring (2 px + 2 px offset) |
| `--destructive` | `#B42318` | `#FF8A80` | Destructive actions, errors |
| `--border` / `--input` | `#E9E0D4` / `#8F8577` | `#2E2822` / `#8A8075` | Lines, input borders |
| `--success` | `#217A46` | `#7FD39C` | Positive icons and text on plain surfaces |
| `--warning` | `#9A4F05` | `#F2B866` | Attention |
| `--info` | `#3A55C4` | `#9DB4FF` | Neutral information |
| `--reward` | `#F5B544` (text on it `#3D2604`) | `#F5B544` (text `#2A1A03`) | Gift-card rewards only |

**Iridescent light:** `--iri-1` to `--iri-4` (`#FF8A5B`, `#FF5FA2`, `#8B5CF6`, `#6C8CFF`; in dark `#FF9A6E`, `#FF79B4`, `#A585FF`, `#85A2FF`), combined as the `--iridescent` gradient and the `text-iridescent` utility. Use it for the logo tile, the hero light, progress bars and the closing band. Never put body text on it.

**Category colors** (map dots, category icons): `--cat-furniture-assembly` `#F07A2B`, `--cat-moving-help` `#8B5CF6`, `--cat-yard-cleanup` `#2E9E68`, `--cat-light-cleaning` `#E5508A`, `--cat-computer-help` `#3B7BF6` (lighter in dark mode). They're decoration: always show the category's name too.

**Glass** (`--glass`, `--glass-strong`, `--glass-border`, `--glass-edge`, `--glass-shadow`, and the `glass` utility): the floating top bar, the hero's task cards, the map's explorer panel. The map's pin card is solid (`bg-card`), so nothing behind it shows through. **Map** (`--map-land`, `--map-water`, `--map-park`, `--map-road`, `--map-road-major`, `--map-road-casing`, `--map-label`, `--map-label-strong`, `--map-water-label`, `--map-civic`, `--map-building`): the base map is recolored with these so it sits in the page. **Paper** (`--paper` and the `paper` utility): the landing page's faint warm marble, one tile under every section, light and dark.

**Badge tones** (soft background + strong text; light-mode pairs checked for ≥ 4.5:1 contrast):

| Tone | Light bg / text | Dark bg / text |
|---|---|---|
| neutral | `#F1EBE3` / `#4A423A` | `#2A251F` / `#E3DBD1` |
| brand | `#FFE7D6` / `#8A3410` | `#3A2418` / `#FFC7A6` |
| info | `#E9EDFF` / `#2F49B3` | `#1F2747` / `#B9C7FF` |
| success | `#E2F3E8` / `#1F6A3D` | `#17301F` / `#A8E2BB` |
| warning | `#FDF0D9` / `#844506` | `#3A2A12` / `#F5CF8F` |
| danger | `#FDE6E3` / `#A02A1F` | `#3D1A16` / `#FFB4AA` |
| reward | `#FFF0D4` / `#704605` | `#3A2D10` / `#F5D48F` |

### 2.2 Type

- **Display and headings:** Bricolage Grotesque (`--font-display`, also `--font-heading`), 600–700, tight tracking (−0.03 to −0.045em). The hero is slightly condensed (`font-stretch: 94%`).
- **Accent:** Instrument Serif italic (`--font-accent`), in `--violet`, for the one vivid word or phrase in a headline ("nearby", "right now"). At most one per heading.
- **Body and UI:** DM Sans (`--font-sans`), 400/500/600.
- All three load with `next/font/google` in `src/ui/theme/fonts.ts`. Money, times, and counts use `tabular-nums`.

| Style | Phone | Desktop |
|---|---|---|
| Display (landing hero only) | 44/42, 600 | up to 102/96 (`clamp(2.75rem, 8.4vw, 6.4rem)`) |
| Landing section title | 36/37, 600 | 48/49 |
| H1 (page title) | 24/32, 700 | 30/38 |
| H2 (section) | 20/28, 600 | 22/30 |
| H3 (card title) | 17/24, 600 | 18/26 |
| Body | 16/24 | 16/24 (landing lead 18–20) |
| Small | 14/20 | 14/20 |
| Caption (non-essential only) | 12/16 | 12/16 |

Inputs use at least 16 px text so iOS doesn't zoom.

### 2.3 Space, shape, depth, motion

- **Spacing** on a 4 px grid. Page gutter 16 px (phone), 24 px (tablet), 32 px (desktop). Card padding 16 px (phone) and 20–24 px (desktop). Gap between sections 24–32 px.
- **Radius:** `--radius: 0.75rem` (cards, sheets, dialogs). Buttons and inputs 10 px. Badges and avatars fully rounded. The landing page and the public top bar go rounder: 24–32 px cards, pill buttons.
- **Depth:** a border plus a very soft shadow on cards (`0 1px 2px rgb(28 27 24 / 0.06)`); larger shadows only on sheets and dialogs. Glass (blur plus `--glass-*`) only for things that float over content: the top bar, map cards, the ask pill.
- **Motion:** tokens in `src/ui/motion/tokens.ts`, mirrored as CSS variables: `--dur-instant` 120 ms, `--dur-fast` 200 ms, `--dur-base` 320 ms, `--dur-slow` 560 ms, `--dur-slower` 800 ms; `--ease-out` `cubic-bezier(0.22, 1, 0.36, 1)` for arrivals and `--ease-in-out` `cubic-bezier(0.65, 0, 0.35, 1)` for moves; the `bloom` and `follow` springs (no bounce); a 70 ms stagger.
  - State changes take 150–200 ms, ease-out. Animate `transform` and `opacity` only (plus a short blur on entrances).
  - Primitives in `src/ui/motion`: `MaskLines` (headline lines rise through a mask, CSS only), `Reveal` (`rise` or `bloom`, once, as it scrolls into view; `MotionRoot` switches reveals on), `Magnetic` (the main call to action leans toward a mouse), `Spotlight` (a glow under the cursor), and `CountUpMoney` (counts to the exact supplied amount; display only).
  - Above the fold, motion is CSS, so it never waits for JavaScript, and content is visible without JavaScript.
  - Cursor effects need a fine pointer. Pointer parallax and the living canvas belong to the landing hero only: decorative (`aria-hidden`), paused off screen and in background tabs, with a pause control.
  - With `prefers-reduced-motion`: no transitions, reveals, parallax, count-ups, or canvas animation; everything shows in its final place. The preview harness runs with reduced motion.
- **Content width:** reading and flow pages (booking page, forms, conversation) max **720 px**; lists and grids max **1120 px**; admin full width, max 1440 px.
- **Layers** (z-index, low → high): content → sticky action bar → bottom nav → dev toolbar button → sheets and dialogs → toasts.

## 3. Layout and navigation

**Public site**
- Header: logo (wordmark "TasksNearMe" plus a simple pin-with-check mark, drawn as SVG); links *How it works*, *Become a helper*, *Pricing*; primary CTA **Post a task**; *Sign in*. On phones the links go in a menu sheet.
- Footer: market (Austin), categories, trust and safety, help, legal links.

**Signed-in app**
- **Tab pages** (Home, list pages) have a top bar (logo, **mode switch**, notifications bell with count, avatar menu) and, on phones, a **bottom nav** (completion plan 9.14; docs/ui/dashboard-9.9.md §7).
  - Poster mode: **Home · Neighbors · Tasks · Bookings · Messages**.
  - Helper mode: **Home · Find work · Neighbors · Bookings · Messages**.
  - On phones the bar is one row: the **mode switch** moves into the avatar menu below 640 px.
- **Detail and flow pages** (booking page, offer detail, wizard, conversation, confirmation) hide the bottom nav. They show a top bar with back and title, and a **sticky bottom action bar** for the primary action. Respect `env(safe-area-inset-bottom)`.
- **Desktop (≥ 1024 px):** a left sidebar with the same items, then the mode's tools under a line: Find helpers, Saved helpers, Saved searches (poster); Offers, Availability, Earnings, My clients, Rewards, Saved searches (helper). Below 1024 px the tools are in the avatar menu instead.
- **Avatar menu (every width):** Account, Payments, Support, the theme and the language, Sign out. Each destination has one place on a screen.
- The **mode switch** is a two-option segmented control, "I need help" / "I can help". It changes the navigation and the Home content; it never signs anyone out. If the helper profile isn't set up, choosing "I can help" opens onboarding.

**Admin**
- Left sidebar: Queues, Cases, Reports, Users, Bookings, Payments, Rewards, Config*, Audit, Staff*. Items marked * are admin role only.
- Top bar shows a **"Staff area"** badge, the staff member's role, and global search.
- Dense tables on desktop that fall back to card lists on phones. Breadcrumbs on detail pages.

## 4. Components

### 4.1 shadcn/ui primitives to install

accordion, alert, alert-dialog, avatar, badge, breadcrumb, button, calendar, card, checkbox, command, dialog, drawer, dropdown-menu, empty, field (use the current shadcn form pattern with react-hook-form), input, input-group, label, pagination, popover, progress, radio-group, scroll-area, select, separator, sheet, skeleton, sonner, spinner, switch, table, tabs, textarea, toggle-group, tooltip.

On phones, use **drawer or sheet from the bottom** for secondary flows. Use **alert-dialog** to confirm anything involving money or cancellation.

### 4.2 Shared domain components

| Component | Responsibility |
|---|---|
| `Money` | Formats cents as USD: always two decimals, `tabular-nums`, true minus sign for negatives |
| `PriceBreakdown` | Line items from a `PriceBreakdown`. Variants: `poster` (price, service fee, expense allowance, total, refund), `helper` (price, service fee −, you'll earn, reimbursement), `admin` (adds platform revenue). Handles fixed and hourly ("$35.00 × 4 h cap"). Never computes fees |
| `StatusBadge` | Status → label and tone, per viewer (§5) |
| `BookingStateBanner` | One headline, one sentence on what happens next, and a `Deadline` |
| `ActionBar` | Renders `getBookingActions` output: one primary, the rest in a "More" menu on phones; disabled actions show their reason. Sticky on phones |
| `PolicyPreview` | Exact refund, fee, and strike preview before a cancel or no-show |
| `Deadline` | Absolute time plus relative ("Tue, Nov 24 · 11:48 am — in 3 days"). Doesn't auto-act or auto-submit |
| `TaskCard`, `OfferCard`, `HelperCard`, `BookingCard` | List items with variants for poster, helper, and public views |
| `VerificationBadges` | "ID verified · Nov 2026", "Background checked · Nov 2026", "Phone verified", each with a tooltip that says what the badge does and doesn't mean |
| `RatingStars` | Display only, with a text equivalent ("4.9 out of 5, 112 reviews") |
| `ReviewCard` | Rating, tags, text, author first name and initial, date |
| `Timeline` | Booking events with actor icons |
| `GeneralArea` + `AreaMapPlaceholder` | Area name, ~1 mile circle, distance band; the map is an SVG placeholder (no map SDK) |
| `ExactAddressPanel` | The only component that renders an `ExactAddress`: address, access notes, "Copy" and "Open in maps" (a placeholder link), and the note "Visible to you until {date}" |
| `MaskedText` | Shows masked contact details as "•••-•••-0134 (hidden until booking)" |
| `EmptyState`, `ErrorState`, `PageSkeleton` | Every list and page |
| `DemoBadge` | A small "Demo" chip on every provider placeholder |
| `PaymentFormPlaceholder` | Card fields, Apple Pay and Google Pay buttons, and the demo outcomes (success, declined, insufficient funds, 3-D Secure dialog), in `charge` and `authorize` modes |
| `PhotoPicker` | Local previews only, up to N files; the hint "Avoid house numbers, mail, and faces" |
| `StepWizard` | Step header with progress, Back and Next in a sticky bar, and a leave-page confirmation |
| `PageHeader`, `Section`, `KeyValueList` | Layout helpers |
| `ReasonGateDialog` (admin) | Requires a typed reason before showing restricted data; records it in the mock audit log; then shows "Access logged" |
| `DataTable` (admin) | Sorting, filtering, pagination; card list on phones |

## 5. Status labels and tones

**Booking** (label depends on who's looking)

| Status | Poster sees | Helper sees | Tone |
|---|---|---|---|
| `pending_funding` | Finish payment | Client is booking | warning |
| `confirmed` | Booked | Booked | info |
| `in_progress` | In progress | In progress | info |
| `completion_submitted` | Needs your approval | Waiting for approval | warning |
| `disputed` | Problem reported | Problem reported | danger |
| `completed` | Done | Done | success |
| `canceled` | Canceled | Canceled | neutral |

**Offers:** pending (poster: "New offer" brand; helper: "Waiting for client" info) · stale "Needs re-confirmation" warning · accepted "Booked" success · declined "Not selected" neutral · withdrawn "Withdrawn" neutral · expired "Expired" neutral.

**Invites:** sent (poster: "Waiting for {helper}"; helper: "New request") info · countered "Counter-offer" warning · accepted "Booked" success · declined, canceled, and expired neutral · auth_failed "Payment failed" danger.

**Poster payments:** processing info · authorized "Hold placed" info · succeeded "Paid" success · failed danger · partially_refunded "Partly refunded" neutral · refunded neutral · chargeback_open "Bank dispute" danger.

**Helper earnings:** not_due "After completion" neutral · on_hold warning · scheduled "Sending" info · transferred "Transferred" info · paid_out "Paid out" success · failed **"Action needed"** danger · reversed neutral.

**Rewards:** pending, qualified ("Unlocking {date}"), and redeemable ("Ready to redeem") use the reward tone · issuing "Sending" info · delivered success · in_review "Under review" warning · failed "Delivery problem" danger · voided "Not earned" and expired both neutral.

**Cases:** open info · awaiting_* "Waiting on you" or "Waiting on {name}" warning · awaiting_support "With support" info · escalated warning · resolved success · closed neutral.

Never use color alone: every badge has text, and status icons have accessible labels.

## 6. Voice, copy, and glossary

**Voice:** plain words, short sentences, exact numbers and times, always say what happens next. No blame, no hype, no exclamation marks except on genuine success ("Booked!").

**Glossary**

| Say | Don't say |
|---|---|
| task | job, gig |
| offer | bid, quote |
| booking | contract, order |
| helper | worker, employee, contractor (except in legal pages), tasker |
| client (the poster, from the helper's side); "you" to the poster | customer, employer |
| task price · service fee · total · you'll earn · reimbursed expenses | commission, cut, take rate (admin only), wages |
| hold on your card (invites) | authorization, pre-auth |
| approved automatically | auto-approval (admin only) |
| gift card reward | bonus pay, cash |
| *Never:* escrow, wallet, guaranteed (unless legal approves), hire (for helpers), best, cheapest | |

Admin screens may use internal terms (poster, funded, transfer, ledger, risk signals).

**Key sentences (use as written)**
- Payment: "You pay when you book. Your helper is paid after the task is done."
- Address, poster before booking: "Helpers see only the general area. Your exact address is shared with your helper after you book."
- Address, helper before booking: "You'll see the exact address after the booking is confirmed."
- Address hidden: "The address was hidden 48 hours after the task was completed."
- Invite hold: "We'll place a hold of {amount} on your card. You're charged only if {helper} accepts. The hold is released if {helper} declines or doesn't answer by {deadline}."
- Approval: "Approve or report a problem by {deadline}. After that, the task is approved automatically."
- Helper after approval: "Transferred to your payout account. It usually reaches your bank in about 2 business days. Your first payout can take about 7 days."
- Contact masking: "Phone numbers and emails are hidden until the booking is confirmed."
- Late cancellation (poster preview): "Canceling now costs {fee}. {helper} receives all of it. You'll get {refund} back."
- Rewards: "Rewards never depend on reviews or ratings."

**Formatting**
- Money: "$66.00", negatives "−$6.00".
- Time: "10:30 am"; ranges "10:00 am–1:00 pm".
- Dates: "Sat, Nov 21". Relative time is secondary only ("in 3 days").
- Durations: "3.5 h".

**Errors** say what happened and what to do ("Your card was declined. Try another card or payment method."). Never show raw codes. Link to support when an error repeats.

**Empty states** say what this place is for, how it fills up, and give one action ("No offers yet. Helpers nearby have been notified. Offers usually arrive within a few hours.").

**Buttons** are verbs and specific: "Send offer", "Book Jordan", "Pay $66.00", "Approve task", "Report a problem", "Redeem gift card".

## 7. Accessibility checklist (WCAG 2.2 AA)

- Skip link; landmarks (`header`, `nav`, `main`, `footer`); one H1 per page; headings in order.
- Every input has a label, hint, and error tied together with `aria-describedby`. Errors are announced, and focus moves to the first invalid field.
- Focus is visible (2 px ring), the order is logical, dialogs and sheets trap focus and return it on close.
- Touch targets ≥ 44 × 44 px (and never under 24 px with spacing). Contrast ≥ 4.5:1 for text and ≥ 3:1 for UI parts.
- Async results (payment, submit, redeem) are announced in an `aria-live="polite"` region. Toasts never carry the only copy of important information.
- No time limit auto-submits anything. Countdowns are informative only.
- Images have alt text: fixture photos have descriptive alt; user photos fall back to "Photo 1 of 3 from Maya". Decorative icons are `aria-hidden`.
- Works at 200% zoom and at 320 px width with no loss of content.
- Admin tables have captions and header cells; sort controls announce their state.

## 8. Icons and imagery

- **lucide-react only.**
  - Categories: furniture assembly `Hammer`, moving help `Package`, yard cleanup `Leaf`, light cleaning `Sparkles`, computer help `Laptop`.
  - Trust: `ShieldCheck` (ID verified), `BadgeCheck` (background checked), `Phone` (phone verified), `Lock` (private info), `MapPin` (area).
  - Money: `CircleDollarSign`. Rewards: `Gift`.
- **No stock photos of people.** Avatars are initials on a brand-tinted circle.
- Fixture "photos" are simple SVG illustrations (boxed desk, assembled desk, drawer close-up, yard, receipt), never real photos. Claude provides them in `public/fixtures/` together with the fixtures; UI illustrations of your own go in `public/ui/`.
- Category tiles: the icon on a soft brand-tinted card with the category name and one line of scope ("Desks, beds, shelves").
