# UI-011 — Bookings list and the booking page

**Status:** ready for Codex · **Branch:** `ui/UI-011-bookings-and-booking-page` · **Plan first:** no (unattended) · **Depends on:** UI-010 (merged)

## Goal
After booking, both people manage the work from one page (blueprint 02 §1, J5–J8):
- `/app/bookings`: every booking, as client or as helper.
- `/app/bookings/[bookingId]`: the booking page for every state and both roles. It shows the terms and money in the viewer's variant, the schedule, the place, check-in updates, the timeline, payments (client only), and the actions the app allows.

This ticket renders states and runs single-tap actions. The sheets that collect input arrive later: change requests, cancel with the policy preview, no-show, can't access, and safety (UI-012); completion, approval details, and disputes (UI-013). The app only sends actions that work, so render whatever `actions` contains. Claude wires both pages inside `AppShell`.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-011.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §5, §6, §7
- `docs/blueprint/03-state-machines.md` §4 (booking states, what each person can do, the system timers); `docs/ui/ui-contract.md` §5 (who sees the address) and §6 (booking actions)
- Contracts:
  - **`src/contracts/bookings.ts`** (second half): `BookingView`, `BookingTermsView`, `BookingCheckIn`, `BookingDeadlines`, `BookingPaymentLine`, `ADDRESS_VISIBILITY`, `BookingViewerRole`, `BookingListRow`, `BookingsPageData`, `BookingHubHandlers`.
  - `status.ts` (`BOOKING_STATUSES`, `CANCEL_REASONS`, `COMPLETED_VIA`, `PAYMENT_STATUSES`), `action-ids.ts` (`BOOKING_ACTION_IDS`), `timeline.ts`, `location.ts` (`ExactAddress`, `TaskLocation`), `payments.ts` (`PaymentMethodLabel`), `routes.ts` (`booking`, `bookings`, `bookingCalendar`, `findWork`, `newTask`).
- Fixtures: **`src/fixtures/bookings.ts`** (second half): the desk booking in every state (client and helper views), `movingBookingPosterConfirmed` (hourly, allowance), `remoteBookingHelperConfirmed` (remote, no address), `mayaBookingsPageData`, `mayaBookingsNeedsActionData`, `jordanBookingsPageData`, `bookingsEmptyData`, `fakeBookingHubHandlers`.
- Reuse: `useBookingStatus` + `StatusBadge`, `Timeline`, `ExactAddressPanel`, `GeneralArea`, `HelperCard`, `PriceBreakdown` (variant from `viewerRole`: `poster` or `helper`), `PaymentMethodLabel`, `ActionBar`, `EmptyState`, `PageHeader`.

## Build

**Screens** (`src/ui/screens/bookings/`, exported from its `index.ts`). One H1 each.

| Screen | Props | Content |
|---|---|---|
| `BookingsScreen` | `data: BookingsPageData`, `now: ISODateTime` | Tabs **Needs action** / **Upcoming** / **Past**, with counts. The first tab with rows is open; otherwise Upcoming. **Rows:** the title (links to `routes.app.booking(id)`), the category, the status badge, a role chip ("You booked" / "You're helping"), the other person (name and initials), the date and start time, the area name or "Remote", and the money (client: "Total $66.00"; helper: "You'll earn $54.00"). Rows that need action are marked. Empty states: Upcoming links to `routes.app.findWork()` and `routes.app.newTask()`; Past says nothing has finished yet |
| `BookingHubScreen` | `data: BookingView`, `handlers: BookingHubHandlers`, `now: ISODateTime` | Sections below, in this order on phones |

**Booking page sections:**
1. **Header:** the task title (H1), the category, the status badge, and one line on what's happening now, by status and role (copy per state, plus per `cancelReason` and `completedVia`):
   - `pending_funding`: client "Finish paying by 9:31 am" (`deadlines.pendingFundingExpiresAt`, relative and clock time); helper "Maya is booking you".
   - `confirmed`: "Starts Sat, Nov 21 at 10:30 am" (relative too).
   - `in_progress`: "Started at 10:24 am" (`checkIn.arrivedAt`).
   - `completion_submitted`: client "Approve by Tue 11:48 am, or it's approved automatically" (`deadlines.approvalDueAt`); helper "Waiting for Maya to approve".
   - `completed`, `canceled`: past tense with the reason.
