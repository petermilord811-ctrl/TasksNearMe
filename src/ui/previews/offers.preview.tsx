import { ACTION_ERROR_CODES, routes, type AppShellHandlers, type OfferDetailPageData, type OfferView, type PreviewEntry } from '@/contracts';
import { deskOfferDetailData, deskOfferJordan, deskOfferLee, deskOfferSam, deskOfferSamStale, deskOwnerView, fakeHandler, mayaShell } from '@/fixtures';
import { OfferCard } from '@/ui/components/offers/offer-card';
import { OfferComparison } from '@/ui/components/offers/offer-comparison';
import { OfferDetailScreen } from '@/ui/screens/tasks/offer-detail-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/offers.json';
import feedback from '../../../messages/en/ui/feedback.json';
import { SelectableOfferPreview } from './offers-examples';

const now = '2026-11-17T15:00:00.000Z';
const onAction = fakeHandler<{ offerId: string; action: string }>({ ok: true, code: 'updated' });
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };

function card(variant: 'new' | 'stale' | 'declined' | 'accepted' | 'withdrawn' | 'expired', offer: OfferView): PreviewEntry {
  return { id: `offer-card/${variant}`, title: copy.previews[variant], group: copy.previews.group, render: () => <OfferCard offer={offer} now={now} onAction={onAction} /> };
}

function detail(variant: string, title: string, data: OfferDetailPageData, action = onAction, shellLayout: 'flow' | 'tabs' = 'flow'): PreviewEntry {
  return {
    id: `screen-offer-detail/${variant}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.offer(data.task.id, data.offer.id)} layout={shellLayout}><OfferDetailScreen data={data} handlers={{ onOfferAction: action }} now={now} /></AppShell>,
  };
}

export const offerPreviews: PreviewEntry[] = [
  card('new', deskOfferJordan),
  card('stale', deskOfferSamStale),
  card('declined', { ...deskOfferSam, status: 'declined', actions: [] }),
  card('accepted', { ...deskOfferJordan, isNew: false, status: 'accepted', actions: [] }),
  card('withdrawn', { ...deskOfferSam, status: 'withdrawn', actions: [] }),
  card('expired', { ...deskOfferSam, status: 'expired', actions: [] }),
  { id: 'offer-card/reliable', title: copy.previews.reliable, group: copy.previews.group, render: () => <OfferCard offer={{ ...deskOfferJordan, helper: { ...deskOfferJordan.helper, reliable: true } }} now={now} onAction={onAction} /> },
  { id: 'offer-card/selected', title: copy.previews.selected, group: copy.previews.group, render: () => <SelectableOfferPreview /> },
  { id: 'offer-comparison/three-offers', title: copy.previews.comparison, group: copy.previews.group, render: () => <OfferComparison offers={deskOwnerView.offers} now={now} /> },
  detail('default', copy.previews.detail, deskOfferDetailData),
  detail('default-with-tabs', copy.previews.detail, deskOfferDetailData, onAction, 'tabs'),
  detail('masked-message', copy.previews.masked, { ...deskOfferDetailData, offer: deskOfferLee }),
  detail('updated', copy.previews.updated, { ...deskOfferDetailData, offer: deskOfferSam }),
  detail('stale', copy.previews.stale, { ...deskOfferDetailData, offer: deskOfferSamStale }),
  ...ACTION_ERROR_CODES.map((code) => detail(`error-${code.replaceAll('_', '-')}`, feedback.error[code], deskOfferDetailData, fakeHandler({ ok: false, code }))),
];
