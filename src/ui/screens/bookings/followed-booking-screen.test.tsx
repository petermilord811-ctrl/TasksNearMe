/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { routes } from '@/contracts';
import { deskThreadFollowerView, fakeThreadHandlers, followedDeskBooking, followedDeskCompleted, followedDeskEnded, followedDeskOnTheWay, liaBookingsPageData } from '@/fixtures';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import messages from '../../../../messages/en/ui';
import esMessages from '../../../../messages/es/ui';
import { ThreadScreen } from '../messages';
import { BookingsScreen } from './bookings-screen';
import { FollowedBookingScreen } from './followed-booking-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, usePathname: () => '/app/bookings' }));
afterEach(cleanup);

const now = '2026-11-21T14:00:00.000Z';
/** Fails on a missing message (next-intl renders the key silently otherwise). */
function wrap(node: ReactNode, locale: 'en' | 'es' = 'en') {
  const onError = vi.fn();
  const view = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? messages : esMessages} onError={onError}><TimeZoneProvider timeZone="America/Chicago">{node}</TimeZoneProvider></NextIntlClientProvider>);
  return { ...view, onError };
}

describe('FollowedBookingScreen', () => {
  it('reads the booking for a follower: when, where, the helper, the conversation; no address, money or actions', () => {
    const { container, onError } = wrap(<FollowedBookingScreen data={followedDeskBooking} handlers={{ onLeave: vi.fn() }} now={now} />);
    expect(screen.getByText(/You're following Maya R\.'s booking, with Jordan helping/)).toBeTruthy();
    expect(screen.getByText('Mueller')).toBeTruthy();
    expect(screen.getByText('The exact address stays between Maya R. and the helper.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Read the conversation' }).getAttribute('href')).toBe(routes.app.thread('thr_bkg_desk'));
    // Only "Stop following": nothing to pay, change, cancel or review.
    const buttons = screen.getAllByRole('button').map((button) => button.textContent ?? '');
    expect(buttons).toContain('Stop following');
    expect(buttons.filter((name) => /pay|cancel|approve|review|change|message|tip/i.test(name))).toEqual([]);
    expect(container.textContent).not.toMatch(/\$\d/);
    expect(onError).not.toHaveBeenCalled();
  });

  it('shows the day-of moments, when following ends, and that it has ended', () => {
    wrap(<FollowedBookingScreen data={followedDeskOnTheWay} handlers={{ onLeave: vi.fn() }} now={now} />);
    expect(screen.getByText('Jordan is on the way')).toBeTruthy();
    cleanup();
    wrap(<FollowedBookingScreen data={followedDeskCompleted} handlers={{ onLeave: vi.fn() }} now={now} />);
    expect(within(screen.getByRole('region', { name: 'Updates' })).getByText('Done')).toBeTruthy();
    expect(screen.getByText(/Following ends on/)).toBeTruthy();
    cleanup();
    wrap(<FollowedBookingScreen data={followedDeskEnded} handlers={{ onLeave: vi.fn() }} now={now} />);
    expect(screen.getByText(/Following has ended/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Read the conversation' })).toBeNull();
  });

  it('stops following and goes back to the bookings', async () => {
    const onLeave = vi.fn().mockResolvedValue({ ok: true, code: 'updated', redirectTo: routes.app.bookings() });
    wrap(<FollowedBookingScreen data={followedDeskBooking} handlers={{ onLeave }} now={now} />);
    await userEvent.click(screen.getByRole('button', { name: 'Stop following' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(routes.app.bookings()));
    expect(onLeave).toHaveBeenCalledWith({ bookingId: 'bkg_desk' });
  });

  it('reads in Spanish', () => {
    const { onError } = wrap(<FollowedBookingScreen data={followedDeskCompleted} handlers={{ onLeave: vi.fn() }} now={now} />, 'es');
    expect(screen.getByRole('button', { name: 'Dejar de seguir' })).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('Bookings you follow', () => {
  it('lists the followed booking with whose it is, and no money', () => {
    const { onError } = wrap(<BookingsScreen data={liaBookingsPageData} now={now} />);
    const section = screen.getByRole('heading', { name: 'Bookings you follow' }).closest('section')!;
    expect(within(section).getByText("Maya R.'s booking")).toBeTruthy();
    expect(within(section).getByRole('link', { name: 'Assemble a desk (flat-pack, 1 item)' }).getAttribute('href')).toBe(routes.app.booking('bkg_desk'));
    expect(section.textContent).not.toMatch(/\$\d/);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("the follower's conversation", () => {
  it('is read-only: no message box, and it says so', () => {
    const { onError } = wrap(<ThreadScreen data={deskThreadFollowerView} handlers={fakeThreadHandlers} now={now} />);
    expect(screen.getByText("You're following this booking (read-only)")).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.querySelector('[data-family-note="following"]')?.textContent).toMatch(/You're following Maya R\.'s booking \(read-only\)/);
    expect(screen.getAllByText('Following').length).toBeGreaterThan(0);
    expect(onError).not.toHaveBeenCalled();
  });
});
