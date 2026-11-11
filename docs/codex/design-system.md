# Design system (binding for the UI phase)

There is no brand yet, so this defines a simple, swappable one. All colors and fonts are CSS variables, so a rebrand is a token change, not a rewrite.

## 1. Personality

**A trusted neighbor with a clipboard.** Warm, practical, calm, and exact about money and time. The UI should feel like a well-run local service: plenty of white space, clear numbers, no hype, no dark patterns. Trust signals (verification, payment timing, privacy) appear at the moment they matter, not as decoration.

## 2. Tokens

Put these in `src/app/globals.css` as shadcn/ui CSS variables. Hex values are fine.

- **Dark mode follows the OS setting** (no toggle yet): `@custom-variant dark (@media (prefers-color-scheme: dark));`.
- Map the extra tokens (success, warning, info, reward, brand-soft) into Tailwind with `@theme inline`, the same way shadcn does for its own tokens.

### 2.1 Colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#FAFAF7` | `#121311` | Page background |
| `--foreground` | `#1C1B18` | `#F2F1EC` | Body text |
| `--card` / `--popover` | `#FFFFFF` | `#1A1B19` | Surfaces |
| `--primary` | `#0E7C66` | `#34B89A` | Main actions, links, focus ring |
| `--primary-foreground` | `#FFFFFF` | `#06231C` | Text on primary |
| `--secondary` | `#E9F4F0` | `#1F2E2A` | Secondary buttons, brand tint |
| `--secondary-foreground` | `#0B4F42` | `#CFEDE4` | Text on secondary |
| `--muted` | `#F1F0EB` | `#24251F` | Subtle fills |
| `--muted-foreground` | `#5F5C54` | `#A8A59C` | Secondary text |
| `--accent` | `#EEF5F2` | `#232B28` | Hover fills (menus, rows) |
| `--accent-foreground` | `#1C1B18` | `#F2F1EC` | — |
| `--destructive` | `#B91C1C` | `#F87171` | Destructive actions, errors |
| `--border` / `--input` | `#E4E2DA` / `#D9D6CC` | `#33342E` / `#3A3B35` | Lines, input borders |
| `--ring` | `#0E7C66` | `#34B89A` | Focus ring (2 px + 2 px offset) |
| `--success` | `#15803D` | `#4ADE80` | Positive icons and text on plain surfaces |
| `--warning` | `#B45309` | `#FBBF24` | Attention |
| `--info` | `#1D4ED8` | `#93B4FF` | Neutral information |
| `--reward` | `#F2A93B` (text on it `#3B2A06`) | `#F5B85A` (text `#2E2004`) | Gift-card rewards only |

**Badge tones** (soft background + strong text; light-mode pairs checked for ≥ 4.5:1 contrast):

| Tone | Light bg / text | Dark bg / text |
|---|---|---|
| neutral | `#F1F0EB` / `#3F3D37` | `#2A2B26` / `#D9D7CF` |
| brand | `#E9F4F0` / `#0B4F42` | `#1F2E2A` / `#8FE0C9` |
| info | `#E8EEFC` / `#1D4ED8` | `#1B2540` / `#A9C1FF` |
| success | `#E7F5EC` / `#166534` | `#16301F` / `#86EFAC` |
| warning | `#FDF3E1` / `#92400E` | `#33260F` / `#FCD34D` |
| danger | `#FBEAEA` / `#B91C1C` | `#3A1616` / `#FCA5A5` |
| reward | `#FDF1DC` / `#7A4E05` | `#33270F` / `#F5C77A` |

### 2.2 Type

- **Headings:** Plus Jakarta Sans (600/700). **Body and UI:** Inter (400/500/600). Load both with `next/font/google` as the CSS variables `--font-heading` and `--font-sans`.
- Money, times, and counts use `tabular-nums`.

| Style | Phone | Desktop |
|---|---|---|
| Display (home hero only) | 30/36, 700 | 40/48 |
| H1 (page title) | 24/32, 700 | 30/38 |
| H2 (section) | 20/28, 600 | 22/30 |
| H3 (card title) | 17/24, 600 | 18/26 |
| Body | 16/24 | 16/24 |
| Small | 14/20 | 14/20 |
| Caption (non-essential only) | 12/16 | 12/16 |

Inputs use at least 16 px text so iOS doesn't zoom.

### 2.3 Space, shape, depth, motion

- **Spacing** on a 4 px grid. Page gutter 16 px (phone), 24 px (tablet), 32 px (desktop). Card padding 16 px (phone) and 20–24 px (desktop). Gap between sections 24–32 px.
- **Radius:** `--radius: 0.75rem` (cards, sheets, dialogs). Buttons and inputs 10 px. Badges and avatars fully rounded.
- **Depth:** a border plus a very soft shadow on cards (`0 1px 2px rgb(28 27 24 / 0.06)`); larger shadows only on sheets and dialogs.
- **Motion:** 150–200 ms ease-out on state changes. No parallax. With `prefers-reduced-motion`, turn off transitions and skeleton shimmer.
- **Content width:** reading and flow pages (booking page, forms, conversation) max **720 px**; lists and grids max **1120 px**; admin full width, max 1440 px.
- **Layers** (z-index, low → high): content → sticky action bar → bottom nav → dev toolbar button → sheets and dialogs → toasts.

## 3. Layout and navigation

**Public site**
- Header: logo (wordmark "TasksNearMe" plus a simple pin-with-check mark, drawn as SVG); links *How it works*, *Become a helper*, *Pricing*; primary CTA **Post a task**; *Sign in*. On phones the links go in a menu sheet.
- Footer: market (Austin), categories, trust and safety, help, legal links.

**Signed-in app**
- **Tab pages** (Home, list pages) have a top bar (logo, **mode switch**, notifications bell with count, avatar menu) and, on phones, a **bottom nav**.
  - Poster mode: **Home · Tasks · Bookings · Messages · Account**.
  - Helper mode: **Home · Find work · Bookings · Messages · Earnings**.
- **Detail and flow pages** (booking page, offer detail, wizard, conversation, confirmation) hide the bottom nav. They show a top bar with back and title, and a **sticky bottom action bar** for the primary action. Respect `env(safe-area-inset-bottom)`.
- **Desktop (≥ 1024 px):** a left sidebar with the same items plus the secondary ones (Saved helpers, My clients, Rewards, Payments, Offers, Availability, Support).
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
- Fixture "photos" are simple SVG illustrations in `public/fixtures/` (boxed desk, assembled desk, drawer close-up, yard, receipt), never real photos.
- Category tiles: the icon on a soft brand-tinted card with the category name and one line of scope ("Desks, beds, shelves").
