# Prompt 09 — Booking page: structure and every state

**Plan first:** yes · **Depends on:** 08 · **Branch:** `ui/09-booking-hub`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §4 (`BookingView` and related types), §5, §6, §7 (every `desk.*`, `moving.*`, `computer.remote.*`, `bookshelf.*` scenario)
- `docs/codex/design-system.md` §4.2 (`BookingStateBanner`, `ActionBar`, `Timeline`, `ExactAddressPanel`, `GeneralArea`, `PriceBreakdown`, `Deadline`), §5, §6
- `docs/blueprint/02-sitemap-and-journeys.md` J4–J7
- `docs/blueprint/03-state-machines.md` §1 (invariants), §4, §6

## Build
1. **`/app/bookings`.**
   - Tabs: **Upcoming**, **Needs action**, **Past**.
   - For people who both post and help, a filter: "As client" / "As helper".
   - `BookingCard`: title, other party, date, status badge for the viewer, and the next deadline.
   - Empty states.
2. **`/app/bookings/[bookingId]`** (`DetailPageShell`), in this order:
   - **Header:** title, category icon, other party (helpers see the client's first name, initial, and client rating; posters see the helper card), and `StatusBadge` for the viewer.
   - **`BookingStateBanner`:** headline, what happens next, and a `Deadline`, for **every status × viewer**. Put the copy table in `messages/en.json`. Examples:
     - **completion_submitted, poster:** "Approve or report a problem by Tue, Nov 24 · 11:48 am. After that, the task is approved automatically."
     - **completion_submitted, helper:** "Waiting for Maya's approval. If Maya doesn't respond, it's approved automatically on Tue, Nov 24 · 11:48 am."
     - **completed, helper:** "Done. $54.00 transferred to your payout account."
     - **canceled:** one variant per `cancelReason`, each stating the money outcome.
   - **`ActionBar`:** renders `getBookingActions(booking, viewer, now)` with each action enabled or disabled, with its reason.
     - `message` and `view_address` work now.
     - Every other action opens a sheet saying it's built in prompt 10 or 11.
     - Each button carries `data-action="<id>"` for tests.
   - **Schedule:** the agreed time and **Add to calendar**, an `.ics` file from a route handler at `/app/bookings/[bookingId]/calendar.ics`. The file contains the area name only when the viewer can't see the address.
   - **Location:**
     - Poster: their own exact address.
     - Helper: `ExactAddressPanel` when allowed. Otherwise the right notice: before confirmation, "You'll see the exact address after the booking is confirmed"; after completion, the address-hidden sentence.
     - Remote: the meeting note.
   - **Terms:** scope text and `PriceBreakdown` for the viewer, plus "Version 2 · accepted Thu, Nov 19". An accordion lists earlier versions with a change summary.
   - **Evidence:** completion photos, hours, and receipts, when present.
   - **Money:**
     - Poster: charges, refunds, net.
     - Helper: earnings, with reimbursement on a separate row.
     - Helper reward chips (reward tone), linking to `/app/rewards`.
   - **Timeline** of `TimelineEvent`s.
   - **Conversation preview:** the last 2 messages and **Open conversation**.
   - **Help:** safety and contact support (both wired in prompt 10).
3. **Access.** Viewers who aren't allowed get 404 (Sam opening the desk booking). Signed-out visitors go to `/sign-in`.

## Tests
- E2E: for **every** `desk.*` scenario, as both Maya and Jordan, assert:
  - the badge label (design-system §5);
  - that the banner text includes the scenario's deadline;
  - that the exact set of `data-action` ids matches `getBookingActions`.
- **Address matrix:**
  - Jordan sees "1234 Example Lane" in `desk.confirmed`, `desk.in_progress`, `desk.completion_submitted`, `desk.disputed`, and `desk.completed`.
  - Jordan does **not** see it in `desk.pending_funding`, `desk.completed.address_hidden`, or any `desk.canceled.*`.
  - Sam gets 404 everywhere.
  - Public visitors are redirected to sign-in.
- The moving, remote computer help, and bookshelf scenarios render correctly. The `.ics` file downloads and contains no address for helpers who can't see it.
- axe on the list and the page at both viewports.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
The actions themselves (prompts 10 and 11) and the full conversation view (prompt 12).

## Review (for the human)
Step through the `desk.*` scenarios on `/dev/scenarios` as Maya and then as Jordan, at phone width. The banner and the buttons should always say what happens next.
