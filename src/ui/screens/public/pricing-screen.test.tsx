/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import type { PricingPageData } from '@/contracts';
import { pricingPageData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import publicPages from '../../../../messages/en/ui/publicPages.json';
import { PricingScreen } from './pricing-screen';

afterEach(cleanup);

function show(data: PricingPageData = pricingPageData) {
  render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, publicPages }}><PricingScreen data={data} /></NextIntlClientProvider>);
}

describe('PricingScreen', () => {
  it('shows supplied fixed totals and hourly refund in the correct breakdowns', () => {
    show();
    expect(within(screen.getByRole('region', { name: 'Fixed price: what you pay' })).getByText('$66.00')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Fixed price: what your helper earns' })).getByText('$54.00')).toBeInTheDocument();
    const hourlyFinal = screen.getByRole('region', { name: 'Hourly: after the task' });
    expect(within(hourlyFinal).getByText('$19.25')).toBeInTheDocument();
    expect(within(hourlyFinal).getByText('$134.75')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('uses the supplied fee policy and timers rather than fixed launch numbers', () => {
    show({ ...pricingPageData, fees: { posterFeePercent: 12, helperFeePercent: 8, posterMinimumCents: 400 }, cancellation: { freeUntilHours: 36, lateFeePercent: 15, lateFeeMinimumCents: 900 }, timers: { autoApproveHours: 60, inviteHoldHours: 40 } });
    expect(screen.getByText('12% service fee')).toBeInTheDocument();
    expect(screen.getByText('8% service fee')).toBeInTheDocument();
    expect(screen.getByText(/minimum of \$4\.00 per booking/)).toBeInTheDocument();
    expect(screen.getByText(/Cancel free at least 36 hours/)).toHaveTextContent('15% of the task price or $9.00');
    expect(screen.getByText(/you have 60 hours/)).toBeInTheDocument();
    expect(screen.getByText(/hold on your card for up to 40 hours/)).toBeInTheDocument();
  });

  it('shows the supplied late cancellation outcome and full-refund scenarios in an accessible table', () => {
    show();
    const table = screen.getByRole('table', { name: 'Cancellation example for a $60.00 task' });
    const lateRow = within(table).getByRole('row', { name: /You cancel less than 24 hours/ });
    expect(within(lateRow).getByText('$54.00')).toBeInTheDocument();
    expect(within(lateRow).getByText('$12.00')).toBeInTheDocument();
    expect(within(table).getAllByText('Full refund: $66.00')).toHaveLength(2);
  });
});
