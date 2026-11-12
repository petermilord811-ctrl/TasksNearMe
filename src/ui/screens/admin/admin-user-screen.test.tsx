/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUSES, NOTIFICATION_TYPES, routes, type AdminUserPageData } from '@/contracts';
import { ADMIN_NOW, adminUserJordanData, adminUserReadOnlyData, adminUserSuspendedData, fakeAdminUserHandlers } from '@/fixtures';
import { formatDateTime, formatMoney, formatMonthYear } from '@/shared/format';
import uiMessages from '../../../../messages/en/ui';
import adminUser from '../../../../messages/en/ui/adminUser.json';
import adminUsers from '../../../../messages/en/ui/adminUsers.json';
import adminRewards from '../../../../messages/en/ui/adminRewards.json';
import { AdminUserScreen } from './admin-user-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);
function mount(data: AdminUserPageData = adminUserJordanData) { render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, adminUser, adminUsers, adminRewards }}><AdminUserScreen data={data} handlers={fakeAdminUserHandlers} now={ADMIN_NOW} /></NextIntlClientProvider>); }

describe('AdminUserScreen', () => {
  it('shows a single name heading, member date, permitted email and masked phone', () => {
    mount();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(adminUserJordanData.user.person.displayName);
    expect(screen.getByText(`Member since ${formatMonthYear(adminUserJordanData.user.person.memberSince)}`)).toBeInTheDocument();
    expect(screen.getByText(adminUserJordanData.user.email)).toBeInTheDocument();
    expect(screen.getByText('•••• 0201 · Verified')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'People' })).toHaveAttribute('href', routes.admin.users());
  });

  it('links bookings and cases with supplied status and amounts, leaving rewards read-only', () => {
    mount();
    const bookingTable = within(screen.getByRole('table', { name: adminUser.bookingsCaption }));
    for (const booking of adminUserJordanData.bookings) {
      expect(bookingTable.getByRole('link', { name: booking.title })).toHaveAttribute('href', routes.admin.booking(booking.id));
      expect(bookingTable.getByText(formatMoney(booking.amountCents))).toBeInTheDocument();
      expect(bookingTable.getByText(formatDateTime(booking.start))).toBeInTheDocument();
    }
    const cases = within(screen.getByRole('table', { name: adminUser.casesCaption }));
    expect(cases.getByRole('link', { name: adminUserJordanData.cases[0].subject })).toHaveAttribute('href', routes.admin.case(adminUserJordanData.cases[0].id));
    const rewards = within(screen.getByRole('region', { name: adminUser.rewards }));
    expect(rewards.queryByRole('button')).not.toBeInTheDocument();
    expect(rewards.getByRole('link', { name: adminUser.reviewRewards })).toHaveAttribute('href', routes.admin.rewards());
  });

  it('shows suspension details and readable strike reason', () => {
    mount(adminUserSuspendedData);
    expect(screen.getByText(adminUserSuspendedData.suspension!.reason)).toBeInTheDocument();
    expect(screen.getByText('Suspended by Taylor B.')).toBeInTheDocument();
    expect(screen.getByText(adminUser.strikeReasons.linked_accounts)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open booking bkg_dana' })).toHaveAttribute('href', routes.admin.booking('bkg_dana'));
    expect(screen.queryByRole('button', { name: 'Suspend helper' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reinstate helper' })).toBeInTheDocument();
  });

  it('lists emails and texts with what happened: waiting, failed with the error and the next try, sent, not sent', () => {
    mount();
    const list = within(screen.getByRole('region', { name: adminUser.deliveries }));
    const items = list.getAllByRole('listitem');
    expect(items).toHaveLength(adminUserJordanData.deliveries.length);
    expect(items[0]).toHaveTextContent('Text: Problem reported');
    expect(items[0]).toHaveTextContent('Waiting');
    expect(items[0]).toHaveTextContent(adminUser.deliveryReasons.quiet_hours);
    expect(items[0]).toHaveTextContent(`Next try ${formatDateTime('2026-11-22T14:00:00.000Z')}`);
    expect(items[1]).toHaveTextContent('Email: Problem reported');
    expect(items[1]).toHaveTextContent('Failed');
    expect(items[1]).toHaveTextContent('2 tries');
    expect(items[1]).toHaveTextContent('Mailbox unavailable (550)');
    expect(items[2]).toHaveTextContent('Sent');
    expect(items[2]).not.toHaveTextContent(/tries|Next try/);
    expect(items[3]).toHaveTextContent(adminUser.deliveryReasons.preference_off);
  });

  it('names every strike reason and notification type', () => {
    for (const reason of ['linked_accounts', 'late_cancellation', 'no_show'] as const) expect(adminUser.strikeReasons[reason]).toMatch(/\S/);
    for (const type of NOTIFICATION_TYPES) expect(adminUser.deliveryTypes[type]).toMatch(/\S/);
  });

  it('honors read-only actions and displays empty histories without inventing records', () => {
    mount({ ...adminUserReadOnlyData, bookings: [], cases: [], rewards: [], strikes: [], deliveries: [], user: { ...adminUserReadOnlyData.user, phone: { last4: '0201', verified: false } } });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    for (const copy of [adminUser.noBookings, adminUser.noCases, adminUser.noRewards, adminUser.noStrikes, adminUser.noDeliveries]) expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.getByText('•••• 0201 · Not verified')).toBeInTheDocument();
    for (const status of BOOKING_STATUSES) expect(uiMessages.status.booking.staff[status]).toMatch(/\S/);
  });
});
