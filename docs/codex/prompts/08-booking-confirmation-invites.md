# Prompt 08 — Booking confirmation, payment placeholder, direct invites

**Plan first:** yes · **Depends on:** 05, 07 · **Branch:** `ui/08-confirm-pay`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §3, §4 (`PriceBreakdown`, `PaymentView`, `InviteView`), §6 (`pay`), §7 (`desk.pending_funding`, `desk.payment_*`, `invite.*`, `bookshelf.*`), §8, §13
- `docs/codex/design-system.md` §4.2 (`PaymentFormPlaceholder`), §6 (key sentences)
- `docs/blueprint/02-sitemap-and-journeys.md` J3, J4
- `docs/blueprint/04-payments-and-fees.md` §4 (when the poster is charged), §6 (cancellation)

## Build
1. **`/app/tasks/[taskId]/offers/[offerId]/confirm`** (`DetailPageShell`).
   - **Summary:** task title and key details, agreed start, helper card.
   - **Price:** the poster variant of `PriceBreakdown`.
     - Hourly bookings explain: "You'll only pay for approved hours. Anything unused is refunded."
     - The expense-allowance line says "Refunded if unused".
   - **Policies:** the cancellation summary (free until 24 h before; after that max($10, 20%), all of it to the helper), plus the address notice and a terms checkbox linking to the policy.
   - **`PaymentFormPlaceholder`** in `charge` mode. The sticky button reads **Pay $66.00**.
   - **Outcomes:**
     - Success: toast "Booked! Jordan can now see your address.", then redirect to the booking page.
     - Declined: inline error, with retry or change method (`desk.payment_declined`).
     - Insufficient funds.
     - 3-D Secure: a dialog to approve or fail.
     - While funding is pending, show the 30-minute hold `Deadline`.
   - If the offer is no longer available, explain why and offer a way back.
   - **Double submission is impossible:** the button disables, and the mock action receives an idempotency key and runs only once.
2. **`/app/helpers/[handle]/request`** (direct invite).
   - **Entry variants:**
     - No query: started from a profile.
     - `?from=booking:<id>` (**Book again**): pre-fills the category, address, and last price (as a suggestion).
     - `?slot=<availabilityId>`: pre-fills the slot and holds it.
   - **Fields, all on one page:** service (from the helper's services); an existing open task or quick task details (title, short description, minimal category fields, saved address); time (date and window, or the slot); price (helper's rate pre-filled; hourly cap); and a message.
   - **Summary:** the poster variant of `PriceBreakdown` plus the **invite hold sentence** (design-system §6).
   - **`PaymentFormPlaceholder`** in `authorize` mode leads to "Request sent" (`invite.sent`).
3. **Invite status, poster side.** Show it on `/app/tasks/[taskId]` (invites section) and as attention items on `/app`.
   - **Sent:** expiry `Deadline` and **Cancel request**.
   - **Countered:** **Accept counter** (re-authorizes the new total, $55.00) or **Decline**.
   - **Declined, expired, canceled:** "The hold on your card has been released."
   - **Accepted:** a link to the booking.

## Tests
- E2E as Maya:
  - Book the desk with success; declined → success; 3-D Secure approve; 3-D Secure fail.
  - Double-clicking **Pay** runs the action once.
  - **Book again** from `desk.completed` → pre-filled request → authorize → `invite.sent`.
  - Accepting the counter → `bookshelf.confirmed_at_50`.
- axe on every screen at both viewports.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
The booking page itself (prompt 09). After success, the redirect target can show whatever state prompt 09 hasn't built yet.

## Review (for the human)
As Maya: `desk.open.offers` → **Book Jordan** → try each demo payment outcome. Then **Book again** from `desk.completed`.
