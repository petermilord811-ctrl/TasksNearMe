import {
  ACTION_ERROR_CODES, EARNINGS_STATUSES, PAYOUT_ACCOUNT_STATUSES, PAYOUT_STATUSES, routes,
  type ActionResult, type AppShellHandlers, type EarningsPageData, type PaymentsPageData, type PaymentMethodHandlers, type PreviewEntry,
} from '@/contracts';
import {
  deskReceiptPageData, deskSimpleReceiptPageData, earningsEmptyData, earningsFirstPayoutData,
  fakeEarningsHandlers, fakeHandler, fakePaymentMethodHandlers, jordanEarningsActionNeededData,
  jordanEarningsPageData, jordanShell, mayaPaymentsPageData, mayaShell, paymentsEmptyData,
} from '@/fixtures';
import { EarningsScreen, ReceiptScreen } from '@/ui/screens/money';
import { PaymentsContent, PaymentsScreen } from '@/ui/screens/money/payments-screen';
import type { PaymentCardsPreviewState } from '@/ui/screens/money/payment-cards';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/paymentsPage.json';
import feedback from '../../../messages/en/ui/feedback.json';
import earningsCopy from '../../../messages/en/ui/earnings.json';

const now = '2026-11-30T18:00:00.000Z';
const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};
const group = copy.previews.group;

function paymentsPreview(id: string, title: string, data: PaymentsPageData, cardsPreview?: PaymentCardsPreviewState, handlers: PaymentMethodHandlers = fakePaymentMethodHandlers): PreviewEntry {
  return { id: `screen-payments/${id}`, title, group, layout: 'fullscreen', render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.payments()}>
    {cardsPreview ? <PaymentsContent data={data} handlers={handlers} now={now} cardsPreview={cardsPreview} /> : <PaymentsScreen data={data} handlers={handlers} now={now} />}
  </AppShell> };
}

function earningsPreview(id: string, title: string, data: EarningsPageData): PreviewEntry {
  return { id: `screen-earnings/${id}`, title, group, layout: 'fullscreen', render: () => <AppShell viewer={jordanShell} handlers={shellHandlers} currentPath={routes.app.earnings()}>
    <EarningsScreen data={data} handlers={fakeEarningsHandlers} now={now} />
  </AppShell> };
}

const denied: ActionResult = { ok: false, code: 'not_allowed' };
const declined: ActionResult = { ok: false, code: 'payment_declined' };
const paidRow = jordanEarningsPageData.rows.find((row) => row.payout?.status === 'paid')!;

export const moneyPagePreviews: PreviewEntry[] = [
  paymentsPreview('default', copy.previews.default, mayaPaymentsPageData),
  paymentsPreview('empty', copy.previews.empty, paymentsEmptyData),
  paymentsPreview('adding-card', copy.previews['adding-card'], mayaPaymentsPageData, { adding: true }),
  paymentsPreview('card-declined', copy.previews['card-declined'], mayaPaymentsPageData, { addResult: declined }, { ...fakePaymentMethodHandlers, onAddCard: fakeHandler(declined) }),
  paymentsPreview('remove-confirm', copy.previews['remove-confirm'], mayaPaymentsPageData, { removeMethodId: mayaPaymentsPageData.methods[1].id }),
  paymentsPreview('remove-not-allowed', copy.previews['remove-not-allowed'], mayaPaymentsPageData, { removeMethodId: mayaPaymentsPageData.methods[0].id, removeResult: denied }, { ...fakePaymentMethodHandlers, onRemoveCard: fakeHandler(denied) }),
  paymentsPreview('saved', copy.previews.saved, mayaPaymentsPageData, { addResult: { ok: true, code: 'saved' } }, { ...fakePaymentMethodHandlers, onAddCard: fakeHandler({ ok: true, code: 'saved' }) }),
  ...ACTION_ERROR_CODES.filter((code) => code !== 'payment_declined').map((code) => {
    const result: ActionResult = { ok: false, code, ...(code === 'rate_limited' ? { retryAt: '2026-11-30T18:05:00.000Z' } : {}), ...(code === 'validation_failed' ? { fieldErrors: { card: ['required' as const] } } : {}) };
    return paymentsPreview(`result-${code.replaceAll('_', '-')}`, feedback.error[code], mayaPaymentsPageData, { addResult: result }, { ...fakePaymentMethodHandlers, onAddCard: fakeHandler(result) });
  }),
  ...[
    { id: 'allowance-refund', title: copy.previews['receipt-allowance-refund'], data: deskReceiptPageData },
    { id: 'simple', title: copy.previews['receipt-simple'], data: deskSimpleReceiptPageData },
  ].map(({ id, title, data }): PreviewEntry => ({ id: `screen-receipt/${id}`, title, group, layout: 'fullscreen', render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.receipt(data.booking.id)} layout="flow"><ReceiptScreen data={data} /></AppShell> })),
  earningsPreview('default', copy.previews['earnings-default'], jordanEarningsPageData),
  earningsPreview('action-needed', copy.previews['earnings-action-needed'], jordanEarningsActionNeededData),
  earningsPreview('first-payout', copy.previews['earnings-first-payout'], earningsFirstPayoutData),
  earningsPreview('empty', copy.previews['earnings-empty'], earningsEmptyData),
  earningsPreview('all-transfer-statuses', copy.previews['earnings-statuses'], {
    ...jordanEarningsPageData,
    rows: EARNINGS_STATUSES.map((status) => ({ ...paidRow, id: `preview-${status}`, status, payout: undefined, transferredAt: undefined, holdReason: status === 'on_hold' ? 'payout_account' : undefined })),
  }),
  earningsPreview('all-payout-statuses', copy.previews['payout-statuses'], {
    ...jordanEarningsPageData,
    rows: PAYOUT_STATUSES.map((status) => ({ ...paidRow, id: `preview-${status}`, payout: { ...paidRow.payout!, status } })),
  }),
  ...PAYOUT_ACCOUNT_STATUSES.filter((status) => status !== 'active' && status !== 'requirements_due').map((status) => earningsPreview(`account-${status.replaceAll('_', '-')}`, earningsCopy.account.statuses[status], {
    ...earningsEmptyData, payoutAccount: { status, actionNeeded: false },
  })),
];
