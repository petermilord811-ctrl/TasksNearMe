import { routes, type AppShellHandlers, type PlanHandlers, type PlanPageData, type PreviewEntry } from '@/contracts';
import { fakeHandler, jordanShell, mayaShell, planAiUsedUpData, planFreeClientData, planPastDueData, planPlusMemberData, planProCancelingData, planUnavailableData } from '@/fixtures';
import { PlanScreen } from '@/ui/screens/billing/plan-screen';
import { AppShell } from '@/ui/shells/app-shell';

/** The plan page (completion plan 9.13) in each state. */

const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};
const handlers: PlanHandlers = { onSubscribe: fakeHandler({ ok: true, code: 'updated' }), onManage: fakeHandler({ ok: true, code: 'updated' }) };

function preview(variant: string, title: string, data: PlanPageData, helper = false): PreviewEntry {
  return {
    id: `screen-plan/${variant}`, title, group: 'Plans', layout: 'fullscreen',
    render: () => <AppShell viewer={helper ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.plan()}>
      <PlanScreen data={data} handlers={handlers} />
    </AppShell>,
  };
}

export const planPreviews: PreviewEntry[] = [
  preview('free-client', 'Plans: a client without a plan, with an estimate', planFreeClientData),
  preview('plus-member', 'Plans: on Plus, just subscribed', planPlusMemberData),
  preview('pro-canceling', 'Plans: Pro, cancelled, at the month’s cap', planProCancelingData, true),
  preview('past-due', 'Plans: Pro, renewal payment failed', planPastDueData, true),
  preview('ai-used-up', 'Plans: AI searches used up, checkout left', planAiUsedUpData),
  preview('unavailable', 'Plans: not open here (no Stripe, no AI)', planUnavailableData),
];
