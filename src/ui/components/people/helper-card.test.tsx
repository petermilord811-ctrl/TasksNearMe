/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { routes, type HelperSummary } from '@/contracts';
import { jordan, lee, sam } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import helperCard from '../../../../messages/en/ui/helperCard.json';
import { HelperCard } from './helper-card';

afterEach(cleanup);

function renderHelper(helper: HelperSummary, variant?: 'compact' | 'full') {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ...uiMessages, helperCard }}>
      <HelperCard helper={helper} variant={variant} />
    </NextIntlClientProvider>,
  );
}

describe('HelperCard', () => {
  it('marks a reliable helper, with the reason in its name, and nobody else', () => {
    renderHelper({ ...sam, reliable: true });
    expect(screen.getByText(helperCard.reliableLabel)).toBeInTheDocument();
    expect(screen.getByText(helperCard.reliable).closest('p')).toHaveAttribute('title', helperCard.reliableHint);
    cleanup();
    renderHelper(sam);
    expect(screen.queryByText(helperCard.reliable)).not.toBeInTheDocument();
  });

  it('shows the helper profile, ratings, response time, and supplied services', () => {
    renderHelper(sam);
    expect(screen.getByRole('link', { name: 'Sam K.' })).toHaveAttribute('href', routes.helperProfile(sam.handle));
    expect(screen.getByText(sam.headline)).toBeInTheDocument();
    expect(screen.getByText('Hyde Park')).toBeInTheDocument();
    expect(screen.getByText('4.9 out of 5, 112 reviews')).toBeInTheDocument();
    expect(screen.getByText('140 tasks completed')).toBeInTheDocument();
    expect(screen.getByText('Usually replies within an hour')).toBeInTheDocument();
    expect(screen.getByText('from $50.00')).toBeInTheDocument();
    expect(screen.getByText('$38.00/h')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ID verified' })).toBeInTheDocument();
    expect(screen.queryByText(/Founding helper/)).not.toBeInTheDocument();
  });

  it('shows the founding number even without a rating', () => {
    renderHelper(jordan);
    expect(screen.getByText('Founding helper #63')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('0 tasks completed')).toBeInTheDocument();
    expect(screen.getByText('from $45.00')).toBeInTheDocument();
    expect(screen.getByText('$35.00/h')).toBeInTheDocument();
  });

  it('leaves out the services and their prices in compact mode (an offer or booking has its own price), keeping verification', () => {
    renderHelper(lee, 'compact');
    expect(screen.queryByText('Furniture assembly')).not.toBeInTheDocument();
    expect(screen.queryByText(/from \$/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Background checked' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: lee.displayName })).toHaveAttribute('href', routes.helperProfile(lee.handle));
  });

  it('does not invent a response time or amount when optional data is absent', () => {
    renderHelper({ ...lee, responseTime: undefined, services: [{ categorySlug: 'computer-help', pricingType: 'fixed' }] });
    expect(screen.queryByText(/Usually replies/)).not.toBeInTheDocument();
    expect(screen.getByText('Price shared in an offer')).toBeInTheDocument();
    expect(screen.queryByText(/from \$/)).not.toBeInTheDocument();
  });
});
