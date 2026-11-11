# UI-025 — Direct invites: ask a helper, accept, decline, counter

**Status:** ready for Codex · **Branch:** `ui/UI-025-direct-invites` · **Plan first:** no (unattended) · **Depends on:** UI-005 (helper profile), UI-007 (task page), UI-009 (my offers), UI-010 (payment panel)

## Goal
Clients can ask a helper they know to do a task, without waiting for offers (blueprint 02 J3, 03 §3):
- **Request a helper** (`routes.app.requestHelper(handle, { fromBookingId })`). From a helper's profile, saved helpers, or **Book again** on a past booking. Pick one of your open tasks in the helper's categories, the start, and the price (the helper's listed price or the last price, pre-filled). Add a message and choose a card. The card is **authorized, not charged**, for the total; the quote comes from the server.
- **The helper** sees invites on `/app/offers`; `routes.app.offers(inviteId)` opens one in a sheet. They can **accept** (the card is charged and the booking is confirmed), **decline** (the hold is released), or **counter** with a new price or start and a message.
- **The client** sees sent invites on the task's page: waiting, countered (the counter's price and money, **accept the counter** or **decline**), accepted (a link to the booking), declined or expired. They can **cancel** while waiting.

An invite expires 48 h after it's sent or 2 h before the start, whichever is sooner. Claude wires the routes and data.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-025.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §6 (money)
- `docs/blueprint/02-sitemap-and-journeys.md` J3; `docs/blueprint/03-state-machines.md` §3 (direct invite states)
- Contracts:
  - **`src/contracts/invites.ts`:** `invitePricingSchema`, `InvitableTask`, `RequestHelperPageData`, `requestHelperInputSchema`, `RequestHelperHandlers`, `InviteView`, `counterInviteInputSchema`, `InviteHandlers`.
  - `helper-work.ts` (`MyOffersPageData.invites`, `openInviteId`), `offers.ts` (`TaskOwnerView.invites`), `action-ids.ts` (`INVITE_ACTION_IDS`), `status.ts` (`INVITE_STATUSES`).
  - `payments.ts` (the panel, `PaymentAttemptResult`, `needsBankVerification`), `routes.ts` (`app.requestHelper`, `app.offers`, `app.task`, `app.booking`).
- Fixtures:
  - **`src/fixtures/invites.ts`:**
    - request pages: `requestJordanData`, `requestNoTasksData`;
    - invites: `bookshelfInviteSentPoster`, `bookshelfInviteSentHelper`, `bookshelfInviteCounteredPoster`, `bookshelfInviteCounteredHelper`, `bookshelfInviteAcceptedPoster`, `bookshelfInviteDeclinedPoster`, `bookshelfInviteExpiredHelper`;
    - pages with invites: `myOffersWithInviteData`, `bookshelfOwnerWithInviteView`;
    - `fakeRequestHelperHandlers`, `fakeInviteHandlers`.
