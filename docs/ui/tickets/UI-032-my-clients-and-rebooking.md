# UI-032 — My clients and rebooking proposals

**Status:** ready for Codex · **Branch:** `ui/UI-032-my-clients-and-rebooking` · **Plan first:** no (unattended) · **Depends on:** UI-010 (payment panel, bank dialog), UI-011 (booking page actions), UI-023 (home attention), UI-025 (price fields, quotes)

## Goal
Helpers can offer past clients the same task again, and clients answer by paying (blueprint 01 "My clients", 02 J8, 03 §4):
- **My clients** (`routes.app.clients()`, the helper's nav already links to it): the people the helper completed bookings for, most recent first. Each row: the client, how many bookings together, the last one (title, category, date, price, what the helper earned), a waiting proposal (start, "Expires Thu, Dec 10 · 11:00 am", a link to it), and **Propose a booking** when `actions` has `propose_rebook` (→ `routes.app.bookingRebook(lastBooking.id)`). Empty: "Clients you've completed bookings for appear here."
- **Propose a booking** (`routes.app.bookingRebook(bookingId)`; also the booking page's `offer_rebook` action on a completed booking, helper side): the client and the past task (title, category, area). A date and start time (market time, within `limits`), the price (fixed or hourly, the last price pre-filled), a message (optional), and the helper's earnings from `onQuote`. "Maya R. pays only if they accept. The proposal expires in 48 hours or 2 hours before the start."
- **A proposal** (`routes.app.proposal(proposalId)`), both sides:
  - **Client:** "Jordan T. proposed a booking": the task, the start, their own address (`ExactAddressPanel`), the message, their total from `breakdown`. While sent: the card panel, the terms checkbox, **Accept and pay** (charged now; on `booked`, go to `redirectTo`; bank verification as on the confirmation page), and **Decline** (asks first).
  - **Helper:** the same terms with their earnings; **Withdraw** while it waits (asks first).
  - Accepted: "Booked" with a link to the booking. Declined, expired, withdrawn: say so.
- **Home** gains three attention items (see Also).

Claude wires the routes and data.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-032.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §6 (money)
- `docs/blueprint/02-sitemap-and-journeys.md` J8; `docs/blueprint/03-state-machines.md` §4
- Contracts:
  - **`src/contracts/rebook.ts`:** `MyClientRow`, `MyClientsPageData`, `ProposeRebookPageData`, `rebookProposalInputSchema`, `ProposeRebookHandlers`, `RebookProposalView`, `ProposalPageData`, `acceptProposalInputSchema`, `ProposalHandlers`.
  - `status.ts` (`REBOOK_PROPOSAL_STATUSES`), `action-ids.ts` (`CLIENT_ACTION_IDS`, `REBOOK_ACTION_IDS`, booking `offer_rebook`).
  - `home.ts` (`ATTENTION_KINDS`: `answer_invite`, `answer_counter`, `answer_proposal`; target `{ kind: 'proposal', proposalId }`), `account.ts` (notification types `rebook_proposed`, `rebook_accepted`, `rebook_declined`).
  - `payments.ts` (the panel, `PaymentAttemptResult`, `needsBankVerification`), `routes.ts` (`app.clients`, `app.bookingRebook`, `app.proposal`, `app.booking`).
- Fixtures:
  - **`src/fixtures/rebook.ts`:**
    - `myClientsData`, `myClientsEmptyData`, `proposeDeskRebookData`;
    - proposals: `deskProposalSentPoster`, `deskProposalSentHelper`, `deskProposalAcceptedPoster`, `deskProposalDeclinedHelper`, `deskProposalExpiredPoster`, `deskProposalWithdrawnPoster`, `movingProposalSentHelper`;
    - pages: `proposalPosterData`, `proposalHelperData`, `proposalAcceptedData`;
    - `fakeProposeRebookHandlers`, `fakeProposalHandlers`.
  - `src/fixtures/home.ts`: `jordanHomeInviteData`, `mayaHomeCounterData`, `mayaHomeProposalData`; `src/fixtures/account.ts`: `mayaRebookNotificationsData`, `jordanRebookNotificationsData`.
- Reuse: the payment panel and dev bank dialog (UI-010); the price fields and debounced quote (UI-025); `ExactAddressPanel`; `PriceBreakdown` (the viewer's variant); the home attention list (UI-023).

## Build

| Item | File | Props | Content |
|---|---|---|---|
| `MyClientsScreen` | `src/ui/screens/clients/my-clients-screen.tsx` (exported from `src/ui/screens/clients/index.ts`) | `data: MyClientsPageData`, `now` | As in Goal. Not bookable (`setup.bookable` false): rows still show, without the action, and the finish-setup panel from Find work above them |
| `ProposeRebookScreen` | `src/ui/screens/clients/propose-rebook-screen.tsx` | `data: ProposeRebookPageData`, `handlers: ProposeRebookHandlers`, `now` | As in Goal; validated with `rebookProposalInputSchema`; `fieldErrors` from the result on the fields |
| `ProposalScreen` | `src/ui/screens/clients/proposal-screen.tsx` | `data: ProposalPageData`, `handlers: ProposalHandlers`, `now` | As in Goal. Only `proposal.actions` render. Accept sends `acceptProposalInputSchema` |
| Booking page (update) | UI-011 actions | existing data | `offer_rebook` links to `routes.app.bookingRebook(data.id)` (like `book_again`) |
| Home (update) | UI-023 attention list | `AttentionItem` | Copy and links for `answer_invite` ("Maya R. invited you: answer by …"), `answer_counter` ("Jordan T. countered: answer by …"), `answer_proposal` ("Jordan T. proposed a booking: answer by …") |

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success | Error codes |
|---|---|---|---|
| `onQuote` (propose) | `{ pricing }` | `PriceBreakdown` | (throws: "Couldn't update your earnings") |
| `onPropose` | `RebookProposalInput` | `sent` + `redirectTo` | `validation_failed`, `not_allowed`, `rate_limited`, `unknown` |
| `onAccept` | `AcceptProposalInput` | `booked` + `redirectTo` | `requires_bank_verification`, `payment_declined`, `insufficient_funds`, `expired`, `not_allowed`, `unknown` |
| `onFinishVerification` | `{ paymentId, outcome }` | `booked` + `redirectTo` | as above |
| `onDecline`, `onWithdraw` | — | `updated` | `not_allowed`, `expired`, `unknown` |

Copy namespaces: `clients`, `proposal` (plus additions to the screens you update). Status labels for every `REBOOK_PROPOSAL_STATUSES` value.

**Also (placeholders to review):** Claude added placeholders so `main` compiles:
- action labels for `propose_rebook`, `accept_proposal`, `decline_proposal`, `withdraw_proposal` in `messages/en/ui/actions.json`;
- notification types `rebook_proposed`, `rebook_accepted`, `rebook_declined` (icons in `notification-actions.tsx`, `types.*` copy, test maps) and the `proposal` target in `attention-href.ts`;
- the three attention kinds in the home copy and its tests.
Please review them and replace them properly.

**Also (a fix from an earlier review):** on `NotificationsScreen`, "All notifications marked as read." disappears when the list refreshes, because `MarkAllRead` (which holds the feedback) only renders while `unreadCount > 0`. Keep the feedback visible after the refresh.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-my-clients/{default,empty,not-bookable}` | `myClientsData`, `myClientsEmptyData` | The list; a waiting proposal; a row without the action |
| `screen-propose-rebook/{default,hourly,submitting,errors,quote-error}` | `proposeDeskRebookData` + results | Proposing |
| `screen-proposal/{client-sent,client-bank-verification,client-declined-card,helper-sent,accepted,declined,expired,withdrawn}` | the proposal fixtures | Each state, both roles |
| `screen-home/{helper-invite,client-counter,client-proposal}` | `jordanHomeInviteData`, `mayaHomeCounterData`, `mayaHomeProposalData` | The new attention items |
| `screen-notifications/{rebook-client,rebook-helper}` | `mayaRebookNotificationsData`, `jordanRebookNotificationsData` | The new notification types |

## Tests
- The proposal form sends `{ date, startTime, pricing, message? }` with cents and market-time strings, pre-fills the last price, and shows the server quote (no money math).
- Only `proposal.actions` render; accepting sends the payment choice and the terms; `requires_bank_verification` opens the dev bank dialog.
- The exact address renders only in `ExactAddressPanel`, only for the client.
- Copy exists for every `REBOOK_PROPOSAL_STATUSES`, `REBOOK_ACTION_IDS`, `CLIENT_ACTION_IDS` and new `ATTENTION_KINDS` value.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings or money math.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-032.md`. That file tells Claude you're done.

## Out of scope
- Editing the task in a proposal (title, details, place), proposals to people who were never clients, recurring bookings.

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
