/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { routes } from '@/contracts/routes';
import { portalEmptyData, portalFeedData, portalFilteredEmptyData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { PortalEmpty } from './portal-empty';

afterEach(cleanup);
const show = (data: Parameters<typeof PortalEmpty>[0]['data']) => render(<NextIntlClientProvider locale="en" messages={messages}><PortalEmpty data={data} /></NextIntlClientProvider>);
const city = portalFeedData.market.name;

/** Which empty state, from what's filtered (sweep 2026-11-18, P1 and P6), never from counts that apply the filters. */
describe('PortalEmpty', () => {
  it("says a filter matched nothing even when nothing anywhere matches it (it isn't a first day)", () => {
    // Words that match nothing in the whole city: facets.all is 0 because the facets apply the words too.
    show({ ...portalFeedData, query: { ...portalFeedData.query, area: 'all', q: 'plumber' }, place: { kind: 'market' }, facets: { ...portalFeedData.facets, all: 0 } });
    expect(screen.getByRole('heading', { name: 'Nothing like that here yet' })).toBeDefined();
    expect(screen.getByText(`Nothing in ${city} matches these filters. Clear them to see everything.`)).toBeDefined();
    expect(screen.queryByRole('heading', { name: /quiet/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe(routes.app.community({ area: 'all' }));
  });

  it('in a neighborhood, offers the same filters across the city, and Clear filters stays in the neighborhood', () => {
    show(portalFilteredEmptyData);
    expect(screen.getByRole('link', { name: `Show all of ${city}` }).getAttribute('href')).toBe(routes.app.community({ type: 'thanks', area: 'all', time: '7d' }));
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe(routes.app.community({ area: 'windsor-park' }));
  });

  it('a quiet neighborhood with no filters: its first days, and the whole city', () => {
    show({ ...portalEmptyData, query: { ...portalEmptyData.query, area: 'windsor-park' }, place: { kind: 'area', slug: 'windsor-park', name: 'Windsor Park' } });
    expect(screen.getByRole('heading', { name: "It's quiet in Windsor Park so far" })).toBeDefined();
    expect(screen.getByRole('link', { name: `Show all of ${city}` }).getAttribute('href')).toBe(routes.app.community({ area: 'all' }));
  });

  it('the whole city on its first days: no wider place to offer', () => {
    show({ ...portalEmptyData, query: { ...portalEmptyData.query, area: 'all' }, place: { kind: 'market' } });
    expect(screen.getByRole('heading', { name: `It's quiet in ${city} so far` })).toBeDefined();
    expect(screen.queryByRole('link', { name: /Show all of/ })).toBeNull();
  });

  it('a page past the end leads back to the first page', () => {
    show({ ...portalFeedData, query: { ...portalFeedData.query, page: 9 } });
    expect(screen.getByRole('heading', { name: 'Nothing on this page' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to the first page' }).getAttribute('href')).toBe(routes.app.community({ ...portalFeedData.query, page: undefined, saved: undefined }));
  });
});
