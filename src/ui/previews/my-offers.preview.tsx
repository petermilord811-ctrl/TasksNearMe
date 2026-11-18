import { routes, type AppShellHandlers, type MyOffersPageData, type PreviewEntry } from '@/contracts';
import { fakeHandler, fakeInviteHandlers, jordanShell, myOffersEmptyData, myOffersPageData, myOffersWithInviteData } from '@/fixtures';
import { MyOffersScreen } from '@/ui/screens/work/my-offers-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/myOffers.json';

const now = '2026-11-17T15:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
function preview(variant: string, title: string, data: MyOffersPageData, initialTab: 'active' | 'booked' | 'closed' = 'active'): PreviewEntry {
  return { id: `screen-my-offers/${variant}`, title, group: copy.previews.group, layout: 'fullscreen', render: () => <AppShell viewer={jordanShell} handlers={shellHandlers} currentPath={routes.app.offers()}><MyOffersScreen data={data} now={now} initialTab={initialTab} /></AppShell> };
}

export const myOffersPreviews: PreviewEntry[] = [
  {
    id: 'screen-my-offers/with-invite', title: copy.previews.withInvite, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={jordanShell} handlers={shellHandlers} currentPath={routes.app.offers(myOffersWithInviteData.openInviteId)}><MyOffersScreen data={{ ...myOffersWithInviteData, invites: myOffersWithInviteData.invites?.map((invite, index) => index === 0 ? invite : { ...invite, id: `${invite.id}-${invite.status}` }) }} now="2026-12-08T17:00:00.000Z" inviteHandlers={fakeInviteHandlers} /></AppShell>,
  },
  preview('default', copy.previews.default, myOffersPageData),
  preview('empty', copy.previews.empty, myOffersEmptyData),
  preview('booked', copy.previews.booked, { ...myOffersPageData, booked: [{ ...myOffersPageData.active[0], offer: { ...myOffersPageData.active[0].offer, status: 'accepted' } }] }, 'booked'),
  // The declined statuses, and one declined because its task was canceled ("Task canceled", sweep D9).
  preview('closed', copy.previews.closed, { ...myOffersPageData, closed: [...['declined', 'withdrawn', 'expired'].map((status, index) => ({ ...myOffersPageData.closed[0], offer: { ...myOffersPageData.closed[0].offer, id: `closed-${index}`, status: status as 'declined' | 'withdrawn' | 'expired' } })), { ...myOffersPageData.closed[0], offer: { ...myOffersPageData.closed[0].offer, id: 'closed-task-canceled', status: 'declined' as const, taskCanceled: true } }] }, 'closed'),
  preview('updated', copy.previews.updated, { ...myOffersPageData, active: [{ ...myOffersPageData.active[0], offer: { ...myOffersPageData.active[0].offer, revision: 2 } }, myOffersPageData.active[1]] }),
  preview('empty-booked', copy.previews.emptyBooked, myOffersEmptyData, 'booked'),
  preview('empty-closed', copy.previews.emptyClosed, myOffersEmptyData, 'closed'),
];
