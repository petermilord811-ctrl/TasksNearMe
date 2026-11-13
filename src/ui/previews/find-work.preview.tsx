import { OFFER_BLOCKED_REASONS, routes, type AppShellHandlers, type FindWorkPageData, type PreviewEntry } from '@/contracts';
import { fakeFindWorkHandlers, fakeHandler, findWorkByPayData, findWorkEmptyData, findWorkMapViewData, findWorkNotBookableData, findWorkPageData, findWorkSavedData, jordanShell, priyaShell } from '@/fixtures';
import { FindWorkScreen } from '@/ui/screens/work/find-work-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/findWork.json';

const now = '2026-11-17T15:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
function preview(variant: string, title: string, data: FindWorkPageData): PreviewEntry {
  return { id: `screen-find-work/${variant}`, title, group: copy.previews.group, layout: 'fullscreen', render: () => <AppShell viewer={data.setup.bookable ? jordanShell : priyaShell} handlers={shellHandlers} currentPath={routes.app.findWork()}><FindWorkScreen data={data} now={now} handlers={fakeFindWorkHandlers} liveMap={false} /></AppShell> };
}

export const findWorkPreviews: PreviewEntry[] = [
  preview('default', copy.previews.default, findWorkPageData),
  preview('not-bookable', copy.previews.notBookable, findWorkNotBookableData),
  preview('empty', copy.previews.empty, findWorkEmptyData),
  preview('map', copy.previews.map, findWorkMapViewData),
  preview('saved', copy.previews.saved, findWorkSavedData),
  preview('by-pay', copy.previews.byPay, findWorkByPayData),
  preview('blocked-reasons', copy.previews.blockedReasons, {
    ...findWorkPageData,
    cards: OFFER_BLOCKED_REASONS.map((blockedReason, index) => ({ ...findWorkPageData.cards[index % findWorkPageData.cards.length], myOffer: undefined, task: { ...findWorkPageData.cards[index % findWorkPageData.cards.length].task, id: `blocked-${blockedReason}` }, blockedReason })),
    totalCount: OFFER_BLOCKED_REASONS.length,
  }),
];
