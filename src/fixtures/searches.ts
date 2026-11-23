import type { EditSavedSearchPageData, NewSavedSearchPageData, SavedSearchesPageData, SavedSearchFilters } from '@/contracts';
import { CATEGORY_SLUGS } from '@/contracts';
import { taskTypesFor } from '@/shared/task-types';

/** Saved searches (completion plan 7.10), as the searches service returns them for Lee. */

const none: SavedSearchFilters = { when: 'any', times: [], remoteOnly: false, few: false, areaNames: [] };

export const savedSearchesPageData: SavedSearchesPageData = {
  max: 10,
  instantAlertsPerDay: 10,
  searches: [
    { id: 'ssr_furniture', name: 'Furniture · Mueller · Hyde Park', source: 'board', href: '/austin/tasks/furniture-assembly?area=hyde-park,mueller', marketName: 'Austin', filters: { ...none, category: 'furniture-assembly', areaNames: ['Hyde Park', 'Mueller'] }, alert: 'instant', openCount: 9, createdAt: '2026-11-10T15:00:00.000Z' },
    { id: 'ssr_mornings', name: 'Weekend mornings over $50', source: 'board', href: '/austin/tasks?min=50&when=this_weekend&time=morning', marketName: 'Austin', filters: { ...none, minPrice: 50, when: 'this_weekend', times: ['morning'] }, alert: 'daily', openCount: 4, createdAt: '2026-11-12T15:00:00.000Z' },
    { id: 'ssr_remote', name: 'Remote computer help', source: 'board', href: '/austin/tasks/computer-help?remote=1', marketName: 'Austin', filters: { ...none, category: 'computer-help', remoteOnly: true }, alert: 'off', openCount: 0, createdAt: '2026-11-13T15:00:00.000Z' },
  ],
};

export const savedSearchesEmptyData: SavedSearchesPageData = { max: 10, instantAlertsPerDay: 10, searches: [] };

export const newSavedSearchPageData: NewSavedSearchPageData = {
  from: '/austin/tasks/furniture-assembly?area=hyde-park,mueller',
  source: 'board',
  marketName: 'Austin',
  filters: { ...none, category: 'furniture-assembly', areaNames: ['Hyde Park', 'Mueller'] },
  full: false,
  max: 10,
  instantAlertsPerDay: 10,
};

/** Jordan's furniture tasks within 5 miles, saved from find work (sweep SS5). */
const nearbyFurniture = { ...none, category: 'furniture-assembly' as const, times: ['morning' as const], distance: 'within_5_mi' as const };

export const newFindWorkSavedSearchPageData: NewSavedSearchPageData = {
  from: '/app/find-work?category=furniture-assembly&time=morning&distance=within_5_mi',
  source: 'find_work',
  marketName: 'Austin',
  filters: nearbyFurniture,
  full: false,
  max: 10,
  instantAlertsPerDay: 10,
};

/** The list with a search saved from find work. */
export const savedSearchesWithFindWorkData: SavedSearchesPageData = {
  ...savedSearchesPageData,
  searches: [
    { id: 'ssr_nearby', name: 'Furniture mornings near me', source: 'find_work', href: '/app/find-work?category=furniture-assembly&time=morning&distance=within_5_mi', marketName: 'Austin', filters: nearbyFurniture, alert: 'instant', openCount: 3, createdAt: '2026-11-09T15:00:00.000Z' },
    ...savedSearchesPageData.searches,
  ],
};

const editOptions: EditSavedSearchPageData['options'] = {
  categories: CATEGORY_SLUGS.map((slug) => ({ slug, types: taskTypesFor(slug).map((type) => type.slug) })),
  areas: [
    { slug: 'allandale', name: 'Allandale' },
    { slug: 'cherrywood', name: 'Cherrywood' },
    { slug: 'circle-c', name: 'Circle C' },
    { slug: 'crestview', name: 'Crestview' },
    { slug: 'downtown', name: 'Downtown' },
    { slug: 'east-austin', name: 'East Austin' },
    { slug: 'hyde-park', name: 'Hyde Park' },
    { slug: 'mueller', name: 'Mueller' },
    { slug: 'north-loop', name: 'North Loop' },
    { slug: 'travis-heights', name: 'Travis Heights' },
    { slug: 'windsor-park', name: 'Windsor Park' },
    { slug: 'zilker', name: 'Zilker' },
  ],
};

/** Editing "Furniture · Mueller · Hyde Park" (sweep SS5). */
export const editSavedSearchPageData: EditSavedSearchPageData = {
  id: 'ssr_furniture',
  name: 'Furniture · Mueller · Hyde Park',
  alert: 'instant',
  source: 'board',
  marketName: 'Austin',
  values: { category: 'furniture-assembly', areas: ['hyde-park', 'mueller'], when: 'any', times: [], remoteOnly: false, few: false },
  options: editOptions,
  openCount: 9,
  instantAlertsPerDay: 10,
};

/** Editing a find work search: its distance too. */
export const editFindWorkSavedSearchPageData: EditSavedSearchPageData = {
  id: 'ssr_nearby',
  name: 'Furniture mornings near me',
  alert: 'instant',
  source: 'find_work',
  marketName: 'Austin',
  values: { category: 'furniture-assembly', type: 'desk', areas: [], minPrice: 40, when: 'any', times: ['morning'], remoteOnly: false, few: true, distance: 'within_5_mi' },
  options: editOptions,
  openCount: 3,
  instantAlertsPerDay: 10,
};