2. **Actions:** `ActionBar` with `data.actions`. Disabled actions show their reason (`available_at` → "Available at 8:30 am"). Ask before calling when `confirm` is set. `add_to_calendar` is a download link to `routes.app.bookingCalendar(id)`, with no handler call. Every other action calls `handlers.onAction({ action })`. Results: `redirectTo` → `router.push`; `updated` → `router.refresh()`; errors → a toast or inline alert (`not_allowed` with a reload button, `version_conflict`, `rate_limited` with `retryAt`, `unknown`). Lock the bar while a request runs.
3. **The other person:** the client sees `HelperCard` (compact). The helper sees the client's name, initials, member since, and phone verified (no last name).
4. **When and where:** the agreed start (`terms.start`) and the task window. **Place**, by `addressVisibility`:
   - `visible`: `GeneralArea` plus `ExactAddressPanel(data.exactAddress)`. While `deadlines.addressHiddenAt` is set, tell the helper "You can see this address until Mon 1:05 pm".
   - `after_confirmation`: the area plus "You'll see the exact address once the booking is confirmed".
   - `hidden_after_completion`: the area plus "The address is hidden now that the task is done".
   - `not_applicable`: "Remote task: share a meeting link in messages".
5. **Check-in** (when `checkIn` is set): "On my way at 9:58 am", "Running 20 minutes late", "Arrived at 10:24 am".
6. **Terms and money:** the scope text, the pricing (fixed, or rate · estimate · cap), the expense allowance, and `PriceBreakdown` in the viewer's variant. Hourly, client: "You paid for up to 4 hours. Unused hours are refunded after you approve".
7. **Payments** (client only, when `payments` is set): charges and refunds, each with the amount, `PaymentMethodLabel`, status, and date.
8. **Timeline:** `Timeline` with `data.timeline`.
9. A short help line linking to `routes.help()`.

Privacy: render `exactAddress` only through `ExactAddressPanel`, only when it's present.

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success codes | Error codes |
|---|---|---|---|
| `onAction` | `{ action: BookingActionId }` | `updated` (refresh), `redirectTo` (navigate) | `not_allowed`, `version_conflict`, `rate_limited`, `unknown` |

Copy namespaces: `bookings` (list) and `bookingHub` (the page). Action labels already live in `actions`.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-bookings/{client,client-needs-action,helper,empty}` | `mayaBookingsPageData`, `mayaBookingsNeedsActionData`, `jordanBookingsPageData`, `bookingsEmptyData` | The list |
| `screen-booking/client-confirmed` | `deskBookingPosterConfirmed` | Booked; her address; the $66.00 charge |
| `screen-booking/helper-confirmed` | `deskBookingHelperConfirmed` | Jordan sees the address; "On my way" disabled until 8:30 am |
| `screen-booking/helper-day-of` | `deskBookingHelperDayOf` | On my way at 9:58; Arrived is the primary action |
| `screen-booking/helper-in-progress` | `deskBookingHelperInProgress` | Arrived at 10:24 |
| `screen-booking/client-pending-funding` | `deskBookingPosterPendingFunding` | Pay by 9:31 am; the failed charge |
| `screen-booking/helper-pending-funding` | `deskBookingHelperPendingFunding` | "Maya is booking you"; no address yet |
| `screen-booking/client-completion-submitted` | `deskBookingPosterCompletionSubmitted` | Approve (asks first) by Tue 11:48 am |
| `screen-booking/client-completed` | `deskBookingPosterCompleted` | Review, save, book again |
| `screen-booking/helper-completed` | `deskBookingHelperCompleted` | The address until Mon 1:05 pm |
| `screen-booking/helper-completed-address-hidden` | `deskBookingHelperCompletedAddressHidden` | The address is gone |
| `screen-booking/client-canceled-late` | `deskBookingPosterCanceledLate` | $54.00 refunded |
| `screen-booking/client-canceled-by-helper` | `deskBookingPosterCanceledByHelper` | Full refund; find a replacement |
| `screen-booking/client-hourly` | `movingBookingPosterConfirmed` | $35/h, 4 h cap, allowance, the unused-hours note |
| `screen-booking/helper-remote` | `remoteBookingHelperConfirmed` | No address; the meeting-link note |
| `screen-booking/result-{not-allowed,rate-limited,unknown}` | `deskBookingHelperDayOf` + a handler returning the code | The error states after tapping Arrived |

## Tests
- `exactAddress` text never renders without `ExactAddressPanel`; the hidden and after-confirmation states contain no address text.
- Clients see payments; helpers never do (no `payments` section, even if present by mistake).
- The variant follows `viewerRole`: the client sees "Total charged", the helper sees "You'll earn".
- A `confirm` action asks first; cancelling the dialog calls nothing.
- `redirectTo` navigates; `updated` refreshes; `not_allowed` offers a reload.
- A disabled action shows its reason and can't be pressed.
- Copy exists for every booking status in both roles, every `CANCEL_REASONS` and `COMPLETED_VIA` value, and every `ADDRESS_VISIBILITY` value.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No business rules (the actions and deadlines come from the data), no routes built by hand, no hard-coded strings.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-011.md`. That file tells Claude you're done.

## Out of scope
- The action sheets (UI-012), completion, approval details and disputes (UI-013), messaging (UI-014), and reviews (UI-015).

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
