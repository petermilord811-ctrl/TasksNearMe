/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '@/contracts';
import { deskConfirmData, movingConfirmHourlyData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import { CancellationSummary } from './cancellation-summary';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

afterEach(cleanup);

describe('CancellationSummary', () => {
  it.each([
    ['fixed-price', deskConfirmData, 'Fri, Nov 20 · 10:00 am', '$51.00', '$12.00'],
    ['hourly', movingConfirmHourlyData, 'Sat, Nov 21 · 9:00 am', '$119.00', '$28.00'],
  ] as const)('shows supplied cancellation terms for %s offers', (_kind, data, deadline, refund, compensation) => {
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><TimeZoneProvider timeZone="America/Chicago">
      <CancellationSummary policy={data.cancellation} helperName="Jordan" />
    </TimeZoneProvider></NextIntlClientProvider>);

    expect(screen.getByText(`Free cancellation until ${deadline}.`)).toBeInTheDocument();
    expect(screen.getByText(`After that, you get ${refund} back and Jordan receives ${compensation}.`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read the cancellation policy' })).toHaveAttribute('href', routes.legal('cancellation-policy'));
  });
});
