# UI-029 — Availability posts: open slots, and requesting one

**Status:** ready for Codex · **Branch:** `ui/UI-029-availability-posts` · **Plan first:** no (unattended) · **Depends on:** UI-005 (helper profile), UI-009 (helper pages), UI-025 (request page, invite card)

## Goal
Helpers publish open slots, and clients request one (blueprint 02 J3 step 4, 03 §3):
- **My availability** (`routes.app.availability()`, the helper's nav already links to it). A form for a new slot: one category (from the helper's bookable categories), a date, a start and end time (market time), and the price (fixed or hourly, pre-filled from the helper's listed price for that category). The helper's service area is shown, not edited ("East Austin + 5 mi"). Below, the posts: upcoming ones (open, requested, booked), then past and canceled ones. An open or requested post can be **canceled** (asking first; a requested one says the client's request will be declined and their hold released). A requested post shows who asked and links to the request (`routes.app.offers(inviteId)`); a booked one links to the booking.
- **The helper's profile** lists open slots ("Open times"), each with **Request this time** → `routes.app.requestHelper(handle, { slotId })`.
- **The request page** (UI-025) with a slot: a summary of the slot at the top ("Sat, Dec 12 · 9:00 am–1:00 pm · Yard cleanup · $30/h"). Only the client's tasks that fit the slot are listed. The start defaults to the later of the slot's start and the task window's start, and must fall inside both. The price is pre-filled from the slot. The request sends `slotId`. When the slot was taken meanwhile (`slotUnavailable`), say so and show the regular request form.
- **The invite card** (UI-025) shows the slot when an invite came from one ("For your Sun, Dec 13 · 1:00–5:00 pm opening").

The slot is held while its request waits, booked when the helper accepts, and open again if the request is declined, canceled, or expires. Claude wires the routes and data.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-029.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §6 (money)
- `docs/blueprint/02-sitemap-and-journeys.md` J3; `docs/blueprint/03-state-machines.md` §3
- Contracts:
  - **`src/contracts/availability.ts`:** `AvailabilitySlotView`, `AvailabilityPostView`, `MyAvailabilityPageData`, `availabilityPostInputSchema`, `AvailabilityHandlers`.
  - `status.ts` (`AVAILABILITY_STATUSES`), `action-ids.ts` (`AVAILABILITY_ACTION_IDS`).
  - `invites.ts`: `RequestHelperPageData.slot`, `slotUnavailable`; `requestHelperInputSchema.slotId`; `InviteView.slot`.
  - `profiles.ts`: `HelperProfilePageData.slots`.
  - `helper-work.ts` (`HelperSetupState`), `routes.ts` (`app.availability`, `app.requestHelper(handle, { slotId })`, `app.offers(inviteId)`, `app.booking`, `app.helperOnboarding`).
- Fixtures:
  - **`src/fixtures/availability.ts`:**
    - slots: `jordanYardSlot`, `jordanEveningSlot`, `jordanSundaySlot`;
    - posts: `yardPostActive`, `eveningPostActive`, `sundayPostHeld`, `movingPostBooked`, `yardPostCanceled`, `yardPostExpired`;
    - pages: `myAvailabilityData`, `myAvailabilityEmptyData`, `myAvailabilityAtLimitData`, `myAvailabilityNotBookableData`, `jordanProfileWithSlotsData`, `requestJordanSlotData`, `requestJordanSlotTakenData`;
    - `slotInviteSentHelper`, `fakeAvailabilityHandlers`.
- Reuse:
  - the price inputs (`MoneyInput`, the fixed or hourly fields) from UI-025's request form;
  - the posting wizard's date and time fields (market time) from UI-006;
  - the "finish setting up" panel from Find work (UI-009) for helpers who aren't bookable (`setup.nextOnboardingStep`);
  - `InviteCard` and `RequestHelperScreen` (UI-025), the helper profile screen (UI-005).

## Build

| Item | File | Props | Content |
|---|---|---|---|
| `MyAvailabilityScreen` | `src/ui/screens/availability/my-availability-screen.tsx` (exported from `src/ui/screens/availability/index.ts`) | `data: MyAvailabilityPageData`, `handlers: AvailabilityHandlers`, `now` | "My availability". The new-slot form (validated with `availabilityPostInputSchema`; dates limited to `limits.firstDate`–`limits.lastDate`; hints: at least `leadHours` from now, at most `maxHours` long). When `limits.activeCount >= limits.maxActive`: the form is replaced by "You have 10 open times. Cancel one to add another." Not bookable: the finish-setup panel instead of the form. The posts list (cards): category, date and times, the price ("$30/h · about 3 h, up to 4 h" or "$45"), the area, the status, the client for a requested or booked post with its link, and **Cancel** when `actions` has `cancel_post`. Empty: "No open times yet" |
| `AvailabilitySlotList` | `src/ui/components/availability/availability-slot-list.tsx` | `slots: AvailabilitySlotView[]`, `handle: string` | The profile's "Open times": each slot's day, times (market time), category and price, and **Request this time** linking to `routes.app.requestHelper(handle, { slotId })` |
| Helper profile (update) | UI-005 screen | `HelperProfilePageData` | `AvailabilitySlotList` when `slots` has any |
| Request page (update) | UI-025 screen | `RequestHelperPageData` | With `slot`: the slot summary, the start default and limits above, the slot's price, and `slotId` in the request. With `slotUnavailable`: a notice ("That time was just booked or removed. You can still send a request.") and the regular form |
| Invite card (update) | UI-025 component | `InviteView` | With `slot`: one line naming the slot (both roles) |

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success | Error codes |
|---|---|---|---|
| `onCreate` | `AvailabilityPostInput` | `saved` (refreshes) | `validation_failed` (`fieldErrors` on `date`, `startTime`, `endTime`, `categorySlug`), `limit_reached`, `not_allowed`, `unknown` |
| `onCancel` | `{ postId }` | `canceled` (refreshes) | `not_allowed`, `unknown` |
| `onRequest` (UI-025) | `RequestHelperInput` (+ `slotId`) | `sent` + `redirectTo` | as in UI-025; `not_allowed` also means the slot was just taken |

Copy namespace: `availability` (plus additions to the screens you update). Status labels for every `AVAILABILITY_STATUSES` value: open, requested, booked, past, canceled.

**Also (placeholders to review):** `ALL_ACTION_IDS` gained `cancel_post`; Claude added `"cancel_post": "Cancel"` to `messages/en/ui/actions.json` so `main` compiles. Please review it.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-my-availability/{default,empty,at-limit,not-bookable,submitting,errors}` | `myAvailabilityData`, `myAvailabilityEmptyData`, `myAvailabilityAtLimitData`, `myAvailabilityNotBookableData` + results | The page in each state; field errors from a `validation_failed` result |
| `screen-my-availability/cancel-held` | `myAvailabilityData` | The cancel confirmation for the requested post |
| `component-availability-slot-list/default` | `jordanProfileWithSlotsData.slots` | Open times |
| `screen-helper-profile/with-slots` | `jordanProfileWithSlotsData` | The profile with open times |
| `screen-request-helper/{slot,slot-taken}` | `requestJordanSlotData`, `requestJordanSlotTakenData` | Requesting a slot; the slot was taken |
| `component-invite-card/slot-helper` | `slotInviteSentHelper` | A request from a slot, helper side |

## Tests
- The form sends `{ categorySlug, date, startTime, endTime, pricing }` with cents and market-time strings, pre-fills the listed price for the chosen category, and shows `fieldErrors` from the result on the right fields.
- Only `post.actions` render; canceling asks first.
- With a slot, the request sends `slotId` and a start inside both the slot and the task window.
- Copy exists for every `AVAILABILITY_STATUSES` and `AVAILABILITY_ACTION_IDS` value.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings or money math.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-029.md`. That file tells Claude you're done.

## Out of scope
- Recurring availability, editing a post (cancel and post again), slots on the task board or a helper directory, My clients and rebooking proposals (UI-032).

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
