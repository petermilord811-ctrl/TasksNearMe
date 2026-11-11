/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes, type RewardsPageData } from '@/contracts';
import { fakeRewardsHandlers, REWARDS_NOW, rewardsDeliveredData, rewardsEmptyData, rewardsNotHelperData, rewardsPendingData, rewardsRedeemableData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { RewardsScreen } from './rewards-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);

function mount(data: RewardsPageData) {
  return render(<NextIntlClientProvider locale="en" messages={messages}><RewardsScreen data={data} handlers={fakeRewardsHandlers} now={REWARDS_NOW} /></NextIntlClientProvider>);
}

describe('RewardsScreen', () => {
  it('shows the supplied totals, grant order, and monthly usage', () => {
    mount(rewardsDeliveredData);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const totals = within(screen.getByLabelText('Reward totals'));
    expect(totals.getByText('$0.00')).toBeVisible();
    expect(totals.getByText('$10.00')).toBeVisible();
    expect(totals.getByText('$50.00')).toBeVisible();
    const grants = screen.getAllByRole('article');
    expect(grants).toHaveLength(2);
    expect(within(grants[0]).getByText('Repeat booking reward')).toBeVisible();
    expect(within(grants[1]).getByText('Welcome reward')).toBeVisible();
    expect(screen.getByText('$60.00 of $75.00 used')).toBeVisible();
  });

  it('exposes the supplied repeat count and deadline as an accessible progress bar', () => {
    mount(rewardsPendingData);
    const progress = screen.getByRole('progressbar', { name: '1 of 3 paid bookings with Maya R. · by Mon, Feb 15' });
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress).toHaveAttribute('aria-valuemax', '3');
    expect(progress).toHaveAttribute('aria-valuetext', '1 of 3 paid bookings with Maya R. · by Mon, Feb 15');
  });

  it('keeps program explanations tied to the supplied active programs and amounts', () => {
    mount({ ...rewardsRedeemableData, programs: rewardsRedeemableData.programs.filter((program) => program.program === 'repeat') });
    const rules = within(screen.getByRole('region', { name: 'How rewards work' }));
    expect(rules.queryByRole('heading', { name: 'Welcome reward' })).not.toBeInTheDocument();
    expect(rules.getByText('$10.00 for your third paid booking with the same client within 90 days.')).toBeVisible();
    expect(rules.getByText('Each qualifying booking must have a task price of $25.00 or more.')).toBeVisible();
    expect(rules.getByText('Rewards are gift cards, not earnings')).toBeVisible();
    expect(rules.getByRole('link', { name: 'Read rewards terms' })).toHaveAttribute('href', routes.legal('rewards-terms'));
  });

  it('gives helpers with no grants a find-work action and explains empty progress', () => {
    mount(rewardsEmptyData);
    expect(screen.getByRole('heading', { name: 'No rewards yet' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Find work' })).toHaveAttribute('href', routes.app.findWork());
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText(messages.rewards.page.repeat.empty)).toBeVisible();
  });

  it('shows onboarding when helperReady is false', () => {
    mount(rewardsNotHelperData);
    expect(screen.getByRole('link', { name: 'Set up as a helper' })).toHaveAttribute('href', routes.app.helperOnboarding());
    expect(screen.queryByLabelText('Reward totals')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Redeem gift card' })).not.toBeInTheDocument();
  });
});
