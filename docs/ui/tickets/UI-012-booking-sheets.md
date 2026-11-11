# UI-012 — Booking sheets: cancel, running late, no-show, can't access, safety

**Status:** wired · **Branch:** `ui/UI-012-booking-sheets` · **Plan first:** no (unattended) · **Depends on:** UI-014 (merged)

## Goal
Some booking actions need a few words or a confirmation with consequences. Today they are single taps on the booking page (UI-011); this ticket gives them sheets (blueprint 03 §4, 04 §6):
- **Cancel** (both people): a policy preview with the exact refund and payout, a reason, and a note.
- **Running late** (helper): 10, 20 or 30 minutes.
- **Report a no-show** (client, from 30 minutes after the start).
- **Can't get in** (helper, 20 minutes after arriving). The client then has 30 minutes to answer with **I'm here**, a single tap.
- **Safety report** (both). It always shows **Call 911** first.

Change requests (new price, time or scope) are a later ticket.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-012.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §5, §6 (sheets and dialogs), §7
- `docs/blueprint/03-state-machines.md` §4 (who can do what, the timers), `04-payments-and-fees.md` §6 (cancellation money), `docs/ui/ui-contract.md` §6 (the actions table)
- Contracts, the fourth part of **`src/contracts/bookings.ts`**:
  - cancellation: `POSTER_CANCEL_REASONS`, `HELPER_CANCEL_REASONS`, `CancellationPreview`, `cancelBookingInputSchema`, `CancelBookingInput`;
  - running late: `LATE_BY_MINUTES`;
  - no-show and can't access: `bookingNoteInputSchema`, `BookingNoteInput`;
  - safety: `SAFETY_REPORT_KINDS`, `safetyReportInputSchema`, `SafetyReportInput`;
  - handlers: `BookingSheetHandlers`;
  - new optional fields: `BookingCheckIn.cantAccessAt`, `BookingDeadlines.posterResponseDueAt`.
- Fixtures, the fourth part of **`src/fixtures/bookings.ts`**:
  - previews: `deskCancelPreviewPosterEarly`, `deskCancelPreviewPosterLate`, `deskCancelPreviewHelperEarly`, `deskCancelPreviewHelperLate`;
  - booking views: `deskBookingPosterWithSheets`, `deskBookingHelperWithSheets`, `deskBookingHelperRunningLate`, `deskBookingPosterNoShowReportable`, `deskBookingPosterNoShowNotYet`, `deskBookingHelperCantAccessAvailable`, `deskBookingPosterCantAccessReported`;
  - handlers: `fakeBookingSheetHandlers`.
- Reuse: `BookingHubScreen` and `BookingHubActions` (UI-011), `Sheet`/`Drawer` (bottom sheet on phones, dialog on desktop), `RadioGroup`, `FormFeedback`, `Money`.

## Follow-ups from UI-014 (contract request accepted)
1. `ThreadSummary.lastMessage` now has `kind` and, for status and system lines, `event`. In `InboxScreen`, word those previews with the `timeline.<type>` copy, as the thread already does, instead of the empty segments. `deskBookingThread` has a status preview (`on_my_way`).

## Build

**`BookingHubScreen` gets a new prop `sheets: BookingSheetHandlers`.** These action ids open a sheet instead of calling `handlers.onAction`: `cancel`, `running_late`, `report_no_show`, `cant_access`, `safety_report`. All other actions, including `im_here`, stay single taps.

**Sheets** (`src/ui/screens/bookings/sheets/`):

| Sheet | Opens with | Content |
|---|---|---|
| `CancelBookingSheet` | `cancel` | Calls `sheets.onPreviewCancel({})` on open; show a loading state, then the preview. **Client, early:** "You'll get $66.00 back". **Client, late:** "You'll get $54.00 back. Jordan receives $12.00 for the late cancellation", plus "Free cancellation ended Fri 10:30 am". **Helper, early:** "Maya gets a full refund". **Helper, late:** the same, plus "Cancelling this close to the start counts against your account". Then the reason (radio: `POSTER_CANCEL_REASONS` or `HELPER_CANCEL_REASONS` by `preview.by`), an optional note (up to 500), and a destructive **Cancel booking** button. Link to `routes.legal('cancellation-policy')` |
| `RunningLateSheet` | `running_late` | "How late will you be?" with 10, 20 and 30 minutes (`LATE_BY_MINUTES`). Send → `sheets.onRunningLate({ minutes })` |
| `ReportNoShowSheet` | `report_no_show` | "Jordan hasn't checked in." It explains that the client gets a full refund and that support sees the report. An optional note. Confirm → `sheets.onReportNoShow({ note })` |
| `CantAccessSheet` | `cant_access` | "Can't get in?" It explains that the client has 30 minutes to answer, after which the booking is canceled and the helper is paid the late-cancellation amount. An optional note. Confirm → `sheets.onCantAccess({ note })` |
| `SafetyReportSheet` | `safety_report` | First and largest: **"In danger? Call 911"**, a `tel:911` link. Then the kind (radio: `SAFETY_REPORT_KINDS`) and a description (10 to 2,000 characters). Send → `sheets.onSafetyReport(...)`. After success: "Support will contact you shortly". This sheet never blocks the 911 link, even while sending |

