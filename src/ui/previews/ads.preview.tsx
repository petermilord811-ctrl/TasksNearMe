import type { ReactNode } from 'react';
import type { PreviewEntry } from '@/contracts';
import type { SponsoredAdId } from '@/contracts/ads';
import { SponsoredAd } from '@/ui/components/ads/sponsored-ad';
import '@/ui/components/ads/ads.css';
import copy from '../../../messages/en/ui/ads.json';

const p = copy.previews;

/** As wide as the Neighbors rail from 1536 px (20rem). */
const rail = (node: ReactNode) => <div className="mx-auto w-full max-w-[20rem]">{node}</div>;

function card(id: string, title: string, ad: SponsoredAdId, frame?: number): PreviewEntry {
  return { id: `ads/${id}`, group: p.group, title, notes: p.notes, render: () => rail(<SponsoredAd ad={ad} {...(frame === undefined ? {} : { frame })} />) };
}

/** The sponsored cards in Neighbors' rail (2026-11-22): where each ad rests, and its first two frames held still. */
export const adsPreviews: PreviewEntry[] = [
  card('humanizeword', p.humanizeword, 'humanizeword'),
  card('humanizeword-scene', p.humanizewordScene, 'humanizeword', 0),
  card('humanizeword-product', p.humanizewordProduct, 'humanizeword', 1),
  card('capcue', p.capcue, 'capcue'),
  card('capcue-scene', p.capcueScene, 'capcue', 0),
  card('capcue-product', p.capcueProduct, 'capcue', 1),
];
