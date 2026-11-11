# UI-027 — Change requests on a booking

**Status:** ready for Codex · **Branch:** `ui/UI-027-change-requests` · **Plan first:** no (unattended) · **Depends on:** UI-010 (payment panel), UI-011 (booking page)

## Goal
After booking, plans change: a chair to add, a later start, one more hour on a move. Either person can propose new terms; the other accepts or declines; the proposer can withdraw (blueprint 03 §5, 04 §5, 02 J5). Before anyone accepts, both see the money before and after: the total, the helper's earnings and the fees. When the total goes up, the client pays the difference with the payment panel before the new terms apply; when it goes down, the difference is refunded.
- **Propose** (`/app/bookings/[bookingId]/changes/new`): the fields that can change now, a message, and a live quote from the server.
- **Review** (`/app/bookings/[bookingId]/changes/[changeId]`): the current and proposed terms side by side, the money, and the actions for this viewer (accept, decline, withdraw, pay the difference).
- **The booking page** links to an open change (`BookingView.openChange`), and its `propose_change` action opens the propose page.

Claude wires the routes (the `(flow)` group) and the data.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-027.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §6 (money)
- `docs/blueprint/03-state-machines.md` §5 (change requests); `docs/ui/ui-contract.md` §3 (the desk + chair and moving cap numbers)
- Contracts:
  - **`src/contracts/changes.ts`:** `PROPOSABLE_CHANGE_TYPES`, `ChangeTermsView`, `CHANGE_ACTIONS`, `ChangeRequestView`, `ProposeChangePageData`, `proposeChangeInputSchema`, `ChangeQuoteResult`, `ProposeChangeHandlers`, `ChangeReviewPageData`, `acceptChangeInputSchema`, `ChangeReviewHandlers`.
  - `bookings.ts` (`BookingView.openChange`), `status.ts` (`CHANGE_STATUSES`), `money.ts`, `payments.ts` (the payment panel, `PaymentAttemptResult`, `needsBankVerification`), `routes.ts` (`app.bookingProposeChange`, `app.bookingChange`, `app.booking`).
- Fixtures:
  - **`src/fixtures/changes.ts`:**
    - review pages: `deskChairChangeProposerData`, `deskChairChangeCounterpartyData`, `deskChairChangePayData`, `deskChairChangeAppliedData`, `deskChairChangeDeclinedData`, `movingCapChangeData`;
    - propose pages: `deskProposeChangeData`, `movingProposeChangeData`, `deskProposeChangeBlockedData`;
    - `deskChairQuote`, `fakeProposeChangeHandlers`, `fakeChangeReviewHandlers`.
  - **`src/fixtures/bookings.ts`:** `deskBookingPosterWithOpenChange`, `deskBookingHelperWithOpenChange`.
- Reuse:
  - the payment panel and the bank verification dialog (UI-010);
  - `PriceBreakdownTable` with the viewer's variant;
  - the offer form's money inputs (dollars in, cents out) and its debounced quote (UI-009).

## Build

**Screens** (`src/ui/screens/bookings/changes/`, exported from the bookings index). One H1 each.

| Screen | Props | Content |
|---|---|---|
| `ProposeChangeScreen` | `data: ProposeChangePageData`, `handlers: ProposeChangeHandlers`, `now` | "Propose a change" with the booking title. Only the fields in `allowedTypes`: the price (fixed) or the rate and hours cap (hourly), the start (date and time within `scheduleWindow`, market time), the scope, and the expense allowance; plus the message. A **money** card from `onQuote` (debounced) shows before and after for this viewer's role. For clients it also shows "You'd pay $22.00 more" or "$10.00 would come back to your card". Send with `proposeChangeInputSchema`, only the changed fields. With `openChangeId`: "A change is already open" linking to it instead of the form |
| `ChangeReviewScreen` | `data: ChangeReviewPageData`, `handlers: ChangeReviewHandlers`, `now` | "Change to {title}". Who proposed it and their message. **Current vs proposed** terms side by side, with the changed lines marked. The **money** before and after (the viewer's variant), and for clients the difference line. The status ("Waiting for Jordan", "Accepted: pay $22.00 to apply it", "Applied", "Declined"…) and the expiry. Actions from `change.actions`: **Accept** (clients paying a difference choose a card in the payment panel first), **Decline**, **Withdraw**, **Pay $22.00**. Bank verification uses the dev dialog as on the confirmation page |

**Booking page (update):** with `openChange`, show a banner, for example "You proposed a change: waiting for Jordan" or "Maya proposed a change: review it", linking to `routes.app.bookingChange(id, openChange.id)`. The `propose_change` action links to `routes.app.bookingProposeChange(id)`.

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success | Error codes |
|---|---|---|---|
| `onQuote` | `ProposeChangeInput` | `{ ok: true, before, after, differenceCents }` | `validation_failed`, `not_allowed`, `unknown` |
| `onPropose` | `ProposeChangeInput` | `sent` + `redirectTo` | `validation_failed`, `not_allowed`, `rate_limited`, `unknown` |
| `onAccept`, `onPayDifference` | `AcceptChangeInput` | `updated` / `paid` + `redirectTo` | `requires_bank_verification` (with `verification`), `payment_declined`, `insufficient_funds`, `expired`, `not_allowed`, `version_conflict`, `unknown` |
| `onDecline`, `onWithdraw` | none | `updated` + `redirectTo` | `not_allowed`, `unknown` |

Copy namespace: `changes` (plus booking page additions).

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-propose-change/{desk,moving,blocked,quote-pending,validation-failed}` | the propose fixtures + `deskChairQuote` | Proposing |
| `screen-change-review/{proposer,counterparty,pay-difference,applied,declined,moving-cap}` | the review fixtures | Reviewing |
| `screen-change-review/{bank-verification,payment-declined}` | `deskChairChangePayData` + results | Paying the difference |
| `screen-booking/{poster-open-change,helper-open-change}` | the booking fixtures | The banner |

## Tests
- Propose sends only the changed fields, in cents and ISO time, and shows the server's quote (no money math in the UI).
- Only `change.actions` render; a client paying a difference must choose a card first.
- `requires_bank_verification` opens the dev bank dialog, as on the confirmation page.
- Copy exists for every `PROPOSABLE_CHANGE_TYPES`, `CHANGE_STATUSES` and `CHANGE_ACTIONS` value.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings or money math.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-027.md`. That file tells Claude you're done.

## Out of scope
- Settlement offers between the two people during a dispute (support settles in UI-019), and recurring series changes (phase 2).

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
