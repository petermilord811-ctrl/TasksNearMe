/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type MyOffersPageData } from '@/contracts';
import { myOffersEmptyData, myOffersPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import myOffers from '../../../../messages/en/ui/myOffers.json';
import { MyOffersScreen } from './my-offers-screen';

afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
function renderOffers(data: MyOffersPageData = myOffersPageData, initialTab: 'active' | 'booked' | 'closed' = 'active') {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, myOffers }}><MyOffersScreen data={data} now={now} initialTab={initialTab} /></NextIntlClientProvider>);
}

describe('MyOffersScreen', () => {
  it('shows tab counts, helper status, supplied earnings, expiry, and helper links', () => {
    renderOffers();
    expect(screen.getByRole('tab', { name: 'Active (2)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Booked (0)' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Closed (1)' })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const row = within(screen.getByRole('article', { name: myOffersPageData.active[0].task.title }));
    expect(row.getByRole('link')).toHaveAttribute('href', routes.app.findWorkTask(myOffersPageData.active[0].task.id));
    expect(row.getByText('Waiting for client')).toBeVisible();
    expect(row.getByText('$60.00')).toBeVisible();
    expect(row.getByText('$54.00')).toBeVisible();
    expect(row.getByText('Expires in 3 days')).toBeVisible();
    expect(screen.queryByText('Updated offer')).not.toBeInTheDocument();
  });

  it('shows the updated note for a supplied revision above one', () => {
    renderOffers({ ...myOffersPageData, active: [{ ...myOffersPageData.active[0], offer: { ...myOffersPageData.active[0].offer, revision: 2 } }] });
    expect(screen.getByText('Updated offer')).toBeVisible();
  });

  it('switches to closed offers with their helper status', async () => {
    const user = userEvent.setup();
    renderOffers();
    await user.click(screen.getByRole('tab', { name: 'Closed (1)' }));
    expect(screen.getByText('Not selected')).toBeVisible();
    expect(screen.queryByText('Waiting for client')).not.toBeInTheDocument();
  });

  it('supports keyboard navigation to the booked tab', async () => {
    const user = userEvent.setup();
    renderOffers();
    screen.getByRole('tab', { name: 'Active (2)' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Booked (0)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'No booked offers yet' })).toBeVisible();
  });

  it.each(['active', 'booked', 'closed'] as const)('provides a find-work link in the empty %s tab', (tab) => {
    renderOffers(myOffersEmptyData, tab);
    expect(screen.getByRole('heading', { name: myOffers.empty[tab].title })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Find work' })).toHaveAttribute('href', routes.app.findWork());
  });

  it('keeps marketplace copy within the approved vocabulary', () => {
    expect(JSON.stringify(myOffers)).not.toMatch(/\b(bid|bids|job board|gig|gigs|hire|escrow|wallet|guaranteed|cheapest)\b/i);
  });
});
