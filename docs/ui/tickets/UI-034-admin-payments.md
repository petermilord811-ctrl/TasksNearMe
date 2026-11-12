# UI-034 — Admin: payments and reconciliation

**Status:** done, built by Claude on `main` (Codex at its usage limit; decisions.md) · **Depends on:** UI-002 (admin shell), UI-019 (staff money)

The planned UI-034 ("payments, config, staff") is split: this ticket is the payments page. Staff roles (UI-037) and config (UI-038) follow.

## Goal
`/admin/payments` (blueprint 02 admin routes, 04 §4–§6, 10 §5): the money moving through the platform, for every staff member (finance acts in the provider's dashboard; transfer reversals come later).
- **Totals for the last 30 days:** charged, refunded, sent to helpers, paid out to banks.
- **Tabs with counts:** Needs a look (reconciliation exceptions), Charges, Refunds, Transfers, Payouts. Each tab is a link that keeps the search.
- **Search:** a booking id, or a person's name or email (a GET form).
- **Rows:** a table on wide screens and cards on phones. Each shows what it is (with the purpose, reason or kind), the booking (linked), the person (linked), the amount, the status, when, and the provider reference.
- **Exceptions:** each row carries a badge and one sentence on why it's listed:
  - `refund_failed`: a refund the provider failed;
  - `payout_failed`: a payout the bank refused;
  - `transfer_missing`: completed more than 2 days ago, earnings not sent;
  - `canceled_not_refunded`: canceled, charge kept, no refund and no compensation.

## Contracts and fixtures
- `src/contracts/admin-money.ts`: `ADMIN_MONEY_TABS`, `RECONCILIATION_EXCEPTIONS`, `AdminMoneyRow`, `AdminMoneyTotals`, `AdminPaymentsPageData`.
- `routes.admin.payments({ tab, q })`.
- `src/fixtures/admin-money.ts`: `adminPaymentsExceptionsData`, `adminPaymentsChargesData`, `adminPaymentsPayoutsData`, `adminPaymentsSearchData`, `adminPaymentsEmptyData`.

## States to preview
`screen-admin-payments/{exceptions,charges,payouts,search,empty}`

## Claude wiring notes
- Route: `/admin/payments` (`tab`, `q`), for any staff member.
- Query: `getAdminPayments` (`src/modules/support/staff-payments.ts`). The exceptions come from SQL: failed refunds and payouts; completed bookings with no earnings transferred after 2 days; canceled bookings with a kept charge and no refund or compensation.
- Tests: integration `staff-payments` (all four exceptions, tabs, search by email and booking id); UI `admin-payments-screen`; e2e `admin-ops.spec` (finance sees the totals and searches charges by email).
