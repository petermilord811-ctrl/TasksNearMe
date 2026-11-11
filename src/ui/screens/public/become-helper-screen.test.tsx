/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { routes, type BecomeHelperPageData } from '@/contracts';
import { becomeHelperNoRewardsData, becomeHelperPageData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import publicPages from '../../../../messages/en/ui/publicPages.json';
import { BecomeHelperScreen } from './become-helper-screen';

afterEach(cleanup);

function show(data: BecomeHelperPageData = becomeHelperPageData) {
  render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, publicPages }}><BecomeHelperScreen data={data} /></NextIntlClientProvider>);
}

describe('BecomeHelperScreen', () => {
  it('shows 37 remaining welcome spots and each supplied reward program', () => {
    show();
    const welcome = screen.getByRole('region', { name: 'Welcome gift card reward' });
    expect(within(welcome).getByText('37 spots left')).toBeInTheDocument();
    expect(within(welcome).getByText('$50.00 gift card for our first 100 verified helpers')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Repeat-client gift card reward' })).toBeInTheDocument();
    expect(screen.getByText('Your first payout can take about 7 days.')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('does not render either reward card or offer when programs are absent', () => {
    show(becomeHelperNoRewardsData);
    expect(screen.queryByRole('region', { name: 'Welcome gift card reward' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Repeat-client gift card reward' })).not.toBeInTheDocument();
    expect(screen.queryByText(/spots left/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Gift card rewards for helping locally' })).not.toBeInTheDocument();
    expect(screen.getByText('Rewards never depend on reviews or ratings.')).toBeInTheDocument();
    expect(screen.getByText('$54.00')).toBeInTheDocument();
  });

  it('renders repeat rewards independently and follows the supplied background-check requirement', () => {
    show({ ...becomeHelperPageData, welcomeReward: undefined, firstPayoutDays: 10, inHomeCategoriesRequireBackgroundCheck: false });
    expect(screen.queryByRole('region', { name: 'Welcome gift card reward' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Repeat-client gift card reward' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Complete a background check for in-home help' })).not.toBeInTheDocument();
    expect(screen.getByText('Your first payout can take about 10 days.')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Become a helper' })) {
      expect(link).toHaveAttribute('href', routes.signIn(routes.app.helperOnboarding()));
    }
  });
});
