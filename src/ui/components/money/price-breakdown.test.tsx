/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import type { BreakdownVariant, PriceBreakdown as PriceBreakdownData } from '@/contracts';
import { deskBreakdown, movingFinalBreakdown, deskWithExpensesFinalBreakdown } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import { PriceBreakdown } from './price-breakdown';

afterEach(cleanup);

function show(breakdown: PriceBreakdownData, variant: BreakdownVariant) {
  render(<NextIntlClientProvider locale="en" messages={uiMessages}><PriceBreakdown breakdown={breakdown} variant={variant} /></NextIntlClientProvider>);
}

describe('PriceBreakdown', () => {
  it('shows the supplied poster total without helper-only lines', () => {
    show(deskBreakdown, 'poster');
    expect(screen.getByText('$66.00')).toBeInTheDocument();
    expect(screen.queryByText('$54.00')).not.toBeInTheDocument();
    expect(screen.queryByText('Platform revenue')).not.toBeInTheDocument();
  });

  it('shows helper earnings with the service fee as a deduction', () => {
    show(deskBreakdown, 'helper');
    expect(screen.getByText('$54.00')).toBeInTheDocument();
    expect(screen.getByText('−$6.00')).toBeInTheDocument();
    expect(screen.queryByText('$66.00')).not.toBeInTheDocument();
  });

  it('shows the funded charge, supplied refund, approved hours and final total', () => {
    show(movingFinalBreakdown, 'poster');
    expect(screen.getByText('$154.00')).toBeInTheDocument();
    expect(screen.getByText('$19.25')).toBeInTheDocument();
    expect(screen.getByText('$134.75')).toBeInTheDocument();
    expect(screen.getByText('$35.00 × 3.5 h')).toBeInTheDocument();
    expect(screen.getByText('Final total')).toBeInTheDocument();
  });

  it('keeps reimbursement separate from the supplied earnings', () => {
    show(deskWithExpensesFinalBreakdown, 'helper');
    expect(screen.getByText('$54.00')).toBeInTheDocument();
    expect(screen.getByText('$8.00')).toBeInTheDocument();
    expect(screen.getByText('Reimbursed expenses')).toBeInTheDocument();
    expect(screen.queryByText('$62.00')).not.toBeInTheDocument();
  });

  it('displays platform revenue only in the admin variant', () => {
    show(deskBreakdown, 'admin');
    expect(screen.getByText('Platform revenue')).toBeInTheDocument();
    expect(screen.getByText('$12.00')).toBeInTheDocument();
  });

  it('is a card of its own by default, and flat inside another card with the same lines and name', () => {
    const { rerender } = render(<NextIntlClientProvider locale="en" messages={uiMessages}><PriceBreakdown breakdown={deskBreakdown} variant="poster" /></NextIntlClientProvider>);
    expect(screen.getByRole('region', { name: 'Price breakdown' })).toHaveClass('shadow-card');

    rerender(<NextIntlClientProvider locale="en" messages={uiMessages}><PriceBreakdown breakdown={deskBreakdown} variant="poster" flat className="mt-4" /></NextIntlClientProvider>);
    const section = screen.getByRole('region', { name: 'Price breakdown' });
    expect(section).not.toHaveClass('shadow-card');
    expect(section).toHaveClass('mt-4');
    expect(screen.getByRole('heading', { name: 'Price breakdown' })).toBeInTheDocument();
    expect(screen.getByText('$66.00')).toBeInTheDocument();
  });
});
