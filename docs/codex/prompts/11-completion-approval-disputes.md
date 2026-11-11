# Prompt 11 — Completion, approval, disputes

**Plan first:** yes · **Depends on:** 10 · **Branch:** `ui/11-completion`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §3, §6, §7 (`desk.completion_submitted`, `desk.disputed*`, `desk.completed*`, `desk.expenses.*`, `moving.*`, `computer.remote.*`), §8
- `docs/codex/design-system.md` §4.2, §6 (the approval sentence and the helper-after-approval sentence)
- `docs/blueprint/02-sitemap-and-journeys.md` J6–J7 and §3 (variants)
- `docs/blueprint/03-state-machines.md` §4, §6.2
- `docs/blueprint/04-payments-and-fees.md` §5–§6

## Build
1. **Helper completion: `/app/bookings/[bookingId]/complete`.** Evidence rules depend on the category and pricing type:
   - **Physical in-home, fixed price:** at least 1 photo (`PhotoPicker`).
   - **Hourly:** hours worked, in 0.25 h steps, up to the cap. Entering more than the cap is blocked with **Request more hours**, which opens a change request of type `hours_cap`.
   - **Expenses** (when there's an allowance): each item has a description, amount, and receipt photo. The total must be within the allowance, or an error shows.
   - **Remote:** a summary note is required.
   - Optional note for any type; a "What Maya will see" preview; **Submit** → `completion_submitted`.
2. **Poster approval** (on the booking page in `completion_submitted`):
   - The evidence gallery, hours, and expenses.
   - **Approve task** with an alert-dialog: "Jordan will receive $54.00. This can't be undone." → `completed`.
   - **Report a problem** → `/problem`.
3. **`/app/bookings/[bookingId]/problem`.**
   - Fields: issue type (not finished, quality, damage, other), description, photos, and the outcome wanted (rework, partial refund, full refund).
   - Explain what happens next: support reviews within 1 business day, and Jordan can respond.
   - **Submit** → `disputed`, and a case is created.
4. **Disputed state** (booking page): case summary, timeline, and proposals.
   - **Helper:**
     - **Offer rework**: pick a time within 3 days.
     - **Offer settlement**: a new final price, with both outcomes shown live: "Maya gets $16.50 back · You'll earn $40.50".
   - **Poster:** **Accept** or **Decline** the settlement. Accepting → `desk.completed.settled`.
   - When the case is resolved, show the support resolution.
5. **Completed state.**
   - **Poster:**
     - "You paid $66.00", with a receipt link (built in prompt 14), a review prompt card, **Save Jordan**, and **Book again**.
     - **Report damage**, available for 14 days, opens a support case.
   - **Helper:**
     - The earnings row with the helper-after-approval sentence, and the reimbursement on its **own** row.
     - The welcome reward chip, pending or "Unlocking Sat, Nov 28".
     - A review prompt and **Offer to rebook** (built in prompt 13).
   - **Variants:**
     - Auto-approved: its own wording.
     - Settled: $49.50 paid, $16.50 refunded, $40.50 earned.
     - Hourly: $134.75 paid, $19.25 refunded, $110.25 earned.
     - Expenses: $8.00 reimbursed, $12.00 refunded.
6. **After 48 hours,** the helper sees the address-hidden sentence in place of the address.

## Tests
- E2E:
  - Desk: complete with a photo → approve → completed amounts.
  - Report a problem → disputed → $45 settlement → accept → settled amounts.
  - Hourly over-cap is blocked.
  - Expenses over the allowance show an error.
  - Remote completion with a note.
  - Auto-approved wording.
- axe on every page and sheet at both viewports.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
The review form and rebooking proposals (prompt 13), and receipts and earnings pages (prompt 14).

## Review (for the human)
Play the desk from `desk.in_progress` to approval, then again to a settled dispute. Check `moving.completion_submitted` and `desk.expenses.completion_submitted`.
