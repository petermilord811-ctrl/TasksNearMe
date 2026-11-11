# Prompt 21 (optional, phase 2) — Recurring visits behind the `recurring` flag

**Plan first:** yes · **Depends on:** 11 (and 14 for the rewards part) · **Branch:** `ui/21-recurring`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §12 (`recurring`, off by default)
- `docs/blueprint/03-state-machines.md` §7 (recurring rules)
- `docs/blueprint/04-payments-and-fees.md` §4 (each visit is charged 48 h before)
- `docs/blueprint/05-rewards.md` §2 (repeat reward, version B)

## Add to the mocks (extend ui-contract §7 and note it in your summary)

The series is light cleaning every 2 weeks, Maya ↔ Sam, $110 per visit. Each visit: fee $11.00, total **$121.00**; Sam earns **$99.00**.

Scenarios:
- `series.offer`: Maya is setting it up.
- `series.active`: the next 4 visits are scheduled.
- `series.visit_funded`: the next visit was charged 48 h before.
- `series.visit_payment_failed`: retries at 36 h and 24 h; the visit is skipped at 12 h.
- `series.paused`: resumes on a date.
- `series.canceled`.

## Build (everything hidden when `recurring` is off)
1. **Make this recurring** on completed cleaning and yard bookings.
   - Setup sheet: how often (weekly, every 2 weeks, monthly), weekday, time window, per-visit price, payment method.
   - Summary: "We'll charge $121.00 two days before each visit. You can skip, pause, or cancel anytime before then."
   - Sending creates a series invitation for the helper.
2. **`/app/series/[seriesId]`.**
   - **Upcoming visits:** scheduled, funded, skipped, or payment failed. Each funded visit links to its own booking page.
   - **Poster actions:**
     - **Skip a visit:** free until 24 h before; inside that, the late fee (shown with `PolicyPreview`).
     - **Reschedule a visit:** a change request.
     - **Pause:** pick a resume date.
     - **Change price:** a series-level change request.
     - **Cancel series:** with a preview.
   - **Helper actions:**
     - Accept or decline the series invitation.
     - **Can't make a visit:** free 48 h or more ahead; inside 24 h it counts as a cancellation.
   - **Failed payment:** "Update your card" plus the retry schedule; skipped automatically at 12 h.
   - With `reward.repeat` also on: progress toward the recurring-month reward.

## Tests
- E2E with the flag on, for every scenario above.
- With the flag off, there is no trace of recurring anywhere.
- axe at both viewports.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md` (phase-2 section).

## Review (for the human)
Turn on `recurring` in the dev toolbar and open each `series.*` scenario as Maya and as Sam.
