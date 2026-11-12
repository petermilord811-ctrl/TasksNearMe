import { ACTION_ERROR_CODES, routes, type ActionResult, type AppShellHandlers, type PreviewEntry, type ProposeRebookHandlers, type ProposeRebookPageData } from '@/contracts';
import { deskBreakdown, fakeHandler, fakeProposeRebookHandlers, jordanShell, movingConfirmHourlyData, movingProposalSentHelper, proposeDeskRebookData } from '@/fixtures';
import { ProposeRebookContent, type ProposeRebookPreviewState } from '@/ui/screens/clients/propose-rebook-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/clients.json';

const now = '2026-12-08T17:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const handlers: ProposeRebookHandlers = { ...fakeProposeRebookHandlers, onPropose: fakeHandler({ ok: true, code: 'sent', redirectTo: routes.app.clients() }) };
const values = { date: '2026-12-19', startTime: '10:00' };
type Options = ProposeRebookPreviewState & { handlers?: ProposeRebookHandlers };

function preview(variant: string, title: string, data: ProposeRebookPageData = proposeDeskRebookData, options: Options = {}): PreviewEntry {
  return { id: `screen-propose-rebook/${variant}`, title, group: copy.formPreviews.group, layout: 'fullscreen', render: () => <AppShell viewer={jordanShell} handlers={shellHandlers} currentPath={routes.app.bookingRebook(data.booking.id)} layout="flow">
    <ProposeRebookContent data={data} handlers={handlers} now={now} initialBreakdown={deskBreakdown} {...options} />
  </AppShell> };
}

const hourly: ProposeRebookPageData = {
  ...proposeDeskRebookData,
  client: movingProposalSentHelper.client,
  booking: { ...proposeDeskRebookData.booking, id: 'bkg_moving', ...movingProposalSentHelper.task, lastPricing: movingProposalSentHelper.pricing, lastStart: movingConfirmHourlyData.offer.proposedStart },
};
const errors: ActionResult = { ok: false, code: 'validation_failed', fieldErrors: { date: ['out_of_range'], startTime: ['out_of_range'], 'pricing.priceCents': ['out_of_range'] } };

export const proposeRebookPreviews: PreviewEntry[] = [
  preview('default', copy.formPreviews.default),
  preview('hourly', copy.formPreviews.hourly, hourly, { initialBreakdown: movingProposalSentHelper.breakdown, handlers: { ...handlers, onQuote: async () => movingProposalSentHelper.breakdown } }),
  preview('submitting', copy.formPreviews.submitting, proposeDeskRebookData, { initialValues: values, initialPending: true, handlers: { ...handlers, onPropose: () => new Promise(() => {}) } }),
  preview('errors', copy.formPreviews.errors, proposeDeskRebookData, { initialValues: values, initialResult: errors, handlers: { ...handlers, onPropose: fakeHandler(errors) } }),
  preview('quote-error', copy.formPreviews.quoteError, proposeDeskRebookData, { initialBreakdown: undefined, initialQuoteFailed: true, handlers: { ...handlers, onQuote: async () => { throw new Error('quote unavailable'); } } }),
  preview('sent', copy.formPreviews.sent, proposeDeskRebookData, { initialValues: values, initialResult: { ok: true, code: 'sent' } }),
  ...ACTION_ERROR_CODES.filter((code) => code !== 'validation_failed').map((code) => {
    const result: ActionResult = { ok: false, code, ...(code === 'rate_limited' ? { retryAt: now } : {}) };
    return preview(`result-${code.replaceAll('_', '-')}`, copy.formPreviews.errorsByCode[code], proposeDeskRebookData, { initialValues: values, initialResult: result, handlers: { ...handlers, onPropose: fakeHandler(result) } });
  }),
];
