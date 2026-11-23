/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import type { BreakdownVariant, PriceBreakdown as PriceBreakdownData } from '@/contracts';
import { deskBreakdown, deskDirectBreakdown, legacyDeskBreakdown, movingFinalBreakdown, deskWithExpensesFinalBreakdown } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import { PriceBreakdown } from './price-breakdown';

afterEach(cleanup);

function show(breakdown: PriceBreakdownData, variant: BreakdownVariant) {
  return render(<NextIntlClientProvider locale="en" messages={uiMessages}><PriceBreakdown breakdown={breakdown} variant={variant} /></NextIntlClientProvider>);
}

/** One line of the breakdown: its label and amount. */
const line = (label: string) => screen.getByText(label).closest('div');

describe('PriceBreakdown', () => {
  it('shows the supplied poster total without helper-only lines', () => {
    show(deskBreakdown, 'poster');
    expect(screen.getByText('$63.00')).toBeInTheDocument();
    expect(screen.queryByText("You'll earn")).not.toBeInTheDocument();
    expect(screen.queryByText('Platform revenue')).not.toBeInTheDocument();
  });

  it('shows helper earnings with the service fee as a deduction (a booking made before 2026-11-23)', () => {
    show(legacyDeskBreakdown, 'helper');
    expect(screen.getByText('$54.00')).toBeInTheDocument();
    expect(screen.getByText('−$6.00')).toBeInTheDocument();
    expect(line('Service fee')).toHaveTextContent('−$6.00');
    expect(screen.queryByText('$66.00')).not.toBeInTheDocument();
  });

  it("shows the held desk's hold fee to the client, and no fee line to the helper", () => {
    const { unmount } = show(deskBreakdown, 'poster');
    expect(line('Hold fee')).toHaveTextContent('$3.00');
    expect(line('Total')).toHaveTextContent('$63.00');
    expect(screen.queryByText('Service fee')).not.toBeInTheDocument();
    unmount();

    show(deskBreakdown, 'helper');
    expect(line("You'll earn")).toHaveTextContent('$60.00');
    expect(screen.queryByText('Hold fee')).not.toBeInTheDocument();
    expect(screen.queryByText('Service fee')).not.toBeInTheDocument();
    expect(screen.queryByText(/^−/)).not.toBeInTheDocument();
  });

  it('keeps the "Service fee" lines of a booking made before 2026-11-23', () => {
    const { unmount } = show(legacyDeskBreakdown, 'poster');
    expect(line('Service fee')).toHaveTextContent('$6.00');
    expect(line('Total')).toHaveTextContent('$66.00');
    expect(screen.queryByText('Hold fee')).not.toBeInTheDocument();
    unmount();

    show(legacyDeskBreakdown, 'admin');
    expect(line('Client service fee')).toHaveTextContent('$6.00');
    expect(line('Helper service fee')).toHaveTextContent('−$6.00');
    expect(line('Platform revenue')).toHaveTextContent('$12.00');
    expect(screen.queryByText('Client hold fee')).not.toBeInTheDocument();
  });

  it('shows no fee line for a booking paid directly', () => {
    const { unmount } = show(deskDirectBreakdown, 'poster');
    expect(line('Total')).toHaveTextContent('$60.00');
    expect(screen.queryByText('Hold fee')).not.toBeInTheDocument();
    expect(screen.queryByText('Service fee')).not.toBeInTheDocument();
    unmount();

    show(deskDirectBreakdown, 'helper');
    expect(line("You'll earn")).toHaveTextContent('$60.00');
    expect(screen.queryByText('Service fee')).not.toBeInTheDocument();
  });

  it('shows the funded charge, supplied refund, approved hours and final total', () => {
    show(movingFinalBreakdown, 'poster');
    expect(screen.getByText('$147.00')).toBeInTheDocument();
    expect(screen.getByText('$18.37')).toBeInTheDocument();
    expect(screen.getByText('$128.63')).toBeInTheDocument();
    expect(screen.getByText('$35.00 × 3.5 h')).toBeInTheDocument();
    expect(screen.getByText('Final total')).toBeInTheDocument();
  });

  it('keeps reimbursement separate from the supplied earnings', () => {
    show(deskWithExpensesFinalBreakdown, 'helper');
    expect(line("You'll earn")).toHaveTextContent('$60.00');
    expect(screen.getByText('$8.00')).toBeInTheDocument();
    expect(screen.getByText('Reimbursed expenses')).toBeInTheDocument();
    expect(screen.queryByText('$68.00')).not.toBeInTheDocument();
  });

  it('displays platform revenue only in the admin variant', () => {
    show(deskBreakdown, 'admin');
    expect(line('Platform revenue')).toHaveTextContent('$3.00');
    expect(line('Client hold fee')).toHaveTextContent('$3.00');
    expect(screen.queryByText('Helper service fee')).not.toBeInTheDocument();
  });

  it('is a card of its own by default, and flat inside another card with the same lines and name', () => {
    const { rerender } = render(<NextIntlClientProvider locale="en" messages={uiMessages}><PriceBreakdown breakdown={deskBreakdown} variant="poster" /></NextIntlClientProvider>);
    expect(screen.getByRole('region', { name: 'Price breakdown' })).toHaveClass('shadow-card');

    rerender(<NextIntlClientProvider locale="en" messages={uiMessages}><PriceBreakdown breakdown={deskBreakdown} variant="poster" flat className="mt-4" /></NextIntlClientProvider>);
    const section = screen.getByRole('region', { name: 'Price breakdown' });
    expect(section).not.toHaveClass('shadow-card');
    expect(section).toHaveClass('mt-4');
    expect(screen.getByRole('heading', { name: 'Price breakdown' })).toBeInTheDocument();
    expect(screen.getByText('$63.00')).toBeInTheDocument();
  });
});
