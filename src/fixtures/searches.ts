import type { NewSavedSearchPageData, SavedSearchesPageData, SavedSearchFilters } from '@/contracts';

/** Saved searches (completion plan 7.10), as the searches service returns them for Lee. */

const none: SavedSearchFilters = { when: 'any', times: [], remoteOnly: false, few: false, areaNames: [] };

export const savedSearchesPageData: SavedSearchesPageData = {
  max: 10,
  searches: [
    { id: 'ssr_furniture', name: 'Furniture · Mueller · Hyde Park', href: '/austin/tasks/furniture-assembly?area=hyde-park,mueller', marketName: 'Austin', filters: { ...none, category: 'furniture-assembly', areaNames: ['Hyde Park', 'Mueller'] }, alert: 'instant', openCount: 9, createdAt: '2026-11-10T15:00:00.000Z' },
    { id: 'ssr_mornings', name: 'Weekend mornings over $50', href: '/austin/tasks?min=50&when=this_weekend&time=morning', marketName: 'Austin', filters: { ...none, minPrice: 50, when: 'this_weekend', times: ['morning'] }, alert: 'daily', openCount: 4, createdAt: '2026-11-12T15:00:00.000Z' },
    { id: 'ssr_remote', name: 'Remote computer help', href: '/austin/tasks/computer-help?remote=1', marketName: 'Austin', filters: { ...none, category: 'computer-help', remoteOnly: true }, alert: 'off', openCount: 0, createdAt: '2026-11-13T15:00:00.000Z' },
  ],
};

export const savedSearchesEmptyData: SavedSearchesPageData = { max: 10, searches: [] };

export const newSavedSearchPageData: NewSavedSearchPageData = {
  from: '/austin/tasks/furniture-assembly?area=hyde-park,mueller',
  marketName: 'Austin',
  filters: { ...none, category: 'furniture-assembly', areaNames: ['Hyde Park', 'Mueller'] },
  full: false,
};
