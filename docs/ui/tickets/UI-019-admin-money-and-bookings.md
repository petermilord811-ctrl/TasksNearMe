# UI-019 — Admin: money resolutions and the staff booking page

**Status:** ready for Codex · **Branch:** `ui/UI-019-admin-money-and-bookings` · **Plan first:** no (unattended) · **Depends on:** UI-018 (merged)

## Goal
Staff can now work cases, but can't settle a problem report with money (blueprint 03 §9, 04 §6; backlog B-053, B-054, B-055):
- **Money resolutions on the case page.** The resolve dialog gains **Release in full**, **Settle at a lower price** (a price input), **Refund in full** and **Goodwill refund** (an amount input). Before recording, the dialog shows what the resolution does with the money: the client's refund, what the helper receives, and what the platform keeps. These come from `onPreviewResolution`; the UI never computes money. When the refund is above the viewer's limit (`withinLimit: false`), the dialog says a lead or finance has to record it, and Resolve stays disabled.
- **The staff booking page** (`/admin/bookings/[bookingId]`): the booking, both people, the money (agreed and final numbers, charged, refunds, earnings), the cases about it, the exact address and the conversation behind a logged reason, and a **Refund** tool within the viewer's limit.

The case page's booking card now links to `routes.admin.booking(id)`. Claude wires the page inside `AdminShell`.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-019.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §6 (money), §7 (admin density)
- `docs/blueprint/04-payments-and-fees.md` §6 (the dispute rows: settled at $45 → client refund $16.50, helper $40.50, platform $9.00)
- Contracts, in **`src/contracts/admin.ts`**:
  - `caseResolutionInputSchema`, now with `settlePriceCents` and `goodwillCents`, each required for its resolution;
  - `AdminCasePageData.money`, `ResolutionPreview`, `ResolutionPreviewResult`, `AdminCaseHandlers.onPreviewResolution`;
  - `STAFF_REFUND_REASONS`, `AdminBookingMoney`, `ADMIN_BOOKING_ACTIONS`, `AdminBookingPageData`, `staffRefundInputSchema`, `RevealAddressResult`, `AdminBookingHandlers`.
- Also `status.ts` (`CASE_RESOLUTIONS`, `EARNINGS_STATUSES`), `money.ts` (`PriceBreakdown`), `location.ts` (`ExactAddress`), and `routes.ts` (`admin.booking`, `admin.case`).
- Fixtures, in **`src/fixtures/admin.ts`**: `disputeMoneyCaseData`, `settleAt45Preview`, `releaseFullPreview`, `overLimitPreview`, `adminBookingDisputedData`, `adminBookingSettledData`, `adminBookingReadOnlyData`, `fakeAdminBookingHandlers` (and `fakeAdminCaseHandlers.onPreviewResolution`).
- Reuse:
  - the UI-018 case screen and resolve dialog;
  - `PriceBreakdownTable` (or the receipt's money lines from UI-016) with a staff variant;
  - `ExactAddressPanel` for the revealed address (the only place an exact address may render);
  - the UI-018 reason dialog for restricted data.

## Build

| Item | File | Props | Content |
|---|---|---|---|
| Resolve dialog (update) | `src/ui/screens/admin/…` | `AdminCasePageData`, `AdminCaseHandlers` | Money resolutions get their input: a price for `settle` (dollars in, cents out; must be below `money.priceCents`) and an amount for `goodwill_refund`. A **preview** card calls `onPreviewResolution` when the choice or amount settles (debounced), showing the client refund, the helper's amount and the platform's share; `validation_failed` shows the field error, `withinLimit: false` shows "Above your refund limit. A lead or finance has to record this." and disables Resolve |
| `AdminBookingScreen` | `src/ui/screens/admin/admin-booking-screen.tsx` | `data: AdminBookingPageData`, `handlers: AdminBookingHandlers`, `now` | The title (H1), status, start, area, both people. **Money**: agreed numbers, final numbers when set, charged, refunded, each refund (reason, status, date), and each earnings line (kind, status, transfer date). **Cases**: rows linking to `routes.admin.case`. **Restricted**: "Show the address" and "Open the conversation", each behind the reason dialog ("Access is logged with your name"); the address renders in `ExactAddressPanel`. **Refund** (when `actions` has `refund`): amount (up to `refund.maxCents`), reason (`STAFF_REFUND_REASONS`), and a note (`staffRefundInputSchema`); show "Your limit: $100.00 per booking" |

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success | Error codes |
|---|---|---|---|
| `onPreviewResolution` | `CaseResolutionInput` | `{ ok: true, preview }` | `validation_failed` (the amount), `not_allowed`, `unknown` |
| `onRefund` | `StaffRefundInput` | `submitted` (refresh) | `validation_failed`, `not_allowed` (over your limit or more than is left), `rate_limited`, `unknown` |
| `onRevealAddress` | `RestrictedAccessInput` | `{ ok: true, address }` | `validation_failed`, `not_allowed`, `unknown` |
| `onRevealConversation` | `RestrictedAccessInput` | `{ ok: true, conversation }` | `validation_failed`, `not_allowed`, `unknown` |

Copy namespaces: `adminCase` (additions) and `adminBooking`.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-admin-case/{resolve-money,settle-preview,over-limit}` | `disputeMoneyCaseData` + `settleAt45Preview`, `overLimitPreview` | Money resolutions in the dialog |
| `screen-admin-booking/{disputed,settled,read-only}` | `adminBookingDisputedData`, `adminBookingSettledData`, `adminBookingReadOnlyData` | The booking page |
| `screen-admin-booking/{address-revealed,refund-form,refund-over-limit}` | `adminBookingDisputedData` + results | Restricted data and the refund tool |

All previews use `now = ADMIN_NOW` inside `AdminShell` with Alex as the viewer.

## Tests
- Settle sends `{ resolution: 'settle', settlePriceCents, summary }`. A price at or above the agreed price shows the field error from the preview, and Resolve stays disabled.
- `withinLimit: false` disables Resolve and explains why.
- The address appears only after a reason of at least 10 characters, and only inside `ExactAddressPanel`.
- The refund form sends cents, caps at `refund.maxCents`, and needs a note of at least 10 characters.
- Copy exists for every `CASE_RESOLUTIONS`, `STAFF_REFUND_REASONS` and `EARNINGS_STATUSES` value.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings or money math.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-019.md`. That file tells Claude you're done.

## Out of scope
- Dual approval for refunds above $500, transfer reversals, chargebacks (finance tools), users and moderation, reward administration (UI-020).

## Claude wiring notes (filled in by Claude after review)
- Route(s): `/admin/bookings/[bookingId]` (new); the case page's resolve dialog now resolves with money.
- Queries / actions:
  - `src/modules/support/staff-money.ts`:
    - `resolveCaseWithMoney`: the money moves first, guarded and keyed per case, then the case resolves;
    - `getAdminBooking`, `staffRefund`, `revealBookingAddress`, `revealBookingConversation`.
  - `previewResolution` and `bookingMoneyFacts` live in `staff.ts`. The actions are in `staff-actions.ts`.
- e2e: `tests/e2e/admin.spec.ts` (a booking's money, and the address after a logged reason). The settle, refund and release flows are covered by `tests/integration/staff-money.test.ts`.
