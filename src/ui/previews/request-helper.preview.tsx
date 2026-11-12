import type { ComponentProps } from 'react';
import { ACTION_ERROR_CODES, routes, type ActionResult, type AppShellHandlers, type PaymentAttemptResult, type PreviewEntry, type RequestHelperHandlers, type RequestHelperPageData } from '@/contracts';
import { fakeHandler, fakeRequestHelperHandlers, jordanYardSlot, mayaShell, movingConfirmHourlyData, myOffersPageData, requestJordanData, requestJordanSlotData, requestJordanSlotTakenData, requestNoTasksData } from '@/fixtures';
import { RequestHelperContent } from '@/ui/screens/invites/request-helper-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/invites.json';

const now = '2026-12-08T16:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const verification: PaymentAttemptResult = { ok: false, code: 'requires_bank_verification', verification: { paymentId: 'pay_invite', kind: 'dev' } };
// The existing yard breakdown has the same canonical total as this slot's cap.
const slotHandlers: RequestHelperHandlers = {
  ...fakeRequestHelperHandlers,
  onQuote: async () => ({
    ...myOffersPageData.closed[0].offer.breakdown,
    pricingType: 'hourly',
    hourly: jordanYardSlot.pricing.type === 'hourly' ? { rateCents: jordanYardSlot.pricing.rateCents, hours: jordanYardSlot.pricing.hoursCap, basis: 'cap' } : undefined,
  }),
  onRequest: fakeHandler({ ok: true, code: 'sent', redirectTo: routes.app.task(requestJordanSlotData.tasks[0].id) }),
};
type Options = Pick<ComponentProps<typeof RequestHelperContent>, 'initialResult' | 'initialPending'> & { handlers?: RequestHelperHandlers };

function preview(variant: string, title: string, data = requestJordanData, options: Options = {}): PreviewEntry {
  return { id: `screen-request-helper/${variant}`, title, group: copy.previews.group, layout: 'fullscreen', render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.requestHelper(data.helper.handle, data.slot ? { slotId: data.slot.id } : undefined)} layout="flow">
    <RequestHelperContent data={data} now={now} handlers={fakeRequestHelperHandlers} {...options} />
  </AppShell> };
}

const hourly: RequestHelperPageData = {
  ...requestJordanData,
  tasks: [{ id: movingConfirmHourlyData.task.id, title: movingConfirmHourlyData.task.title, categorySlug: movingConfirmHourlyData.task.categorySlug, windowStart: movingConfirmHourlyData.offer.proposedStart, windowEnd: movingConfirmHourlyData.offer.proposedStart }],
  suggestion: { taskId: movingConfirmHourlyData.task.id, pricing: movingConfirmHourlyData.offer.pricing },
  listedPricing: { 'moving-help': movingConfirmHourlyData.offer.pricing },
};

export const requestHelperPreviews: PreviewEntry[] = [
  preview('default', copy.previews.default),
  preview('slot', copy.previews.slot, requestJordanSlotData, { handlers: slotHandlers }),
  preview('slot-taken', copy.previews['slot-taken'], requestJordanSlotTakenData),
  preview('slot-not-allowed', copy.previews['slot-not-allowed'], requestJordanSlotData, { initialResult: { ok: false, code: 'not_allowed' }, handlers: { ...slotHandlers, onRequest: fakeHandler({ ok: false, code: 'not_allowed' }) } }),
  preview('no-tasks', copy.previews['no-tasks'], requestNoTasksData),
  preview('quote-pending', copy.previews['quote-pending'], requestJordanData, { handlers: { ...fakeRequestHelperHandlers, onQuote: () => new Promise(() => {}) } }),
  preview('quote-error', copy.previews['quote-error'], requestJordanData, { handlers: { ...fakeRequestHelperHandlers, onQuote: async () => { throw new Error('quote unavailable'); } } }),
  preview('bank-verification', copy.previews['bank-verification'], requestJordanData, { initialResult: verification, handlers: { ...fakeRequestHelperHandlers, onRequest: async () => { await fakeHandler()(undefined); return verification; }, onFinishVerification: (input) => input.outcome === 'approved' ? fakeRequestHelperHandlers.onFinishVerification(input) : fakeHandler({ ok: false, code: 'payment_declined' })(undefined) } }),
  preview('payment-declined', copy.previews['payment-declined'], requestJordanData, { initialResult: { ok: false, code: 'payment_declined' }, handlers: { ...fakeRequestHelperHandlers, onRequest: fakeHandler({ ok: false, code: 'payment_declined' }) } }),
  preview('hourly', copy.previews.hourly, hourly, { handlers: { ...fakeRequestHelperHandlers, onQuote: async () => movingConfirmHourlyData.breakdown } }),
  preview('submitting', copy.previews.submitting, requestJordanData, { initialPending: true }),
  preview('sent', copy.previews.sent, requestJordanData, { initialResult: { ok: true, code: 'sent' } }),
  ...ACTION_ERROR_CODES.filter((code) => code !== 'payment_declined').map((code) => {
    const result: ActionResult = { ok: false, code, ...(code === 'validation_failed' ? { fieldErrors: { acceptTerms: ['must_accept' as const] } } : {}), ...(code === 'rate_limited' ? { retryAt: now } : {}) };
    return preview(`result-${code.replaceAll('_', '-')}`, copy.previews.errors[code], requestJordanData, { initialResult: result, handlers: { ...fakeRequestHelperHandlers, onRequest: fakeHandler(result) } });
  }),
];
