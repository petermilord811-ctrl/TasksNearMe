/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes, type ReceiptPageData } from '@/contracts';
import { deskReceiptPageData, deskSimpleReceiptPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import receipt from '../../../../messages/en/ui/receipt.json';
import { ReceiptScreen } from './receipt-screen';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount(data: ReceiptPageData = deskReceiptPageData) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, receipt }}><TimeZoneProvider timeZone="America/Chicago"><ReceiptScreen data={data} /></TimeZoneProvider></NextIntlClientProvider>);
}

describe('ReceiptScreen', () => {
  it('shows the receipt identity, booking link, helper and market-local dates with one H1', () => {
    mount();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('TasksNearMe')).toBeVisible();
    expect(screen.getByText('TNM-2026-000142')).toBeVisible();
    expect(screen.getByText('Sat, Nov 21, 2026')).toHaveAttribute('dateTime', deskReceiptPageData.issuedAt);
    expect(screen.getByRole('link', { name: deskReceiptPageData.booking.title })).toHaveAttribute('href', routes.app.booking(deskReceiptPageData.booking.id));
    expect(screen.getByText('Jordan T.')).toBeVisible();
    expect(screen.getByText('Sat, Nov 21 · 10:30 am')).toHaveAttribute('dateTime', deskReceiptPageData.booking.start);
  });

  it('renders every supplied charge and refund, with masked payment labels', () => {
    mount();
    const activity = within(screen.getByRole('region', { name: 'Charges and refunds' }));
    const rows = activity.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Charged')).toBeVisible();
    expect(within(rows[0]).getByText('$83.00')).toBeVisible();
    expect(within(rows[0]).getByText('Tue, Nov 17 · 9:02 am')).toBeVisible();
    expect(within(rows[1]).getByText('Refunded')).toBeVisible();
    expect(within(rows[1]).getByText('Unused expense allowance')).toBeVisible();
    expect(within(rows[1]).getByText('$12.00')).toBeVisible();
    expect(within(rows[1]).getByText('Sat, Nov 21 · 1:05 pm')).toBeVisible();
    expect(activity.getAllByText('Visa •••• 1881')).toHaveLength(2);
    expect(activity.getByText('$71.00')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Price breakdown' })).toHaveTextContent('Hold fee');
    expect(screen.getByRole('region', { name: 'Price breakdown' })).not.toHaveTextContent('Service fee');
    expect(screen.queryByText("You'll earn")).not.toBeInTheDocument();
  });

  it('takes the net total directly from the contract instead of deriving it from the lines', () => {
    mount({ ...deskReceiptPageData, netCents: deskSimpleReceiptPageData.netCents });
    expect(within(screen.getByRole('region', { name: 'Charges and refunds' })).getByText('$63.00')).toBeVisible();
  });

  it.each([
    ['cancellation', 'Cancellation'],
    ['unused_cap', 'Unused hourly cap'],
    ['unused_allowance', 'Unused expense allowance'],
    ['change_decrease', 'Lower agreed price'],
    ['dispute_settlement', 'Problem resolved with a refund'],
    ['goodwill', 'Goodwill refund'],
    ['new_reason_from_app', 'Refund'],
    [undefined, 'Refund'],
  ])('words refund reason %s without exposing the code', (reason, expected) => {
    const refundLine = deskReceiptPageData.lines[1];
    mount({ ...deskReceiptPageData, lines: [{ ...refundLine, reason }] });
    expect(within(screen.getByRole('listitem')).getByText(expected!)).toBeVisible();
    if (reason) expect(screen.queryByText(reason, { exact: true })).not.toBeInTheDocument();
  });

  it('renders the simple receipt without adding a refund activity', () => {
    mount(deskSimpleReceiptPageData);
    const activity = within(screen.getByRole('region', { name: 'Charges and refunds' }));
    expect(activity.getAllByRole('listitem')).toHaveLength(1);
    expect(activity.queryByText('Refunded')).not.toBeInTheDocument();
    expect(activity.getAllByText('$63.00')).toHaveLength(2);
  });

  it('opens the browser print dialog from a control excluded from the printed receipt', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const user = userEvent.setup();
    mount();
    const button = screen.getByRole('button', { name: 'Print' });
    expect(button).toHaveAttribute('data-print-hidden');
    expect(button.closest('article')).toHaveAttribute('data-print-receipt');
    await user.click(button);
    expect(print).toHaveBeenCalledOnce();
  });
});
