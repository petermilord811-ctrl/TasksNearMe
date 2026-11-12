import type { HelpersBrowsePageData } from '@/contracts';
import { jordan, lee, sam } from './people';

/** Browse helpers (`/app/helpers`) as Maya, around Tuesday Nov 17, 2026 in Austin. */

const areas = [
  { slug: 'crestview', name: 'Crestview' },
  { slug: 'hyde-park', name: 'Hyde Park' },
  { slug: 'mueller', name: 'Mueller' },
  { slug: 'windsor-park', name: 'Windsor Park' },
];

export const helpersBrowseData: HelpersBrowsePageData = {
  query: {},
  rows: [
    { helper: jordan, saved: true, nextOpenTime: { start: '2026-11-19T15:00:00.000Z', categorySlug: 'yard-cleanup' } },
    { helper: sam, saved: false },
    { helper: lee, saved: false, nextOpenTime: { start: '2026-11-20T18:00:00.000Z', categorySlug: 'computer-help' } },
  ],
  areas,
  total: 3,
};

/** Furniture helpers who serve Mueller and have open times this week. */
export const helpersBrowseFilteredData: HelpersBrowsePageData = {
  query: { category: 'furniture-assembly', area: 'mueller', openTimes: true },
  rows: [{ helper: jordan, saved: true, nextOpenTime: { start: '2026-11-19T15:00:00.000Z', categorySlug: 'furniture-assembly' } }],
  areas,
  total: 1,
};

export const helpersBrowseEmptyData: HelpersBrowsePageData = { query: { q: 'zzz' }, rows: [], areas, total: 0 };
