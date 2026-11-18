import { describe, expect, it } from 'vitest';
import { routes } from '@/contracts/routes';
import { portalFeedData } from '@/fixtures';
import { savedHref } from './portal-href';

describe('savedHref (sweep 2026-11-18, P2)', () => {
  it('opens every saved item across the city, whatever place and filters are in view (the count beside it is all of them)', () => {
    const query = { ...portalFeedData.query, area: 'windsor-park', type: 'task' as const, category: 'yard-cleanup' as const, q: 'leaves' };
    expect(savedHref(query)).toBe(routes.app.community({ area: 'all', saved: true, sort: query.sort, view: query.view, group: query.group }));
  });

  it('goes back from Saved keeping the view', () => {
    const query = { ...portalFeedData.query, area: 'all', saved: true };
    expect(savedHref(query)).toBe(routes.app.community({ ...query, saved: false, page: undefined }));
  });
});
