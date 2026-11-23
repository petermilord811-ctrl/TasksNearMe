import { routes, type AppShellHandlers, type PlanHandlers, type PlanPageData, type PreviewEntry } from '@/contracts';
import { fakeHandler, jordanShell, mayaShell, planAiMonthUsedUpData, planAiUsedUpData, planFreeClientData, planPastDueData, planPlusMemberData, planProCancelingData, planProMemberData, planUnavailableData } from '@/fixtures';
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
  preview('free-client', 'Plans: Starter (no plan)', planFreeClientData),
  preview('plus-member', 'Plans: on Plus, just subscribed (Pro upgrades)', planPlusMemberData),
  preview('pro-member', 'Plans: on Pro (Plus included, unlimited AI search)', planProMemberData, true),
  preview('pro-canceling', 'Plans: Pro, cancelled (ends with its period)', planProCancelingData, true),
  preview('past-due', 'Plans: Pro, renewal payment failed', planPastDueData, true),
  preview('ai-used-up', 'Plans: today’s AI searches used up, checkout left', planAiUsedUpData),
  preview('ai-month-used-up', 'Plans: this month’s AI searches used up', planAiMonthUsedUpData),
  preview('unavailable', 'Plans: not open here (no Stripe, no AI)', planUnavailableData),
];
