import type { ComponentProps } from 'react';
import { ACTION_ERROR_CODES, routes, type AppShellHandlers, type HelperTaskView, type HelperWorkHandlers, type PreviewEntry } from '@/contracts';
import { fakeHandler, fakeHelperWorkHandlers, helperComputerBlocked, helperDeskStaleOffer, helperDeskWithOffer, helperMovingHourly, helperYardNoOffer, jordanShell, priyaShell } from '@/fixtures';
import { HelperTaskScreen } from '@/ui/screens/work/helper-task-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/helperTask.json';

const now = '2026-11-17T15:00:00.000Z';
const handlers: HelperWorkHandlers = {
  ...fakeHelperWorkHandlers,
  onSubmitOffer: fakeHandler({ ok: true, code: 'sent' }),
  onReviseOffer: fakeHandler({ ok: true, code: 'updated' }),
  onOfferAction: fakeHandler({ ok: true, code: 'updated' }),
};
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };

function preview(variant: Exclude<keyof typeof copy.previews, 'group'>, data: HelperTaskView, options: Partial<ComponentProps<typeof HelperTaskScreen>> = {}, shellLayout: 'flow' | 'tabs' = 'flow'): PreviewEntry {
  return {
    id: `screen-helper-task/${variant}${shellLayout === 'tabs' ? '-with-tabs' : ''}`, group: copy.previews.group, title: copy.previews[variant], layout: 'fullscreen',
    render: () => <AppShell viewer={data.setup.bookable ? jordanShell : priyaShell} handlers={shellHandlers} currentPath={routes.app.findWorkTask(data.task.id)} layout={shellLayout}><HelperTaskScreen data={data} handlers={handlers} now={now} {...options} /></AppShell>,
  };
}

export const helperTaskPreviews: PreviewEntry[] = [
  preview('with-offer', helperDeskWithOffer),
  preview('with-offer', helperDeskWithOffer, {}, 'tabs'),
  preview('with-message-action', {
    ...helperDeskWithOffer,
    myOffer: {
      ...helperDeskWithOffer.myOffer!,
      actions: [...helperDeskWithOffer.myOffer!.actions, { id: 'message_poster', kind: 'secondary', enabled: true }],
    },
  }, { handlers: { ...handlers, onOfferAction: fakeHandler({ ok: true, code: 'updated', redirectTo: routes.app.thread('thr_off_jordan') }) } }),
  preview('offer-form', helperYardNoOffer),
  preview('offer-form', helperYardNoOffer, {}, 'tabs'),
  preview('hourly-form', helperMovingHourly),
  preview('blocked', helperComputerBlocked),
  preview('stale-offer', helperDeskStaleOffer),
  preview('revising', helperDeskWithOffer, { initialRevising: true }),
  preview('not-bookable', { ...helperYardNoOffer, blockedReason: 'not_bookable', setup: { bookable: false, bookableCategories: [], nextOnboardingStep: 'identity' } }),
  preview('validation-error', helperMovingHourly, { initialResult: { ok: false, code: 'validation_failed', fieldErrors: { 'pricing.hoursCap': ['out_of_range'] } }, handlers: { ...handlers, onSubmitOffer: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { 'pricing.hoursCap': ['out_of_range'] } }) } }),
  ...ACTION_ERROR_CODES.filter((code) => code !== 'validation_failed').map((code) => preview(code.replaceAll('_', '-') as Exclude<keyof typeof copy.previews, 'group'>, helperYardNoOffer, { initialResult: { ok: false, code }, handlers: { ...handlers, onSubmitOffer: fakeHandler({ ok: false, code }) } })),
  preview('quote-error', helperYardNoOffer, { handlers: { ...handlers, onQuote: async () => { throw new Error('Preview earnings unavailable'); } } }),
  preview('quote-loading', helperYardNoOffer, { handlers: { ...handlers, onQuote: () => new Promise(() => {}) } }),
];
