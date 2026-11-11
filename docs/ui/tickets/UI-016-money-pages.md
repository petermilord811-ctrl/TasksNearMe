# UI-016 — Money pages: receipts and cards, earnings and payouts

**Status:** wired · **Branch:** `ui/UI-016-money-pages` · **Plan first:** no (unattended) · **Depends on:** UI-012 (merged)

## Goal
Both people can see where the money went (blueprint 02 J7, 04 §5–6):
- **The client** (`/app/payments`): receipts for every booking (charged, refunded, net), a printable receipt per booking (`/app/payments/[bookingId]`), and saved cards (add a development test card, make one the default, remove one).
- **The helper** (`/app/earnings`): totals (upcoming, on the way, paid this year), every transfer (earnings, reimbursements, cancellation compensation) with its payout, the payout account, and a link to the payout dashboard.

Rewards and gift cards are a later ticket. Claude wires the three pages inside `AppShell`.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-016.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §5, §6, §7
- `docs/blueprint/04-payments-and-fees.md` §5 (transfers after completion; payouts about 2 business days later; the first payout after about 7 days) and §6 (refunds)
- Contracts:
  - **`src/contracts/earnings.ts`:** `ReceiptRow`, `PaymentsPageData`, `ReceiptLine`, `ReceiptPageData`, `addCardInputSchema`, `AddCardInput`, `PaymentMethodHandlers`, `EARNINGS_KINDS`, `EarningsRowView`, `EarningsPageData`, `EarningsHandlers`.
  - `payments.ts` (`SavedPaymentMethod`, `PaymentMethodLabel`, `DEV_TEST_CARDS`), `status.ts` (`EARNINGS_STATUSES`, `PAYOUT_STATUSES`, `PAYOUT_ACCOUNT_STATUSES`, `PAYMENT_STATUSES`), `money.ts` (poster variant of `PriceBreakdown`), `routes.ts` (`payments`, `receipt` (new), `earnings`, `booking`).
- Fixtures: **`src/fixtures/earnings.ts`**:
  - client: `mayaPaymentsPageData`, `paymentsEmptyData`, `deskReceiptPageData` (an allowance refund), `deskSimpleReceiptPageData`;
  - helper: `jordanEarningsPageData`, `jordanEarningsActionNeededData`, `earningsFirstPayoutData`, `earningsEmptyData`;
  - handlers: `fakePaymentMethodHandlers`, `fakeEarningsHandlers`.
- Reuse: `PaymentMethodLabel`, `PriceBreakdown`, `useEarningsStatus` / `usePaymentStatus` + `StatusBadge`, `Money`, `EmptyState`, `PageHeader`, `AlertDialog`.

## Follow-ups (fix first)
1. **Flaky focus tests in `src/ui/screens/bookings/completion-screen.test.tsx`.** On a busy machine, one of the focus assertions fails in about every other run, even alone: "focuses a dotted server receipt error…" and "focuses a rejected receipt photo…". That failed the independent check for UI-012. Make them deterministic: wait for focus with `waitFor`/`findBy*`, or move focus without timers in the form. Then run the file five times in a row; all runs must pass.

## Build

**Screens** (`src/ui/screens/money/`, exported from `src/ui/screens/money/index.ts`). One H1 each.

