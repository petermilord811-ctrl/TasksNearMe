import { describe, expect, it } from 'vitest';
import { routes } from '@/contracts/routes';
import { portalFeedData, portalOpenTasksFilteredData } from '@/fixtures';
import { activeFilterCount, neighborsHref, openTasksHref, savedHref, unansweredHref } from './portal-href';

describe('savedHref (sweep 2026-11-18, P2)', () => {
  it('opens every saved item across the city, whatever place and filters are in view (the count beside it is all of them)', () => {
    const query = { ...portalFeedData.query, area: 'windsor-park', type: 'question' as const, category: 'yard-cleanup' as const, q: 'leaves' };
    expect(savedHref(query)).toBe(routes.app.community({ area: 'all', saved: true, sort: query.sort, view: query.view, group: query.group }));
  });

  it('goes back from Saved keeping the view', () => {
    const query = { ...portalFeedData.query, area: 'all', saved: true };
    expect(savedHref(query)).toBe(routes.app.community({ ...query, saved: false, page: undefined }));
  });

  it('stays on Open tasks: a helper’s saved tasks (2026-11-23)', () => {
    const query = { ...portalOpenTasksFilteredData.query, area: 'mueller' };
    expect(savedHref(query)).toBe(routes.app.community({ area: 'all', type: 'task', saved: true, sort: query.sort, view: query.view, group: query.group }));
  });
});

describe('the Neighbors | Open tasks switch (2026-11-23)', () => {
  it('keeps the place, the service, the words, when posted, Saved and the grouping; each tab its own sort and view', () => {
    const query = { ...portalFeedData.query, area: 'windsor-park', category: 'yard-cleanup' as const, q: 'leaves', time: '7d' as const, type: 'question' as const, sort: 'top' as const, view: 'list' as const, group: 'day' as const, unanswered: true };
    expect(openTasksHref(query)).toBe(routes.app.community({ area: 'windsor-park', category: 'yard-cleanup', q: 'leaves', time: '7d', group: 'day', type: 'task' }));
    // "General" is no task's service.
    expect(openTasksHref({ ...portalFeedData.query, category: 'general' })).toBe(routes.app.community({ type: 'task' }));
  });

  it('comes back to Neighbors without the board’s filters, Open tasks’ sort or its view', () => {
    const query = { ...portalOpenTasksFilteredData.query, area: 'mueller', sort: 'price_low' as const, view: 'feed' as const };
    expect(neighborsHref(query)).toBe(routes.app.community({ area: 'mueller' }));
  });

  it('opens Unanswered from Open tasks as Neighbors’ asks, without the board’s filters', () => {
    expect(unansweredHref({ ...portalOpenTasksFilteredData.query, area: 'mueller' })).toBe(routes.app.community({ area: 'mueller', unanswered: true }));
  });

  it('counts the board’s filters as filters on Open tasks only', () => {
    // $50 to $99 (one), mornings (one), few offers (one).
    expect(activeFilterCount(portalOpenTasksFilteredData.query)).toBe(3);
    expect(activeFilterCount({ ...portalOpenTasksFilteredData.query, type: undefined })).toBe(0);
  });
});
