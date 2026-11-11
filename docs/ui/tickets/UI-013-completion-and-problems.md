# UI-013 — Mark the work complete, and report a problem

**Status:** wired · **Branch:** `ui/UI-013-completion-and-problems` · **Plan first:** no (unattended) · **Depends on:** UI-011 (merged)

## Goal
These pages close the core loop (blueprint 02 **J6**):
- The helper marks the work complete with evidence: `/app/bookings/[bookingId]/complete`.
- The client sees the submitted work on the booking page and approves it there (the `approve` action from UI-011), or reports a problem instead: `/app/bookings/[bookingId]/problem`.

Evidence follows the category and the terms. In-person work needs photos of the result. Hourly bookings need the hours worked, at most the cap. A booking with an expense allowance takes receipts. Remote work needs a short summary. Claude wires the pages in the `(flow)` layout.

Disputes after a report (rework and settlement offers) come in a later ticket. Here the booking page only shows the `disputed` status UI-011 already renders.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-013.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §5, §6, §7
- `docs/blueprint/02-sitemap-and-journeys.md` **J6** (evidence, 72-hour approval window), `03-state-machines.md` §4 (`completion_submitted`, `disputed`), `04-payments-and-fees.md` §5–6 (unused hours and allowance come back; reimbursement has no fee)
- Contracts, the third part of **`src/contracts/bookings.ts`**:
  - completion: `CompletionRules`, `COMPLETION_UNAVAILABLE_REASONS`, `CompletionPageData`, `createCompletionInputSchema(rules)`, `CompletionInput`, `CompletionHandlers`, `CompletionView`;
  - problems: `PROBLEM_REASONS`, `PROBLEM_UNAVAILABLE_REASONS`, `ReportProblemPageData`, `reportProblemInputSchema`, `ReportProblemInput`, `ReportProblemHandlers`;
  - `BookingView.completion` (new, optional).
  - Also: `posting.ts` (`PhotoUploadResult`), `money.ts` (`PriceBreakdown` with `approvedExpensesCents`, `posterRefundCents`, `helperReimbursementCents`, hourly `basis: 'approved'`), `routes.ts` (`booking`, `bookingComplete`, `bookingProblem`, `help`).
- Fixtures, the third part of **`src/fixtures/bookings.ts`**:
  - completion pages: `deskCompletionPageData`, `deskAllowanceCompletionPageData`, `movingCompletionPageData`, `remoteCompletionPageData`, `completionUnavailableData`;
  - submitted work: `deskCompletionView`, `deskWithExpensesCompletionView`, `movingCompletionView`;
  - booking views with work: `deskBookingPosterCompletionWithWork`, `deskBookingPosterCompletionWithExpenses`, `movingBookingPosterCompletionHourly`, `movingBookingHelperCompletionHourly`;
  - problem pages: `deskReportProblemPageData`, `reportProblemUnavailableData`;
  - handlers: `fakeCompletionHandlers`, `fakeReportProblemHandlers`.
- Reuse: the photo uploader from the posting wizard or the work-samples editor, `PriceBreakdown`, `FormFeedback`, the forms pattern, `parseMoneyInput` / `formatMoneyInput` for dollar fields, `BookingHubScreen` (UI-011).

## Build

**Component** (`src/ui/components/bookings/completion-summary.tsx`):

| Component | Props | Content |
|---|---|---|
| `CompletionSummary` | `completion: CompletionView`, `variant: 'poster' \| 'helper'` | "Sent Sat 11:48 am". The photos (gallery, opens larger), the note, "Hours worked: 3.5 of up to 4", and the receipts (description, amount, receipt photo). Then the final `PriceBreakdown` in the variant: the client sees the refund of unused hours and allowance; the helper sees earnings and reimbursement |

**Screens** (`src/ui/screens/bookings/`, exported from its `index.ts`). One H1 each.

| Screen | Props | Content |
|---|---|---|
| `CompletionScreen` | `data: CompletionPageData`, `handlers: CompletionHandlers`, `now` | "Mark the work complete". A summary: the task, the client, the agreed start, the price. **Form** (react-hook-form + `zodResolver(createCompletionInputSchema(data.rules))`), with only the parts the rules ask for: **photos** (upload via `onUploadPhoto`, at least `photosMin`, up to `photosMax`; check `maxPhotoMegabytes` before uploading; remove); **note** (required for remote: "What did you do?"); **hours worked** when `rules.hours` is set (half hours, "Up to 4 hours"); **receipts** when `rules.expenses` is set (description, amount in dollars, receipt photo; the running total against the allowance). **What you'll earn:** `onQuoteFinal({ hoursWorked, expensesCents })`, debounced like the offer form, shown as `PriceBreakdown` helper variant. Submit: "Send for approval", which tells the helper the client has 72 hours to approve. `unavailable` → a message per reason with a link back to the booking (no form) |
| `ReportProblemScreen` | `data: ReportProblemPageData`, `handlers: ReportProblemHandlers`, `now` | "Report a problem". The deadline ("Report before Tue, Nov 24 at 11:48 am; after that, the booking is approved automatically"). The submitted work (`CompletionSummary`, client variant). **Form** (`zodResolver(reportProblemInputSchema)`): the **reason** (radio, `PROBLEM_REASONS`), the **description** (20 to 2,000 characters, with a counter), and **photos** (up to 6, optional). A note: "Support will look at what happened. The payment stays on hold until it's resolved." Submit: "Report the problem", with a confirm step. `unavailable` → a message per reason with a link back to the booking (`window_passed` also links to `routes.help()`) |

