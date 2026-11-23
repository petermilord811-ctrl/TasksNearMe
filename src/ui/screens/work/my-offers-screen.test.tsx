/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type MyOffersPageData } from '@/contracts';
import { fakeInviteHandlers, myOffersBookedChangedData, myOffersEmptyData, myOffersPageData, myOffersWithInviteData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import myOffers from '../../../../messages/en/ui/myOffers.json';
import inviteCard from '../../../../messages/en/ui/inviteCard.json';
import { MyOffersScreen } from './my-offers-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
function renderOffers(data: MyOffersPageData = myOffersPageData, initialTab: 'active' | 'booked' | 'closed' = 'active') {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, myOffers }}><MyOffersScreen data={data} now={now} initialTab={initialTab} /></NextIntlClientProvider>);
}

describe('MyOffersScreen', () => {
  it('shows a booked offer as its booking stands after a change, with the offer’s price as “was” (journeys on a phone)', () => {
    renderOffers(myOffersBookedChangedData, 'booked');
    expect(screen.getByText(/Your price \$80\.00/)).toBeVisible();
    expect(screen.getByText('· was $60.00')).toBeVisible();
    // What he earns as the booking stands (the whole $80.00: no service fees since 2026-11-23), not the offer's $60.00.
    expect(screen.getAllByText(/You earn \$80\.00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/You earn \$60\.00/)).not.toBeInTheDocument();
  });

  it('opens the requested invite in a sheet, retains supplied order, and restores focus', async () => {
    const user = userEvent.setup();
    const data = { ...myOffersWithInviteData, invites: myOffersWithInviteData.invites?.map((invite, index) => index ? { ...invite, id: `${invite.id}-expired` } : invite) };
    render(<NextIntlClientProvider locale="en" messages={{ ...messages, myOffers, inviteCard }}><MyOffersScreen data={data} now={now} inviteHandlers={fakeInviteHandlers} /></NextIntlClientProvider>);
    const dialog = screen.getByRole('dialog', { name: 'Task invite' });
    expect(within(dialog).getByText('New request')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Invites' });
    const rows = within(section).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('New request');
    expect(rows[1]).toHaveTextContent('Expired');
    expect(within(rows[0]).getByRole('button')).toHaveFocus();
    await user.click(within(rows[1]).getByRole('button'));
    expect(within(screen.getByRole('dialog')).getByText('Expired')).toBeVisible();
  });

  it('shows tab counts, helper status, supplied earnings, expiry, and helper links', () => {
    renderOffers();
    expect(screen.getByRole('tab', { name: 'Active (2)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Booked (0)' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Closed (1)' })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const row = within(screen.getByRole('article', { name: myOffersPageData.active[0].task.title }));
    expect(row.getByRole('link')).toHaveAttribute('href', routes.app.findWorkTask(myOffersPageData.active[0].task.id));
    expect(row.getByText('Waiting for client')).toBeVisible();
    expect(row.getByText('Your price $60.00')).toBeVisible();
    // What the helper earns: on the right from 640 px, in the details line on phones.
    expect(row.getAllByText('$60.00').length).toBeGreaterThan(0);
    expect(row.getAllByText('You earn $60.00').length).toBeGreaterThan(0);
    expect(row.getByText('Expires in 3 days')).toBeVisible();
    expect(screen.queryByText('Updated offer')).not.toBeInTheDocument();
  });

  it('opens on the first tab with offers in it, not an empty one (audit L18)', () => {
    const booked = myOffersPageData.active.map((row) => ({ ...row, offer: { ...row.offer, status: 'accepted' as const } }));
    render(<NextIntlClientProvider locale="en" messages={{ ...messages, myOffers }}><MyOffersScreen data={{ ...myOffersPageData, active: [], booked }} now={now} /></NextIntlClientProvider>);
    expect(screen.getByRole('tab', { name: 'Booked (2)' })).toHaveAttribute('aria-selected', 'true');
    // A booked offer no longer waits, so it has no expiry.
    expect(screen.queryByText(/^Expires/)).not.toBeInTheDocument();
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

  it("says 'Task canceled' for an offer its task's cancellation declined, not 'Not selected' (sweep D9)", () => {
    const [row] = myOffersPageData.closed;
    renderOffers({ ...myOffersPageData, closed: [{ ...row!, offer: { ...row!.offer, taskCanceled: true } }] }, 'closed');
    expect(screen.getByText('Task canceled')).toBeVisible();
    expect(screen.queryByText('Not selected')).not.toBeInTheDocument();
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
