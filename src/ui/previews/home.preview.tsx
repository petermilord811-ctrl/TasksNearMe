import { routes, type AppHomePageData, type AppShellHandlers, type ISODateTime, type PreviewEntry, type SignedInViewer } from '@/contracts';
import { DESK_TIMES, deskBookingPosterCantAccessReported, deskBookingPosterPendingFunding, fakeHandler, jordanHomeData, jordanHomePayoutActionData, jordanShell, mayaHomeData, mayaShell, posterHomeEmptyData, priyaHomeData, priyaShell, ruth } from '@/fixtures';
import { HomeScreen } from '@/ui/screens/home';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/home.json';

const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};
const morning = '2026-11-21T16:05:00.000Z';
const clientMorning = '2026-11-24T15:00:00.000Z';
const ruthShell: SignedInViewer = { ...mayaShell, id: ruth.id, displayName: ruth.displayName, initials: ruth.initials, unreadMessages: 0, unreadNotifications: 0 };

function preview(variant: string, title: string, data: AppHomePageData, viewer: SignedInViewer, now: ISODateTime = morning): PreviewEntry {
  return {
    id: `screen-home/${variant}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={routes.app.home()}><HomeScreen data={data} now={now} /></AppShell>,
  };
}

export const homePreviews: PreviewEntry[] = [
  preview('client', copy.previews.client, mayaHomeData, mayaShell, clientMorning),
  preview('client-empty', copy.previews.clientEmpty, posterHomeEmptyData, ruthShell, clientMorning),
  preview('helper', copy.previews.helper, jordanHomeData, jordanShell),
  preview('helper-payout-action', copy.previews.helperPayoutAction, jordanHomePayoutActionData, jordanShell),
  preview('helper-not-set-up', copy.previews.helperNotSetUp, priyaHomeData, priyaShell),
  preview('client-payment-access', copy.previews.clientPaymentAccess, {
    ...mayaHomeData,
    attention: [
      { id: 'payment', kind: 'finish_payment', title: deskBookingPosterPendingFunding.task.title, dueAt: deskBookingPosterPendingFunding.deadlines.pendingFundingExpiresAt, target: { kind: 'booking', bookingId: deskBookingPosterPendingFunding.id } },
      { id: 'access', kind: 'answer_cant_access', title: deskBookingPosterCantAccessReported.task.title, dueAt: deskBookingPosterCantAccessReported.deadlines.posterResponseDueAt, target: { kind: 'booking', bookingId: deskBookingPosterCantAccessReported.id } },
    ],
  }, mayaShell),
  preview('helper-empty', copy.previews.helperEmpty, { ...jordanHomeData, attention: [], upcoming: [], activeOffers: [], suggestions: [] }, jordanShell, DESK_TIMES.approved),
];
