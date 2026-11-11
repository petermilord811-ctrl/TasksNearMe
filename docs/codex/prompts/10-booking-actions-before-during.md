# Prompt 10 — Booking actions before and during the task

**Plan first:** yes · **Depends on:** 09 · **Branch:** `ui/10-booking-actions`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §3 (change and cancellation numbers), §6, §7, §8
- `docs/codex/design-system.md` §4.2 (`PolicyPreview`, alert-dialog), §6 (the late-cancellation sentence)
- `docs/blueprint/02-sitemap-and-journeys.md` J5
- `docs/blueprint/03-state-machines.md` §4–§5
- `docs/blueprint/04-payments-and-fees.md` §6

## Build (wire the actions that prompt 09 rendered)
1. **Status updates (helper).** **On my way**; **Running late** (a sheet with 10 / 20 / 30 minutes); **Arrived** (with confirmation). Each posts a status message to the thread and updates the banner. The poster sees the update as a chip.
2. **Change requests.**
   - **Propose** (sheet):
     - Pick the type: price, scope, schedule, hours cap (hourly only), or expense allowance. Each type has its own fields.
     - Live before/after `PriceBreakdown` for the viewer, plus the other side's impact ("Maya will pay $22.00 more" · "You'll earn $72.00"), and a note field.
     - **Send** puts the change in `proposed`.
   - **Review** at **`/app/bookings/[bookingId]/changes/[changeId]`**:
     - Old vs new terms with the changed fields highlighted, both sides' amounts, and the expiry `Deadline`.
     - The counterparty can **Accept** or **Decline**; the proposer can **Withdraw**.
   - **Increase:** after acceptance the poster sees "Pay $22.00 to apply this change" (`PaymentFormPlaceholder`, charge mode) → applied, and terms v2 shows a total of $88.00 and earnings of $72.00.
   - **Decrease:** "We'll refund $X when you accept."
   - **Declined, withdrawn, or expired:** "Your booking keeps the previous terms."
3. **Cancel.**
   - The `PolicyPreview` sheet computes the outcome with `fees.ts` and the policy timers:
     - Free until 24 h before the start.
     - Inside 24 h, the late fee goes entirely to the helper.
     - A helper canceling inside 24 h is warned: "Canceling within 24 hours adds a reliability strike."
   - Optional reason, then an alert-dialog to confirm. The result is the matching `desk.canceled.*` scenario with an outcome card listing the refund and fee lines.
   - When the helper canceled, the poster gets **Find a replacement**. It reopens the task with the toast "Your task is open again. We've notified helpers who offered before."
4. **Helper no-show (poster).**
   - **Report a no-show** is disabled with "Available at 11:00 am" until 30 minutes after the start, then enabled.
   - The confirmation sheet shows the refund, then the booking moves to `desk.canceled.helper_no_show`.
   - In that state the helper sees **Contest this report**, which opens a pre-filled support case.
5. **Can't access (helper).**
   - Available 20 minutes after arrival. The sheet asks what happened (no answer, wrong address, gate code problem) and takes an optional photo.
   - The booking moves to `desk.cant_access`. The poster sees a banner with a 30-minute `Deadline` and two choices:
     - **I'm here** → `desk.in_progress`.
     - **Call it off** → `desk.canceled.poster_no_show`, where Jordan receives $12.00.
   - If the time runs out (toolbar "time passes"), the booking moves to the same no-show outcome.
6. **Safety (both).** The **Safety** button opens a sheet whose **first** line is "If you're in immediate danger, call 911" (a `tel:` link). Below it, a "Report a safety concern" form creates an urgent case and shows a toast with the case link.

## Tests
- E2E, with exact amounts:
  - Chair change +$20 → pay $22.00 → terms v2 total $88.00, earnings $72.00.
  - Schedule change: accept, and separately decline.
  - Cancel early: refund $66.00.
  - Cancel late: Jordan gets $12.00; refund $54.00.
  - Helper cancel shows the strike warning.
  - No-show is disabled before 11:00 am and enabled after.
  - Can't access → **I'm here**.
  - The safety sheet shows the 911 line first.
- axe on every sheet and page.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
Completion, approval, and disputes (prompt 11).

## Review (for the human)
As Maya and as Jordan, run each flow from `desk.confirmed`, `desk.confirmed.day_of`, `desk.no_show_window`, and `desk.cant_access`.
