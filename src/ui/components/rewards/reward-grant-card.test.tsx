/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, REWARD_PROGRAM_CODES, REWARD_STATUSES, REWARD_VOID_REASONS, routes, type ActionResult, type RewardGrantView, type RewardsHandlers } from '@/contracts';
import { fakeHandler, fakeRewardsHandlers, REWARDS_NOW, rewardGrantsByStatus, rewardsRedeemableData } from '@/fixtures';
import { formatDate, formatDateTime, formatMoney } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import rewards from '../../../../messages/en/ui/rewards.json';
import { RewardGrantCard } from './reward-grant-card';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const redeemable = rewardsRedeemableData.grants[0];

function mount(grant: RewardGrantView = redeemable, onRedeem: RewardsHandlers['onRedeem'] = fakeRewardsHandlers.onRedeem) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, rewards }}><RewardGrantCard grant={grant} now={REWARDS_NOW} onRedeem={onRedeem} /></NextIntlClientProvider>);
}

describe('RewardGrantCard', () => {
  it('shows the supplied amount, program, booking destination, status, and expiry in Central time', () => {
    mount();
    expect(screen.getByRole('heading', { name: rewards.programs.welcome })).toBeVisible();
    expect(screen.getByText(formatMoney(redeemable.amountCents))).toBeVisible();
    expect(screen.getByRole('link', { name: redeemable.booking!.title })).toHaveAttribute('href', routes.app.booking(redeemable.booking!.id));
    expect(screen.getByText(messages.status.reward.redeemable)).toBeVisible();
    expect(screen.getByText(`Redeem by ${formatDate(redeemable.expiresAt!)}`)).toHaveAttribute('dateTime', redeemable.expiresAt);
  });

  it('shows the client for relationship rewards', () => {
    const repeat = rewardsRedeemableData.grants[1];
    mount(repeat);
    expect(screen.getByText(`With ${repeat.clientDisplayName}`)).toBeVisible();
    expect(screen.queryByRole('link', { name: repeat.booking!.title })).not.toBeInTheDocument();
  });

  it('calls redeem once, disables repeat clicks while pending, announces success and refreshes', async () => {
    let resolve!: (result: ActionResult) => void;
    const onRedeem = vi.fn(() => new Promise<ActionResult>((done) => { resolve = done; }));
    mount(redeemable, onRedeem);
    const button = screen.getByRole('button', { name: rewards.actions.redeem });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onRedeem).toHaveBeenCalledExactlyOnceWith({ grantId: redeemable.id });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent(rewards.redeem.pending);
    expect(button.querySelector('svg')).toBeInTheDocument();
    await act(async () => resolve({ ok: true, code: 'submitted' }));
    expect(screen.getByRole('status')).toHaveTextContent(rewards.redeem.submitted);
    expect(screen.getByRole('status').parentElement).toHaveAttribute('aria-live', 'polite');
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('follows a returned redirect', async () => {
    const redirectTo = routes.app.rewards();
    mount(redeemable, fakeHandler({ ok: true, code: 'submitted', redirectTo }, 0));
    await userEvent.click(screen.getByRole('button', { name: rewards.actions.redeem }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(redirectTo));
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it.each(ACTION_ERROR_CODES)('announces the %s error with retry and support available', async (code) => {
    const onRedeem = vi.fn(fakeHandler<{ grantId: string }>({ ok: false, code }, 0));
    mount(redeemable, onRedeem);
    await userEvent.click(screen.getByRole('button', { name: rewards.actions.redeem }));
    const expected = code === 'not_allowed' || code === 'rate_limited' || code === 'unknown'
      ? rewards.redeem[code]
      : messages.feedback.error[code];
    expect(await screen.findByText(expected)).toBeVisible();
    expect(screen.getByRole('button', { name: rewards.actions.redeem })).toBeEnabled();
    expect(screen.getByRole('link', { name: messages.forms.getHelp })).toHaveAttribute('href', routes.help());
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('shows the retry time for a rate limit', async () => {
    mount(redeemable, fakeHandler({ ok: false, code: 'rate_limited', retryAt: REWARDS_NOW }, 0));
    await userEvent.click(screen.getByRole('button', { name: rewards.actions.redeem }));
    expect(await screen.findByText(`Try again after ${formatDateTime(REWARDS_NOW)} (Central time).`)).toBeVisible();
  });

  it('shows validation feedback even if a handler unexpectedly returns field errors', async () => {
    mount(redeemable, fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { grantId: ['invalid'] } }, 0));
    await userEvent.click(screen.getByRole('button', { name: rewards.actions.redeem }));
    expect(await screen.findByText(messages.feedback.error.validation_failed)).toBeVisible();
  });

  it('handles a rejected request and lets the user try again', async () => {
    const onRedeem = vi.fn().mockRejectedValueOnce(new Error('Provider unavailable')).mockResolvedValueOnce({ ok: true, code: 'submitted' });
    mount(redeemable, onRedeem);
    await userEvent.click(screen.getByRole('button', { name: rewards.actions.redeem }));
    expect(await screen.findByText(rewards.redeem.unknown)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: rewards.actions.redeem }));
    expect(await screen.findByText(rewards.redeem.submitted)).toBeVisible();
    expect(onRedeem).toHaveBeenCalledTimes(2);
  });

  it('does not infer actions from the reward status or a delivery URL', () => {
    mount({ ...redeemable, actions: [], deliveryUrl: rewardGrantsByStatus[5].deliveryUrl });
    expect(screen.queryByRole('button', { name: rewards.actions.redeem })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open gift card/ })).not.toBeInTheDocument();
  });

  it('renders only the supplied actions in their supplied order, independent of status', () => {
    const deliveryUrl = rewardGrantsByStatus[5].deliveryUrl!;
    mount({ ...redeemable, status: 'pending', actions: ['open_gift_card', 'redeem'], deliveryUrl });
    const card = within(screen.getByRole('article'));
    const giftLink = card.getByRole('link', { name: 'Open gift card (opens in a new tab)' });
    expect(giftLink).toHaveAttribute('href', deliveryUrl);
    expect(giftLink).toHaveAttribute('target', '_blank');
    expect(giftLink).toHaveAttribute('rel', 'noopener noreferrer');
    const redeemButton = card.getByRole('button', { name: rewards.actions.redeem });
    expect(giftLink.compareDocumentPosition(redeemButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps an open action visible with an explanation if its delivery URL is missing', () => {
    mount({ ...redeemable, actions: ['open_gift_card'], deliveryUrl: undefined });
    const button = screen.getByRole('button', { name: rewards.actions.open_gift_card });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(rewards.card.deliveryUnavailable);
    expect(screen.queryByRole('link', { name: /Open gift card/ })).not.toBeInTheDocument();
  });

  it.each(rewardGrantsByStatus)('renders supplied $status details without advancing the reward state', (grant) => {
    mount(grant);
    const expectedBadge = grant.status === 'qualified'
      ? `Unlocking ${formatDateTime(grant.holdUntil!)}`
      : messages.status.reward[grant.status];
    expect(screen.getByText(expectedBadge)).toBeVisible();
    const expectedDetail = grant.status === 'qualified'
      ? `Ready on ${formatDate(grant.holdUntil!)}`
      : grant.status === 'redeemable'
        ? `Redeem by ${formatDate(grant.expiresAt!)}`
        : grant.status === 'expired'
          ? `Expired on ${formatDate(grant.expiresAt!)}`
          : grant.status === 'voided'
            ? rewards.voidReasons[grant.voidReason!]
            : rewards.statusDetails[grant.status];
    expect(screen.getByText(expectedDetail)).toBeVisible();
  });

  it.each(REWARD_VOID_REASONS)('explains the %s void reason', (voidReason) => {
    mount({ ...redeemable, status: 'voided', voidReason, actions: [] });
    expect(screen.getByText(rewards.voidReasons[voidReason])).toBeVisible();
  });

  it('has copy for every status, program, void reason, and helper action', () => {
    for (const status of REWARD_STATUSES) {
      expect(messages.status.reward[status]).toBeTruthy();
      expect(rewards.statusDetails[status]).toBeTruthy();
    }
    for (const program of REWARD_PROGRAM_CODES) expect(rewards.programs[program]).toBeTruthy();
    for (const reason of REWARD_VOID_REASONS) expect(rewards.voidReasons[reason]).toBeTruthy();
    for (const action of ['redeem', 'open_gift_card'] as const) expect(rewards.actions[action]).toBeTruthy();
  });
});
