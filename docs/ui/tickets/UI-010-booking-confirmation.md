# UI-010 — Booking confirmation and payment

**Status:** ready for Codex · **Branch:** `ui/UI-010-booking-confirmation` · **Plan first:** no (unattended) · **Depends on:** UI-007, UI-009 (merged)

## Goal
The poster books an offer and pays (blueprint 02 **J4**): `/app/tasks/[taskId]/offers/[offerId]/confirm`. The page shows the terms, the price breakdown, the cancellation terms, and the payment choice. It handles every payment outcome, including declines and a bank verification step. Claude wires it inside `AppShell` (poster mode).

The payment form is the **development stand-in**: saved cards plus test cards with fixed outcomes. No real card fields. The Stripe Payment Element replaces the stand-in later behind the same contract, so keep the payment picker self-contained.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-010.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §5, §6, §7
- `docs/blueprint/02-sitemap-and-journeys.md` **J4** (confirm and pay; the $66.00 table), `03-state-machines.md` §4 (`pending_funding`: 30 minutes, then canceled) and §6.1 (payment states), `04-payments-and-fees.md` §4 and §6 (charged at confirmation; cancellation terms)
- Contracts:
  - **`src/contracts/bookings.ts`:** `BookingConfirmPageData`, `CancellationPolicySummary`, `BOOKING_UNAVAILABLE_REASONS`, `FailedPaymentAttempt`, `confirmBookingInputSchema`, `ConfirmBookingInput`, `BookingConfirmHandlers`.
  - **`src/contracts/payments.ts`:** `SavedPaymentMethod`, `PaymentMethodLabel`, `CARD_BRANDS`, `DEV_TEST_CARDS`, `PaymentPanelData`, `paymentChoiceSchema`, `PaymentChoice`, `PaymentVerification`, `PaymentAttemptResult`, `needsBankVerification()`.
  - `money.ts` (poster variant of `PriceBreakdown`; hourly `basis: 'cap'`), `messaging.ts` (`MessageSegment`), `people.ts` (`HelperSummary`), `routes.ts` (`task`, `offer`, `legal('terms')`, `legal('cancellation-policy')`).
- Fixtures: **`src/fixtures/bookings.ts`**: `deskConfirmData` (two saved cards), `deskConfirmNewCardData`, `deskConfirmDeclinedData`, `deskConfirmInsufficientFundsData`, `deskConfirmUnavailableData` (one per reason), `movingConfirmHourlyData`, `remoteConfirmData`, `fakeBookingConfirmHandlers` (saved cards and `success` book; each test card gives its outcome).
- Reuse: `PriceBreakdown` (poster variant), `HelperCard`, `MaskedText`, `GeneralArea`, `FormFeedback`, `AlertDialog`/`Dialog`, `RadioGroup`, `Checkbox`, and the sticky submit bar from the offer form.

## Follow-ups from UI-009 (Claude changed a contract)
1. `routes.app.findWork(query)` now takes the filters (`FindWorkQuery`) and serializes them like your `findWorkHref` did, in the same order. Replace the local `findWorkHref` in `find-work-screen.tsx` with it. The output is unchanged.

## Build

**Screen** (`src/ui/screens/bookings/booking-confirm-screen.tsx`, exported from `src/ui/screens/bookings/index.ts`):

| Screen | Props | Content |
|---|---|---|
| `BookingConfirmScreen` | `data: BookingConfirmPageData`, `handlers: BookingConfirmHandlers`, `now: ISODateTime` | One H1 ("Confirm and pay" or "Book Jordan"). **Summary:** task title, category, date and the agreed start (`offer.proposedStart`, market time), the area only (`GeneralArea`; never an address). Address notice: local → "Jordan will see your exact address after you book"; remote → "No address needed. You'll share a meeting link in chat". **Helper:** `HelperCard` (compact) plus the offer message (masked segments) and "Brings: Drill, Level". **Money:** `PriceBreakdown` poster variant, "Total charged today". Hourly note: "You pay for up to 4 hours now. Unused hours are refunded after you approve". **Cancellation** (component below). **Payment** (picker below). **Terms:** a required checkbox, "I agree to the Terms of Service and the Cancellation policy" (links to `routes.legal('terms')` and `routes.legal('cancellation-policy')`). **Submit:** "Book and pay $66.00" (the poster total), in a sticky bar on phones |

**When `data.pending` is set** (a booking already waiting for payment): a banner above the payment section. With `lastFailure`: "Your payment didn't go through. Visa •••• 1881 was declined at 9:01 am." For `insufficient_funds`, say the card was declined for insufficient funds. Then: "Try again or use another card. We'll hold this booking until 9:31 am" (a relative time from `now`, plus the clock time).

**When `data.unavailable` is set:** no payment form and no submit. Show a message per reason (`BOOKING_UNAVAILABLE_REASONS`), for example "Jordan withdrew this offer" or "This task is already booked", with a link back to the task (`routes.app.task(task.id)`). Keep the summary visible so the poster knows which offer this was.

**Components** (`src/ui/components/payments/` unless noted):