**Booking page additions** (from the new fields):
- While `checkIn.cantAccessAt` is set: "Jordan couldn't get in at 10:50 am".
- `deadlines.posterResponseDueAt`, client: "Answer by 11:20 am or the booking is canceled", next to the **I'm here** action.
- `checkIn.lateByMinutes`: "Running 20 minutes late". If UI-011 already shows this, keep it.

All sheets: react-hook-form with the contract schemas. Lock while sending; keep the input on errors. On success close the sheet and `router.refresh()`. Show errors inline: `validation_failed`, `not_allowed` ("This booking changed" + reload), `rate_limited`, `unknown`.

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success codes | Error codes |
|---|---|---|---|
| `onPreviewCancel` | `{}` | `CancellationPreview` | throws → "Couldn't load the cancellation terms" + retry |
| `onCancel` | `CancelBookingInput` | `canceled` | `validation_failed` (`reason`, `note`), `not_allowed`, `rate_limited`, `unknown` |
| `onRunningLate` | `{ minutes }` | `updated` | `not_allowed`, `rate_limited`, `unknown` |
| `onReportNoShow`, `onCantAccess` | `BookingNoteInput` | `canceled` / `updated` | `validation_failed`, `not_allowed`, `rate_limited`, `unknown` |
| `onSafetyReport` | `SafetyReportInput` | `submitted` | `validation_failed` (`kind`, `description`), `rate_limited`, `unknown` |

Copy namespace: `bookingSheets`.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-booking/client-with-sheets` | `deskBookingPosterWithSheets` | Cancel and safety in the actions |
| `screen-booking/helper-with-sheets` | `deskBookingHelperWithSheets` | Running late, cancel, safety |
| `screen-booking/helper-running-late` | `deskBookingHelperRunningLate` | "Running 20 minutes late" |
| `screen-booking/client-no-show-reportable` | `deskBookingPosterNoShowReportable` | Report a no-show enabled |
| `screen-booking/client-no-show-not-yet` | `deskBookingPosterNoShowNotYet` | Disabled until 11:00 am |
| `screen-booking/helper-cant-access-available` | `deskBookingHelperCantAccessAvailable` | Can't get in |
| `screen-booking/client-cant-access-reported` | `deskBookingPosterCantAccessReported` | I'm here, answer by 11:20 am |
| `sheet-cancel/{client-early,client-late,helper-early,helper-late}` | the four previews | The cancel sheet open |
| `sheet-cancel/{loading,preview-error,result-not-allowed}` | `deskCancelPreviewPosterLate` | Loading, failed preview, booking changed |
| `sheet-running-late/default`, `sheet-no-show/default`, `sheet-cant-access/default` | the booking views above | Each sheet open |
| `sheet-safety/{default,sending,sent,validation-failed}` | `deskBookingPosterWithSheets` | The 911 link first in every state |

## Tests
- Opening cancel calls `onPreviewCancel` once and shows the amounts from the preview, never computed ones.
- The reason list follows `preview.by`; the destructive button sends `{ reason, note }` and refreshes on `canceled`.
- `running_late` sends the chosen minutes.
- The safety sheet's 911 link is present and enabled in every state, including while sending.
- `im_here` stays a single tap through `handlers.onAction`.
- Copy exists for every reason in `POSTER_CANCEL_REASONS`, `HELPER_CANCEL_REASONS` and `SAFETY_REPORT_KINDS`.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No money math (the preview has the numbers), no routes built by hand, no hard-coded strings.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-012.md`. That file tells Claude you're done.

## Out of scope
- Change requests and paying a difference (a later ticket), disputes (UI-026), and blocking or reporting a person (UI-017).

## Claude wiring notes (filled in by Claude after review)
- Route(s): the booking page passes `sheets` (all six handlers bound to the booking).
- Queries / actions: `allBookingActions` (single taps + `sheetActions`, primary first, destructive last); services in `src/modules/bookings/sheets.ts`; Server Actions in `sheet-actions.ts`; `im_here` through `runBookingAction`.
- e2e: `tests/e2e/booking-sheets.spec.ts` (cancel preview, safety report on desktop; phones fixme until UI-030).
