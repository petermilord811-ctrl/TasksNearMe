/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OFFER_BLOCKED_REASONS, routes, type FindWorkPageData } from '@/contracts';
import { findWorkEmptyData, findWorkNotBookableData, findWorkPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import findWork from '../../../../messages/en/ui/findWork.json';
import { FindWorkScreen } from './find-work-screen';

afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
function renderWork(data: FindWorkPageData = findWorkPageData) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, findWork }}><FindWorkScreen data={data} now={now} /></NextIntlClientProvider>);
}

describe('FindWorkScreen', () => {
  it('uses the helper task destination and shows supplied distances and offer status', () => {
    renderWork();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: findWorkPageData.cards[0].task.title })).toHaveAttribute('href', routes.app.findWorkTask(findWorkPageData.cards[0].task.id));
    expect(screen.getByText('You made an offer')).toBeVisible();
    expect(screen.getByText('Waiting for client')).toBeVisible();
    expect(screen.getAllByText('About 2 miles away').length).toBeGreaterThan(0);
  });

  it('links distance to its URL and drops the current page', () => {
    renderWork({ ...findWorkPageData, query: { ...findWorkPageData.query, page: 2 }, pageCount: 3 });
    expect(screen.getByRole('link', { name: 'Within 5 miles' })).toHaveAttribute('href', '/app/find-work?distance=within_5_mi');
    for (const name of ['Category', 'When', 'Distance', 'Sort']) {
      for (const link of within(screen.getByRole('navigation', { name })).getAllByRole('link')) expect(link.getAttribute('href')).not.toContain('page=');
    }
    expect(screen.getByRole('link', { name: /Remote only/ }).getAttribute('href')).not.toContain('page=');
  });

  it('preserves other filters, omits defaults, and keeps filters during pagination', () => {
    renderWork({ ...findWorkPageData, query: { category: 'moving-help', when: 'this_week', remoteOnly: true, sort: 'newest', page: 2, distance: 'within_10_mi' }, pageCount: 3 });
    expect(screen.getByRole('link', { name: 'Within 5 miles' })).toHaveAttribute('href', '/app/find-work?category=moving-help&when=this_week&remote=1&sort=newest&distance=within_5_mi');
    expect(screen.getByRole('link', { name: 'Any distance' })).toHaveAttribute('href', '/app/find-work?category=moving-help&when=this_week&remote=1&sort=newest');
    expect(screen.getByRole('link', { name: /Remote only On/ })).toHaveAttribute('href', '/app/find-work?category=moving-help&when=this_week&sort=newest&distance=within_10_mi');
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/app/find-work?category=moving-help&when=this_week&remote=1&sort=newest&distance=within_10_mi');
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/app/find-work?category=moving-help&when=this_week&remote=1&sort=newest&page=3&distance=within_10_mi');
  });

  it.each(OFFER_BLOCKED_REASONS)('shows the supplied %s reason without deciding eligibility', (blockedReason) => {
    renderWork({ ...findWorkPageData, cards: [{ task: findWorkPageData.cards[0].task, blockedReason }] });
    expect(screen.getByText(findWork.blockedReasons[blockedReason])).toBeVisible();
  });

  it('links the setup banner to the supplied identity step', () => {
    renderWork(findWorkNotBookableData);
    expect(screen.getByRole('heading', { name: 'Finish setting up to send offers' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Finish setup' })).toHaveAttribute('href', routes.app.helperOnboarding('identity'));
  });

  it('clears every filter from the empty state', () => {
    renderWork(findWorkEmptyData);
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', routes.app.findWork());
  });

  it('keeps marketplace copy within the approved vocabulary', () => {
    expect(JSON.stringify(findWork)).not.toMatch(/\b(bid|bids|job board|gig|gigs|hire|escrow|wallet|guaranteed|cheapest)\b/i);
  });
});
