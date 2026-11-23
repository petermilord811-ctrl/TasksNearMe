/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlanHandlers, PlanPageData } from '@/contracts';
import { planAiMonthUsedUpData, planAiUsedUpData, planFreeClientData, planPastDueData, planPlusMemberData, planProCancelingData, planProMemberData, planUnavailableData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { PlanScreen } from './plan-screen';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount(data: PlanPageData, handlers: Partial<PlanHandlers> = {}) {
  const all: PlanHandlers = { onSubscribe: vi.fn(async () => ({ ok: true as const, code: 'updated' as const, redirectTo: 'https://checkout.stripe.com/c/pay/cs_test' })), onManage: vi.fn(async () => ({ ok: true as const, code: 'updated' as const, redirectTo: 'https://billing.stripe.com/p/session/test' })), ...handlers };
  render(<NextIntlClientProvider locale="en" timeZone="America/New_York" messages={messages}><PlanScreen data={data} handlers={all} /></NextIntlClientProvider>);
  return all;
}

describe('PlanScreen (completion plan 9.13)', () => {
  it('shows Starter, Plus and Pro as a ladder with their numbers, today’s AI searches and the plain terms (owner, 2026-11-23)', () => {
    mount(planFreeClientData);
    const starter = screen.getByRole('region', { name: 'Starter' });
    expect(within(starter).getByText('Your plan')).toBeVisible();
    for (const line of ['AI search: 3 a day, up to 50 a month', 'Start 3 new direct conversations a day, up to 60 as you earn Sparks', '10 saved searches, with 10 instant alerts a day']) expect(within(starter).getByText(line)).toBeVisible();
    expect(within(starter).getByText('2 AI searches left today.')).toBeVisible();
    const plus = screen.getByRole('region', { name: 'Plus' });
    expect(within(plus).getByText('$4.99 a month')).toBeVisible();
    expect(within(plus).getByText('or $39.99 a year')).toBeVisible();
    for (const line of ['Everything in Starter, and more of it', 'AI search: 5 a day, up to 150 a month', 'Start 25 new direct conversations a day', '25 saved searches, with 25 instant alerts a day']) expect(within(plus).getByText(line)).toBeVisible();
    // Only Pro waives the hold fee (owner: "Pro only no fee").
    expect(within(plus).queryByText(/No hold fee/)).not.toBeInTheDocument();
    const pro = screen.getByRole('region', { name: 'Pro' });
    for (const line of ['Everything in Plus', 'No hold fee: when a helper asks to be paid upfront, we hold your payment for free', 'Your offers shown first to clients', 'A Pro badge on your offers', 'Offer insights on every task: how many offers it has and their price range', 'Unlimited AI search', 'Start 100 new direct conversations a day', '50 saved searches, with 50 instant alerts a day']) expect(within(pro).getByText(line)).toBeVisible();
    // Nothing is paid back any more: no service fees.
    expect(screen.queryByText(/paid back|pays for itself|fee back/i)).not.toBeInTheDocument();
    expect(screen.getByText(/A plan never changes reviews, checks or the verified badge/)).toBeVisible();
    expect(screen.getByText(/Pro starts at once, and Plus stops renewing, so you never pay for both/)).toBeVisible();
    expect(screen.getByText(/No trial that turns into a charge/)).toBeVisible();
  });

  it('subscribes on Stripe’s checkout page, monthly or yearly', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location);
    const handlers = mount(planFreeClientData);
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe yearly: Pro, $59.99 a year' }));
    expect(handlers.onSubscribe).toHaveBeenCalledExactlyOnceWith({ plan: 'pro', interval: 'year' });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test'));
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe monthly: Plus, $4.99 a month' }));
    expect(handlers.onSubscribe).toHaveBeenLastCalledWith({ plan: 'plus', interval: 'month' });
  });

  it('shows a member when it renews, and opens the portal', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location);
    const handlers = mount(planPlusMemberData);
    expect(screen.getByRole('status')).toHaveTextContent('Thanks for subscribing');
    const plus = screen.getByRole('region', { name: 'Plus' });
    expect(within(plus).getByText('Your plan')).toBeVisible();
    expect(within(plus).getByText(/^Renews (\w+, )?Dec 18, 2026 at \$4\.99\.$/)).toBeVisible();
    expect(within(plus).queryByRole('button', { name: /Subscribe/ })).not.toBeInTheDocument();
    await userEvent.click(within(plus).getByRole('button', { name: 'Manage or cancel' }));
    expect(handlers.onManage).toHaveBeenCalledOnce();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://billing.stripe.com/p/session/test'));
    // Pro is the upgrade: Plus then stops renewing.
    const pro = screen.getByRole('region', { name: 'Pro' });
    expect(within(pro).getByRole('button', { name: 'Upgrade monthly: Pro, $7.99 a month' })).toBeEnabled();
    expect(within(pro).getByText("When Pro starts, your Plus stops renewing and ends with the period you've paid for.")).toBeVisible();
    expect(screen.getByText('4 AI searches left today.')).toBeVisible();
  });

  it('shows Plus as included for a Pro member, with no buttons, and unlimited AI searches', () => {
    mount(planProMemberData);
    const plus = screen.getByRole('region', { name: 'Plus' });
    expect(within(plus).getByText('Included in Pro')).toBeVisible();
    expect(within(plus).getByText('Your Pro has everything in Plus.')).toBeVisible();
    expect(within(plus).queryByRole('button')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Pro' })).getByText('Your plan')).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Starter' })).queryByText('Your plan')).not.toBeInTheDocument();
    expect(screen.getByText('Unlimited AI searches with your Pro.')).toBeVisible();
  });

  it('says when a cancelled plan ends, and when a payment failed', () => {
    mount(planProCancelingData);
    expect(screen.getByText(/^Ends (\w+, )?Mar 2, 2027 and won't renew\.$/)).toBeVisible();
    cleanup();
    mount(planPastDueData);
    expect(screen.getByText(/Your last payment didn't go through/)).toBeVisible();
  });

  it('says when AI searches are used up, today’s or this month’s, and shows the plans without buttons where they aren’t open', () => {
    mount(planAiMonthUsedUpData);
    expect(screen.getByText(/^You've used this month's AI searches\. They renew (\w+, )?Dec 1\.$/)).toBeVisible();
    cleanup();
    mount(planAiUsedUpData);
    expect(screen.getByText("You've used today's AI searches. More tomorrow.")).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('You left checkout. Nothing was charged.');
    cleanup();
    mount(planUnavailableData);
    expect(screen.getByText(/Plans aren't open yet/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Subscribe/ })).not.toBeInTheDocument();
    expect(screen.getByText(/AI search isn't available right now/)).toBeVisible();
  });

  it('shows a plan just paid for as confirming, an unpaid plan as on hold, and billing history to a former subscriber (aa’s sweep)', async () => {
    mount({ ...planFreeClientData, notice: 'subscribed', confirming: 'plus' });
    const plus = screen.getByRole('region', { name: 'Plus' });
    expect(within(plus).getByText('Confirming your Plus with Stripe. Refresh the page in a few seconds.')).toBeVisible();
    expect(within(plus).queryByRole('button', { name: /Subscribe/ })).not.toBeInTheDocument();
    cleanup();
    const handlers = mount({ ...planFreeClientData, memberships: [{ plan: 'pro', interval: 'month', priceCents: 799, status: 'unpaid', periodEnd: '2026-12-18T15:00:00.000Z', cancelAtPeriodEnd: false }] });
    const pro = screen.getByRole('region', { name: 'Pro' });
    expect(within(pro).getByText(/Your Pro is on hold until a payment goes through/)).toBeVisible();
    expect(within(pro).queryByText('Your plan')).not.toBeInTheDocument();
    await userEvent.click(within(pro).getByRole('button', { name: 'Manage or cancel' }));
    expect(handlers.onManage).toHaveBeenCalledOnce();
    cleanup();
    mount({ ...planFreeClientData, portal: true });
    expect(screen.getByRole('region', { name: 'Billing history' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open billing' })).toBeEnabled();
  });

  it('leaves the AI lines out where Claude isn’t set up', () => {
    mount(planUnavailableData);
    expect(screen.queryByText(/^AI search:|^Unlimited AI search$/)).not.toBeInTheDocument();
  });

  it('tells the person when a subscribe fails, and stays on the page', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location);
    const handlers = mount(planFreeClientData, { onSubscribe: vi.fn(async () => ({ ok: false as const, code: 'not_allowed' as const })) });
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe monthly: Plus, $4.99 a month' }));
    expect(handlers.onSubscribe).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });
});
