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
  it('leads with the welcome gift card for every helper who passes the three checks, then each reward program', () => {
    show();
    const band = screen.getByRole('region', { name: 'Get verified, get a $50 gift card' });
    expect(within(band).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['1Verify your phone', '2Verify your ID', '3Pass a background check']);
    expect(within(band).getByRole('link', { name: 'Start and earn $50' })).toHaveAttribute('href', routes.signIn(routes.app.helperOnboarding()));
    expect(screen.queryByText(/spots? left/)).not.toBeInTheDocument();
    // Told once, at the top: the rewards section lists only the other program (audit M47).
    expect(screen.queryByRole('region', { name: 'Welcome gift card' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Get verified, get a $50 gift card')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Repeat-client gift card reward' })).toBeInTheDocument();
    expect(screen.getByText('Your first payout can take about 7 days.')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('does not render either reward card or offer when programs are absent', () => {
    show(becomeHelperNoRewardsData);
    expect(screen.queryByRole('region', { name: 'Welcome gift card' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Get verified/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Repeat-client gift card reward' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Gift card rewards for helping locally' })).not.toBeInTheDocument();
    expect(screen.getByText('Rewards never depend on reviews or ratings.')).toBeInTheDocument();
    expect(screen.getByText('$54.00')).toBeInTheDocument();
  });

  it('renders repeat rewards independently and follows the supplied background-check requirement', () => {
    show({ ...becomeHelperPageData, welcomeReward: undefined, firstPayoutDays: 10, inHomeCategoriesRequireBackgroundCheck: false });
    expect(screen.queryByRole('region', { name: 'Welcome gift card' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Repeat-client gift card reward' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Complete a background check for in-home help' })).not.toBeInTheDocument();
    expect(screen.getByText('Your first payout can take about 10 days.')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Become a helper' })) {
      expect(link).toHaveAttribute('href', routes.signIn(routes.app.helperOnboarding()));
    }
  });

  it('shows each reward program\'s supplied minimum and redemption timing', () => {
    show({
      ...becomeHelperPageData,
      welcomeReward: { ...becomeHelperPageData.welcomeReward!, redeemWithinDays: 30 },
      repeatReward: { ...becomeHelperPageData.repeatReward!, unlockDays: 5, redeemWithinDays: 45 },
    });
    const welcome = screen.getByRole('region', { name: 'Get verified, get a $50 gift card' });
    expect(within(welcome).getByText(/quick check/)).toHaveTextContent('Redeem within 30 days. One welcome gift card per person.');
    const repeat = screen.getByRole('region', { name: 'Repeat-client gift card reward' });
    expect(within(repeat).getByText(/3rd paid booking of \$25\.00 or more/)).toHaveTextContent('within 90 days');
    expect(within(repeat).getByText(/unlocks 5 days/)).toHaveTextContent('Redeem within 45 days of unlocking.');
  });
});