- Reuse:
  - the payment panel and dev bank dialog (UI-010);
  - the offer form's price inputs and debounced quote (UI-009);
  - `PriceBreakdownTable` (the viewer's variant);
  - the My offers screen (UI-009) and the task page (UI-007).

## Build

| Item | File | Props | Content |
|---|---|---|---|
| `RequestHelperScreen` | `src/ui/screens/invites/request-helper-screen.tsx` (exported from `src/ui/screens/invites/index.ts`) | `data: RequestHelperPageData`, `handlers: RequestHelperHandlers`, `now` | "Ask {helper} to help". The task (radio cards from `tasks`); with none: "Post a task first" linking to `routes.app.newTask()` (or the posting route the wizard uses). The start within the task's window (market time). The price (fixed or hourly, pre-filled from `suggestion` or `listedPricing`). A message (optional). The live quote from `onQuote`. "We'll hold $49.50 on your card. You're charged only if Jordan accepts." The card panel and the terms checkbox. Send with `requestHelperInputSchema`; on `sent`, go to `redirectTo`; bank verification as on the confirmation page |
| `InviteCard` | `src/ui/components/invites/invite-card.tsx` | `invite: InviteView`, `handlers: InviteHandlers`, `now` | The task, the other person, the terms (price, start, message), the money (the viewer's variant), the status, the expiry ("Expires Thu, Dec 10 · 10:00 am"). For clients, the amount held. While `countered`: the counter's price, start, message and money. Only `invite.actions` render: **Accept**, **Decline**, **Counter** (a form with `counterInviteInputSchema`: price and/or start, and a message), **Cancel**, **Accept counter**, **Decline counter**. Accepted: "Booked" with a link to `routes.app.booking(bookingId)` |
| My offers (update) | UI-009 screen | `MyOffersPageData` + `inviteHandlers: InviteHandlers` | An **Invites** section (open ones first). `openInviteId` opens that invite's `InviteCard` in a sheet (a bottom sheet on phones) |
| Task page (update) | UI-007 owner screen | `TaskOwnerView` + `inviteHandlers: InviteHandlers` | An **Invites you sent** section above the offers, with an `InviteCard` per invite |
| Helper profile and saved helpers (update) | UI-005 and UI-015 screens | existing data | A **Request {name}** link to `routes.app.requestHelper(handle)` for signed-in clients (where the screens already know the viewer can book). The booking page's `book_again` action links to `routes.app.requestHelper(handle, { fromBookingId })` |

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success | Error codes |
|---|---|---|---|
| `onQuote` | `{ pricing }` | `PriceBreakdown` | (throws on failure: show "Couldn't update the total") |
| `onRequest` | `RequestHelperInput` | `sent` + `redirectTo` | `requires_bank_verification`, `validation_failed`, `payment_declined`, `insufficient_funds`, `not_allowed`, `rate_limited`, `unknown` |
| `onFinishVerification` (request) | `{ paymentId, outcome }` | `sent` + `redirectTo` | `payment_declined`, `insufficient_funds`, `not_allowed`, `unknown` |
| `onAccept` | `{ inviteId }` | `booked` + `redirectTo` | `expired`, `not_allowed`, `payment_declined`, `unknown` |
| `onDecline`, `onCancel`, `onDeclineCounter` | `{ inviteId }` | `updated` | `not_allowed`, `expired`, `unknown` |
| `onCounter` | `{ inviteId, counter }` | `sent` | `validation_failed`, `not_allowed`, `expired`, `unknown` |
| `onAcceptCounter` | `{ inviteId }` | `booked` + `redirectTo` | `requires_bank_verification`, `payment_declined`, `insufficient_funds`, `expired`, `not_allowed`, `unknown` |
| `onFinishVerification` (invite) | `{ inviteId, paymentId, outcome }` | `booked` + `redirectTo` | as above |

Copy namespaces: `invites` (plus additions to the screens you update).

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-request-helper/{default,no-tasks,quote-pending,bank-verification,payment-declined}` | `requestJordanData`, `requestNoTasksData` + results | Requesting |
| `component-invite-card/{sent-client,sent-helper,countered-client,countered-helper,accepted,declined,expired,counter-form}` | the invite fixtures | Each state, both roles |
| `screen-my-offers/with-invite` | `myOffersWithInviteData` | The invite sheet open |
| `screen-task-owner/with-invite` | `bookshelfOwnerWithInviteView` | A countered invite on the task page |

## Tests
- The request sends `{ taskId, start, pricing, message?, payment, acceptTerms }` with cents and an ISO start, and shows the server quote (no money math).
- Only `invite.actions` render; the counter form needs a price or a start, and a message of at least 10 characters.
- `requires_bank_verification` opens the dev bank dialog (request and accept counter).
- Copy exists for every `INVITE_STATUSES` and `INVITE_ACTION_IDS` value.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings or money math.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-025.md`. That file tells Claude you're done.

## Out of scope
- Availability posts and slot requests, the helper's My clients and rebooking proposals (later), and the acceptance reward chip (off at launch).

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
