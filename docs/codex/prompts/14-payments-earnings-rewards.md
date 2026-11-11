# Prompt 14 — Payments, earnings, rewards

**Plan first:** yes · **Depends on:** 11 · **Branch:** `ui/14-money-rewards`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §3, §4 (`PaymentView`, `RefundView`, `EarningsRow`, `RewardGrantView`), §6 (reward actions), §7 (`earnings.*`, `rewards.*`), §12
- `docs/codex/design-system.md` §4.2, §5 (payment, earnings, reward labels), §6 (the payout and rewards sentences)
- `docs/blueprint/04-payments-and-fees.md` §2 (the kinds of money are kept apart), §5 (payouts)
- `docs/blueprint/05-rewards.md` §1–§5
- `docs/blueprint/06-verification-trust-compliance.md` §1 (tax forms)

## Build
1. **`/app/payments`** (poster).
   - **Receipts list**, with filters: booking, date, charged, refunded, net, status chip.
   - **Receipt detail:**
     - Lines: task price, service fee, expense allowance or approved expenses, refunds with reasons, net.
     - Card brand and last 4 digits, a booking link, and **Book again**.
     - A print stylesheet.
   - **Payment methods:** saved cards (fixtures), **Add card** (`PaymentFormPlaceholder` in setup mode), **Remove** with confirmation, and **Make default**.
2. **`/app/earnings`** (helper).
   - **Summary** for this week and this month: earnings, **reimbursements (separate)**, and fees.
   - **Rows** per booking and kind, with status chips:
     - After completion
     - On hold (with the reason)
     - Sending
     - Transferred
     - Paid out (date, bank ••1234)
     - **Action needed**: the payout failed; link "Update your bank details" to the payout dashboard placeholder
     - Reversed
   - **Payouts list:** date, amount, status, arrival date.
   - **Manage payout details** links to the payout dashboard placeholder.
   - **Tax forms card:** "Tax forms are provided through our payment partner. Turn on e-delivery there to get them online." with a placeholder link.
   - The first-payout note in `earnings.jordan_first`.
   - **Rewards are never in these totals.** Link to them instead: "Gift card rewards are separate → Rewards".
3. **`/app/rewards`** (helper).
   - **Header:** "Rewards never depend on reviews or ratings."
   - **Program cards:**
     - Welcome: "63 of 100 founding spots claimed", the terms, and the eligibility window.
     - Repeat: how it works, with progress per client.
     - Acceptance and completion cards appear only when their flags are on.
   - **Grants**, grouped: Ready to redeem · Unlocking · Pending · Under review · Delivered · Not earned / Expired. Each shows the amount, program, qualifying booking link, unlock and expiry dates, and any void reason.
   - **Redeem flow:**
     - A sheet confirms the delivery email (pre-filled, editable) and notes "You'll choose a gift card brand on our partner's page".
     - Then `issuing`: a spinner, announced through `aria-live`.
     - Then `delivered`: **Open gift card** (placeholder) and "Also sent to your email".
     - `failed` shows "We're fixing this", with a demo **Try again** that reissues.
   - A tax note: "Gift cards may count as taxable income."

## Tests
- E2E:
  - Desk receipt shows $66.00 charged, and the refund variants.
  - Add and remove a card.
  - All `earnings.sam_history` statuses, including **Action needed**.
  - The first-payout note in `earnings.jordan_first`.
  - Redeem: `rewards.welcome_redeemable` → issuing → delivered; and `rewards.failed` → try again.
  - **Earnings totals exclude rewards, and the rewards page shows no earnings totals.**
- axe at both viewports.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
Real payment, payout, or gift-card integrations.

## Review (for the human)
As Maya, open `/app/payments`. As Jordan, open `/app/earnings` and `/app/rewards` in several `rewards.*` scenarios. As Sam, open `/app/earnings` with `earnings.sam_history`.