| Screen | Props | Content |
|---|---|---|
| `PaymentsScreen` | `data: PaymentsPageData`, `handlers: PaymentMethodHandlers`, `now` | "Payments". **Receipts:** a row per booking with the title (links to `routes.app.receipt(bookingId)`), the helper, the paid date, "Charged $86.00 · Refunded $12.00 · Net $74.00", and the status badge. Empty: "No payments yet". **Cards:** each saved card (`PaymentMethodLabel`, expiry, "Default"), with **Make default** and **Remove** (asks first). **Add a card:** the development test-card stand-in (outcome choice from `DEV_TEST_CARDS` and "Make this my default"), clearly labeled "Test card (development)". Results: `saved` / `updated` → refresh; `payment_declined` → "That card was declined"; `not_allowed` on remove → "This card pays for a booking in progress" |
| `ReceiptScreen` | `data: ReceiptPageData` | A printable receipt: TasksNearMe, the receipt number, the issue date, the task (links to `routes.app.booking(id)`), the helper, the agreed start, `PriceBreakdown` (poster variant), then every charge and refund (refund reasons in words: "Unused expense allowance", "Cancellation", …), and the net total. A **Print** button (`window.print()`) and print styles that hide the app chrome |
| `EarningsScreen` | `data: EarningsPageData`, `handlers: EarningsHandlers`, `now` | "Earnings". **Totals:** upcoming, on the way, paid this year. **Payout account:** "Payouts go to •••• 6789". When `actionNeeded`: an alert, "A payout failed. Update your bank details", with **Update bank details** → `handlers.onOpenPayoutDashboard()` → navigate to `redirectTo`. Otherwise a quiet **Payout dashboard** link through the same handler. `firstPayoutNotice`: "Your first payout usually arrives about 7 days after your first payment." **Transfers:** rows with the title (links to `routes.app.booking(bookingId)`), the client, the kind ("Earnings", "Expense reimbursement", "Late cancellation"), the amount, the status badge, why it's on hold ("A problem was reported; support is looking at it"), and the payout ("Arrives Tue, Dec 1 · •••• 6789", "Paid Wed, Nov 25", "Payout failed"). Empty: "No earnings yet" with a link to `routes.app.findWork()` |

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success codes | Error codes |
|---|---|---|---|
| `onAddCard` | `AddCardInput` | `saved` | `validation_failed`, `payment_declined`, `rate_limited`, `unknown` |
| `onRemoveCard` | `{ methodId }` | `updated` | `not_allowed`, `not_found`, `unknown` |
| `onMakeDefault` | `{ methodId }` | `updated` | `not_found`, `unknown` |
| `onOpenPayoutDashboard` | none | `updated` + `redirectTo` | `not_allowed`, `unknown` |

Copy namespaces: `paymentsPage`, `receipt`, `earnings`. The `payments` namespace already exists (picker, labels); reuse it for card labels.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-payments/{default,empty}` | `mayaPaymentsPageData`, `paymentsEmptyData` | Receipts and cards |
| `screen-payments/{adding-card,card-declined,remove-confirm,remove-not-allowed}` | `mayaPaymentsPageData` + handler results | Card flows |
| `screen-receipt/{allowance-refund,simple}` | `deskReceiptPageData`, `deskSimpleReceiptPageData` | The receipt |
| `screen-earnings/{default,action-needed,first-payout,empty}` | the four earnings fixtures | Earnings |

## Tests
- Receipt rows show charged, refunded and net exactly as supplied (no arithmetic in the UI).
- Remove asks first; `not_allowed` shows the reason; make default calls the handler with the card id.
- The add-card form sends `{ card, makeDefault }`; a decline shows the message and keeps the form.
- Earnings rows word every `EARNINGS_KINDS` value and every hold reason; payouts show the arrival date and the bank's last four digits only.
- The action-needed alert calls `onOpenPayoutDashboard` and navigates to its `redirectTo`.
- Copy exists for every `EARNINGS_STATUSES`, `PAYOUT_STATUSES` and refund reason value.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No money math, no routes built by hand, no hard-coded strings.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-016.md`. That file tells Claude you're done.

## Out of scope
- Rewards and gift cards (a later ticket), tax forms, instant payouts, and real card entry (the Stripe Payment Element comes with the Stripe integration).

## Claude wiring notes (filled in by Claude after review)
- Route(s): `/app/payments`, `/app/payments/[bookingId]`, `/app/earnings`.
- Queries / actions: `getPaymentsPage`, `getReceiptPage`, `getEarningsPage` (settles development payouts), `addCard`, `removeCard`, `makeDefaultCard` (`src/modules/earnings/service.ts`); Server Actions in `src/modules/earnings/actions.ts`; the ledger is written by `recordCompletionMoney` and `recordCompensation`.
- e2e: `tests/e2e/money.spec.ts`.
