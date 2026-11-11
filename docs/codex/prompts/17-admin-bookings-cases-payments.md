# Prompt 17 — Admin II: bookings, cases, refunds, payments

**Plan first:** yes · **Depends on:** 16, 11 · **Branch:** `ui/17-admin-money`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §3, §4 (`BookingView` with `viewerRole: 'staff'`, `LedgerJournal`, `CaseView`), §6 (staff actions), §7 (`case.dispute.desk`, `case.no_show_contested`, `admin.refund_over_limit`, `admin.reconciliation_exception`, `admin.aging_funds`), §8
- `docs/codex/design-system.md` §4.2 (`DataTable`, `ReasonGateDialog`, `PriceBreakdown` admin variant)
- `docs/blueprint/03-state-machines.md` §9 (support cases)
- `docs/blueprint/04-payments-and-fees.md` §6–§7 (refund mechanics, ledger)
- `docs/blueprint/08-data-model-and-access.md` §4 (staff limits)

## Build
1. **`/admin/bookings`:** search plus filters (status, date, category, disputed, aging funds) in a `DataTable`.
2. **`/admin/bookings/[bookingId]`.**
   - **Header:** status, links to both parties, and a staff `BookingStateBanner` (internal wording is fine).
   - **Timeline:** every event, including system and staff events.
   - **Terms:** all versions with diffs, plus the admin `PriceBreakdown` (includes platform revenue).
   - **Money:** payments, refunds, transfers (kind, status, fake provider IDs like `tr_…`), payouts, and chargebacks.
   - **Ledger:** a journals table (debit and credit per account) with a "balanced" indicator.
   - **Restricted data:** the address and the messages are behind `ReasonGateDialog`, and every reveal is audited.
   - **Actions**, by role (`permissions.ts`):
     - **Cancel with policy override:** preview plus a reason.
     - **Extend timer:** the approval window or the no-show window.
     - **Approve on behalf**, with a reason.
     - **Refund:** an amount input with a split preview (price, fee, allowance).
       - An agent above $100 creates a "Pending approval" request.
       - A lead approves up to $500.
       - Above $500, finance approves and a second finance approval is required.
     - **Hold / release transfer**, with a reason.
     - **Reverse transfer:** finance only. Requires a case link and notes "Only possible before the helper is paid out."
3. **`/admin/cases`.**
   - Queue `DataTable`: type, priority, status, assignee, SLA due (`Deadline`), age.
   - Filters: type, status, priority, assignee, "Mine".
4. **`/admin/cases/[caseId]`.**
   - **Summary** (type, parties, booking link) and **evidence** photos.
   - **Conversation**, two kinds that must look clearly different:
     - Participant-visible messages: to the poster, to the helper, or to both.
     - **Internal notes**, labeled "Internal".
   - **Status** controls.
   - **Resolution tool.** Options:
     - `no_action`
     - `release_full`
     - `settle(price)`, with live outcomes from `fees.ts`: poster refund, helper earnings, platform revenue
     - `refund_full`
     - `rework` (schedule it)
     - `goodwill_refund` (platform-funded; no clawback from the helper)
     - `account_action` and `reward_action` (links to those tools)

     Choosing one opens a confirmation dialog listing the money effects, then resolves the case. **Settle $45** on `case.dispute.desk` → `desk.completed.settled`.
   - **Appeal** handling and **Close**.
5. **`/admin/payments`** tabs:
   - Charges, Refunds, Transfers, Payouts.
   - **Chargebacks:** evidence-due `Deadline`, and a **Download evidence pack** placeholder that lists what's included (approval log, photos, messages, check-in).
   - **Reconciliation:** exceptions with expected vs actual amounts, resolved with a note.
   - **Aging funds:** bookings funded more than 21 days ago, with links.

## Tests
- E2E:
  - Resolve the desk dispute as settle $45 → correct amounts and scenario.
  - Alex refunds $150 → pending approval → Morgan approves.
  - A finance reversal requires a case link.
  - The reason gate appears before messages are shown.
  - Every payments tab renders; a reconciliation exception can be resolved.
- axe at both viewports.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
Rewards admin, config, audit, and staff (prompt 18).

## Review (for the human)
As Alex, open `case.dispute.desk` and settle at $45. Try `admin.refund_over_limit` as Alex, then as Morgan. As Casey, open `/admin/payments`.
