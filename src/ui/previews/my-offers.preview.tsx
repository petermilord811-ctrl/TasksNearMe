import { routes, type AppShellHandlers, type MyOffersPageData, type PreviewEntry } from '@/contracts';
import { fakeHandler, jordanShell, myOffersEmptyData, myOffersPageData } from '@/fixtures';
import { MyOffersScreen } from '@/ui/screens/work/my-offers-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/myOffers.json';

const now = '2026-11-17T15:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
function preview(variant: string, title: string, data: MyOffersPageData, initialTab: 'active' | 'booked' | 'closed' = 'active'): PreviewEntry {
  return { id: `screen-my-offers/${variant}`, title, group: copy.previews.group, layout: 'fullscreen', render: () => <AppShell viewer={jordanShell} handlers={shellHandlers} currentPath={routes.app.offers()}><MyOffersScreen data={data} now={now} initialTab={initialTab} /></AppShell> };
}

export const myOffersPreviews: PreviewEntry[] = [
  preview('default', copy.previews.default, myOffersPageData),
  preview('empty', copy.previews.empty, myOffersEmptyData),
  preview('booked', copy.previews.booked, { ...myOffersPageData, booked: [{ ...myOffersPageData.active[0], offer: { ...myOffersPageData.active[0].offer, status: 'accepted' } }] }, 'booked'),
  preview('closed', copy.previews.closed, { ...myOffersPageData, closed: ['declined', 'withdrawn', 'expired'].map((status, index) => ({ ...myOffersPageData.closed[0], offer: { ...myOffersPageData.closed[0].offer, id: `closed-${index}`, status: status as 'declined' | 'withdrawn' | 'expired' } })) }, 'closed'),
  preview('updated', copy.previews.updated, { ...myOffersPageData, active: [{ ...myOffersPageData.active[0], offer: { ...myOffersPageData.active[0].offer, revision: 2 } }, myOffersPageData.active[1]] }),
  preview('empty-booked', copy.previews.emptyBooked, myOffersEmptyData, 'booked'),
  preview('empty-closed', copy.previews.emptyClosed, myOffersEmptyData, 'closed'),
];