**Booking page addition** (`BookingHubScreen`): when `data.completion` is set, add a **"The work"** section with `CompletionSummary` in the viewer's variant, right after the header and actions.

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success codes | Error codes |
|---|---|---|---|
| `CompletionHandlers.onUploadPhoto` | `FormData` (`file`) | `{ ok: true, photo }` | `too_large`, `unsupported_type`, `too_many`, `rate_limited`, `unknown` |
| `CompletionHandlers.onQuoteFinal` | `{ hoursWorked?, expensesCents }` | `PriceBreakdown` | throws → "Couldn't update what you'll earn" + retry |
| `CompletionHandlers.onSubmit` | `CompletionInput` | `submitted` + `redirectTo` → `router.push` | `validation_failed` (`photoIds`, `note`, `hoursWorked`, `expenses`, `expenses.N.amountCents`, …; focus the first), `not_allowed` (reload), `rate_limited`, `unknown` |
| `ReportProblemHandlers.onUploadPhoto` | `FormData` | as above | as above |
| `ReportProblemHandlers.onSubmit` | `ReportProblemInput` | `submitted` + `redirectTo` | `validation_failed` (`reason`, `description`, `photoIds`), `expired` ("The approval window ended"), `not_allowed`, `rate_limited`, `unknown` |

Lock forms while a request runs; keep the input after an error.

Copy namespaces: `bookingComplete`, `reportProblem`, `completion` (the summary component).

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-booking-complete/fixed` | `deskCompletionPageData` | Photos required |
| `screen-booking-complete/with-expenses` | `deskAllowanceCompletionPageData` | Receipts against the $20 allowance |
| `screen-booking-complete/hourly` | `movingCompletionPageData` | Hours worked, up to 4; no photos needed |
| `screen-booking-complete/remote` | `remoteCompletionPageData` | The summary is required |
| `screen-booking-complete/unavailable-<reason>` | `completionUnavailableData[reason]` | One per reason (3) |
| `screen-booking-complete/result-<code>` | `deskCompletionPageData` + the result | `validation-failed` (no photo), `not-allowed`, `rate-limited`, `unknown` |
| `screen-report-problem/default` | `deskReportProblemPageData` | The work, the deadline, the form |
| `screen-report-problem/unavailable-<reason>` | `reportProblemUnavailableData[reason]` | One per reason (3) |
| `screen-report-problem/result-<code>` | `deskReportProblemPageData` + the result | `validation-failed` (description too short), `expired`, `not-allowed` |
| `screen-booking/client-completion-with-work` | `deskBookingPosterCompletionWithWork` | The booking page with the work, approve and report |
| `screen-booking/client-completion-with-expenses` | `deskBookingPosterCompletionWithExpenses` | The receipt; $12.00 back |
| `screen-booking/client-completion-hourly` | `movingBookingPosterCompletionHourly` | 3.5 of 4 hours; $19.25 back |
| `screen-booking/helper-completion-hourly` | `movingBookingHelperCompletionHourly` | Earnings for 3.5 hours |
| `component-completion-summary/{fixed,expenses,hourly}` | the three `CompletionView` fixtures | The component on its own |

## Tests
- The completion form shows only what `rules` ask for (no hours on fixed price, no receipts without an allowance).
- Submitting without the required photo shows the error and focuses the photos; with one photo, `onSubmit` gets `{ photoIds: ['…'], note: '', expenses: [] }` and navigates.
- Hours above the cap and receipts above the allowance are refused before calling `onSubmit`.
- Dollar fields send integer cents.
- The report asks for confirmation first; a short description shows `too_short`; success navigates.
- `CompletionSummary` shows refunds only in the client variant and reimbursement only in the helper variant.
- Copy exists for every `PROBLEM_REASONS`, `COMPLETION_UNAVAILABLE_REASONS` and `PROBLEM_UNAVAILABLE_REASONS` value.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No fee math (the final numbers come from `onQuoteFinal` and the data), no routes built by hand, no hard-coded strings.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-013.md`. That file tells Claude you're done.

## Out of scope
- Disputes after a report: rework visits, settlement offers, support resolutions (a later ticket).
- Reviews (UI-015) and payouts (UI-016).

## Claude wiring notes (filled in by Claude after review)
- Route(s): `/app/bookings/[bookingId]/complete`, `/app/bookings/[bookingId]/problem` (flow layout).
- Queries / actions: `getCompletionPage`, `quoteFinal`, `submitCompletion`, `getReportProblemPage`, `reportProblem` (`src/modules/bookings/completion.ts`); Server Actions in `completion-actions.ts`; the work on the booking page from `completion-view.ts`.
- e2e: `tests/e2e/completion.spec.ts` (seeded `bkg_bookcase`).
