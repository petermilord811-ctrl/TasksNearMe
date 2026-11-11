/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type BookingsPageData } from '@/contracts';
import { bookingsEmptyData, jordanBookingsPageData, mayaBookingsNeedsActionData, mayaBookingsPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import bookings from '../../../../messages/en/ui/bookings.json';
import { BookingsScreen } from './bookings-screen';

afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';

function renderBookings(data: BookingsPageData = mayaBookingsPageData) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, bookings }}><BookingsScreen data={data} now={now} /></NextIntlClientProvider>);
}

describe('BookingsScreen', () => {
  it('opens the first populated tab with counts and shows the client row with its supplied total', () => {
    renderBookings();
    expect(screen.getByRole('tab', { name: 'Needs action (0)' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Upcoming (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Past (1)' })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const row = mayaBookingsPageData.upcoming[0];
    expect(screen.getByRole('link', { name: row.title })).toHaveAttribute('href', routes.app.booking(row.id));
    const article = within(screen.getByRole('article', { name: row.title }));
    expect(article.getByText('You booked')).toBeVisible();
    expect(article.getByText('Booked')).toBeVisible();
    expect(article.getByText('Total $66.00')).toBeVisible();
    expect(article.getByText('Furniture assembly')).toBeVisible();
    expect(article.getByText('Jordan T.')).toBeVisible();
    expect(article.getByRole('img', { name: 'Avatar with initials JT' })).toBeVisible();
    expect(article.getByText('Sat, Nov 21 · 10:30 am')).toBeVisible();
    expect(article.getByText('Mueller')).toBeVisible();
  });

  it('prioritizes Needs action and preserves action markers in Upcoming', async () => {
    const user = userEvent.setup();
    renderBookings(mayaBookingsNeedsActionData);
    expect(screen.getByRole('tab', { name: 'Needs action (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Needs your approval')).toBeVisible();
    expect(screen.getByText('Needs your action')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Upcoming (1)' }));
    expect(screen.getByText('Needs your action')).toBeVisible();
  });

  it('uses each row role, supplied money, and other person even when roles share a list', () => {
    renderBookings({ ...bookingsEmptyData, upcoming: [mayaBookingsPageData.upcoming[0], { ...jordanBookingsPageData.upcoming[0], id: 'bkg_helper' }] });
    expect(screen.getByText('You booked')).toBeVisible();
    expect(screen.getByText("You're helping")).toBeVisible();
    expect(screen.getByText('Total $66.00')).toBeVisible();
    expect(screen.getByText("You'll earn $54.00")).toBeVisible();
    expect(screen.getByText('Maya R.')).toBeVisible();
    expect(screen.getByText('Jordan T.')).toBeVisible();
  });

  it('opens Past when it is the only populated tab', () => {
    renderBookings({ ...bookingsEmptyData, past: mayaBookingsPageData.past });
    expect(screen.getByRole('tab', { name: 'Past (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Done')).toBeVisible();
    expect(screen.getByRole('link', { name: mayaBookingsPageData.past[0].title })).toHaveAttribute('href', routes.app.booking(mayaBookingsPageData.past[0].id));
  });

  it('defaults to Upcoming when all lists are empty and offers both next steps', async () => {
    const user = userEvent.setup();
    renderBookings(bookingsEmptyData);
    expect(screen.getByRole('tab', { name: 'Upcoming (0)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', routes.app.newTask());
    expect(screen.getByRole('link', { name: 'Find work' })).toHaveAttribute('href', routes.app.findWork());
    await user.click(screen.getByRole('tab', { name: 'Past (0)' }));
    expect(screen.getByRole('heading', { name: 'Nothing has finished yet' })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Needs action (0)' }));
    expect(screen.getByRole('heading', { name: 'Nothing needs your action' })).toBeVisible();
  });

  it('labels a remote booking without adding an area', () => {
    renderBookings({ ...bookingsEmptyData, upcoming: [{ ...jordanBookingsPageData.upcoming[0], location: { kind: 'remote' } }] });
    expect(screen.getByText('Remote')).toBeVisible();
    expect(screen.queryByText('Mueller')).not.toBeInTheDocument();
  });
});