| Component | Props | Content |
|---|---|---|
| `PaymentMethodPicker` | `panel: PaymentPanelData`, react-hook-form field `payment` (`PaymentChoice`) | A radio group: one option per saved card ("Visa •••• 1881 · Expires 08/28", "Default" tag), then "Use a new card". Default selection: the default saved card, or the new card when there are none. **New card (`newCard.kind === 'dev'`):** a clearly labeled stand-in, "Test card (development): no real charge". Show a choice of outcome (`DEV_TEST_CARDS`: "Approved", "Declined", "Insufficient funds", "Bank verification") and "Save this card for next time". Builds `{ kind: 'saved', methodId }` or `{ kind: 'dev_card', card, save }` |
| `PaymentMethodLabel` | `method: PaymentMethodLabel` | "Visa •••• 1881", "Mastercard •••• 4444", "Apple Pay". Brand names come from copy |
| `BankVerificationDialog` | `verification: PaymentVerification`, `onDone(outcome: 'approved' \| 'failed')`, `pending` | Dev stand-in for 3-D Secure: "Your bank wants to confirm it's you", with **Approve** and **Fail** buttons. It's a modal dialog: focus is trapped and Escape counts as fail. Label it as a development stand-in |
| `CancellationSummary` (`src/ui/components/money/`) | `policy: CancellationPolicySummary`, `helperName: string` | "Free cancellation until Fri, Nov 20, 10:00 am. After that, you get $54.00 back and Jordan receives $12.00." Link to `routes.legal('cancellation-policy')` |

**Form:** react-hook-form with `zodResolver(confirmBookingInputSchema)`. Defaults: `{ offerRevision: data.offer.revision, payment: <default choice>, acceptTerms: false }`. Always send `offerRevision` unchanged; it isn't a visible field.

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success codes | Error codes |
|---|---|---|---|
| `onConfirm` | `ConfirmBookingInput` | `booked` + `redirectTo` → `router.push(redirectTo)` | `payment_declined`, `insufficient_funds` (error at the payment section, focus it; the poster can pick another card and retry), `requires_bank_verification` + `verification` → open `BankVerificationDialog` (use `needsBankVerification(result)`), `version_conflict` ("Jordan changed this offer. Reload to see the new terms" + a reload button: `router.refresh()`), `not_allowed` ("This offer can't be booked any more" + reload), `expired` ("Your booking hold ran out. Start again" + reload), `rate_limited` (with `retryAt`), `validation_failed` (`fieldErrors`: `acceptTerms`, `payment.methodId`, `payment.card`; focus the first), `unknown` |
| `onFinishVerification` | `{ paymentId, outcome }` | Same as `onConfirm` | Same as `onConfirm`. A failed verification comes back as `payment_declined` |

While a request runs, lock the form (no double submit) and show progress on the button ("Booking…"). Keep the poster's choices after an error.

Copy namespaces: `bookingConfirm` (the screen) and `payments` (picker, labels, brands, test cards, bank dialog; reused later by invites and payment settings).

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-booking-confirm/default` | `deskConfirmData` | Two saved cards, the Visa selected, terms unticked |
| `screen-booking-confirm/new-card` | `deskConfirmNewCardData` | No saved cards: the test-card stand-in selected |
| `screen-booking-confirm/declined` | `deskConfirmDeclinedData` | The pending banner with the Visa decline, hold until 9:31 am |
| `screen-booking-confirm/insufficient-funds` | `deskConfirmInsufficientFundsData` | The same, for insufficient funds |
| `screen-booking-confirm/hourly` | `movingConfirmHourlyData` | $35/h, 4 h cap, $154.00 today, the unused-hours note |
| `screen-booking-confirm/remote` | `remoteConfirmData` | The remote address notice; Lee |
| `screen-booking-confirm/bank-verification` | `deskConfirmNewCardData` + a handler returning `requires_bank_verification` | The dialog open |
| `screen-booking-confirm/unavailable-<reason>` | `deskConfirmUnavailableData[reason]` | One preview per reason (6) |
| `screen-booking-confirm/result-<code>` | `deskConfirmData` + the result | `payment-declined`, `version-conflict`, `not-allowed`, `expired`, `rate-limited`, `validation-failed` (terms not ticked), `unknown` |
| `screen-booking-confirm/submitting` | `deskConfirmData` | The locked form while booking |
| `component-payment-method-picker/{saved,new-card}` | `mayaPaymentPanel`, `noSavedCardsPaymentPanel` | The picker on its own |
| `component-cancellation-summary/{fixed,hourly}` | `deskConfirmData.cancellation`, `movingConfirmHourlyData.cancellation` | The cancellation line |

## Tests
- Books with the default saved card once the terms are ticked: `onConfirm` gets `{ offerRevision: 1, payment: { kind: 'saved', methodId: 'pm_maya_visa' }, acceptTerms: true }`, then navigates to `redirectTo`.
- Without the terms ticked, `onConfirm` isn't called. The `must_accept` error shows and focus moves to the checkbox.
- `declined` test card → error at the payment section; switching to the Mastercard and resubmitting books.
- `requires_verification` → the dialog opens; **Approve** calls `onFinishVerification({ paymentId: 'pay_desk_2', outcome: 'approved' })` and navigates; **Fail** shows the decline.
- `version_conflict` → the reload action calls `router.refresh()`.
- Double clicks send one request.
- Unavailable data renders no form and links back to the task.
- Copy exists for every `BOOKING_UNAVAILABLE_REASONS` value, every `DEV_TEST_CARDS` value, and every `CARD_BRANDS` value plus `apple_pay` and `google_pay`.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No fee math, no routes built by hand, no hard-coded strings.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-010.md`. That file tells Claude you're done.

## Out of scope
- The booking page after success (UI-011), direct requests and invites (UI-025), receipts and saved-card management (UI-016).
- Real card fields, Apple Pay, and Google Pay (the Stripe Payment Element comes with the Stripe integration).

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
