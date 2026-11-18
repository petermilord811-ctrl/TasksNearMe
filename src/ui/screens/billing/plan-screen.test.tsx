/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlanHandlers, PlanPageData } from '@/contracts';
import { planAiUsedUpData, planFreeClientData, planPastDueData, planPlusMemberData, planProCancelingData, planUnavailableData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { PlanScreen } from './plan-screen';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount(data: PlanPageData, handlers: Partial<PlanHandlers> = {}) {
  const all: PlanHandlers = { onSubscribe: vi.fn(async () => ({ ok: true as const, code: 'updated' as const, redirectTo: 'https://checkout.stripe.com/c/pay/cs_test' })), onManage: vi.fn(async () => ({ ok: true as const, code: 'updated' as const, redirectTo: 'https://billing.stripe.com/p/session/test' })), ...handlers };
  render(<NextIntlClientProvider locale="en" timeZone="America/New_York" messages={messages}><PlanScreen data={data} handlers={all} /></NextIntlClientProvider>);
  return all;
}

describe('PlanScreen (completion plan 9.13)', () => {
  it('shows both plans with their prices, the capped money back, AI searches, the break-even and an honest estimate', () => {
    mount(planFreeClientData);
    const plus = screen.getByRole('region', { name: 'Plus' });
    expect(within(plus).getByText('$4.99 a month')).toBeVisible();
    expect(within(plus).getByText('or $39.99 a year')).toBeVisible();
    expect(within(plus).getByText('50% of the client service fee back on every completed booking, up to $15 a month')).toBeVisible();
    expect(within(plus).getByText(/100 AI searches a month/)).toBeVisible();
    expect(within(plus).getByText('Pays for itself when you book about $100 of tasks a month.')).toBeVisible();
    expect(within(plus).getByText('On your 2 bookings in the last 30 days, Plus would have paid back $6.50.')).toBeVisible();
    const pro = screen.getByRole('region', { name: 'Pro' });
    expect(within(pro).getByText('50% of the helper fee back on every completed booking, up to $40 a month')).toBeVisible();
    expect(within(pro).getByText('Pays for itself when you earn about $160 a month.')).toBeVisible();
    // The free side and the plain terms.
    expect(screen.getByText(/You also get 5 AI searches a month/)).toBeVisible();
    expect(screen.getByText(/^3 AI searches left this month\. They renew (\w+, )?Dec 1\.$/)).toBeVisible();
    expect(screen.getByText(/A plan never moves you up in lists or adds a badge/)).toBeVisible();
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

  it('shows a member when it renews, what it paid back this month, and opens the portal', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location);
    const handlers = mount(planPlusMemberData);
    expect(screen.getByRole('status')).toHaveTextContent('Thanks for subscribing');
    const plus = screen.getByRole('region', { name: 'Plus' });
    expect(within(plus).getByText('Your plan')).toBeVisible();
    expect(within(plus).getByText(/^Renews (\w+, )?Dec 18, 2026 at \$4\.99\.$/)).toBeVisible();
    expect(within(plus).getByText('Paid back this month: $6.50 of $15.')).toBeVisible();
    expect(within(plus).queryByRole('button', { name: /Subscribe/ })).not.toBeInTheDocument();
    await userEvent.click(within(plus).getByRole('button', { name: 'Manage or cancel' }));
    expect(handlers.onManage).toHaveBeenCalledOnce();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://billing.stripe.com/p/session/test'));
    // The other plan can still be added.
    expect(within(screen.getByRole('region', { name: 'Pro' })).getByRole('button', { name: 'Subscribe monthly: Pro, $7.99 a month' })).toBeEnabled();
  });

  it('says when a cancelled plan ends, and when a payment failed', () => {
    mount(planProCancelingData);
    expect(screen.getByText(/^Ends (\w+, )?Mar 2, 2027 and won't renew\.$/)).toBeVisible();
    expect(screen.getByText('Paid back this month: $40 of $40.')).toBeVisible();
    cleanup();
    mount(planPastDueData);
    expect(screen.getByText(/Your last payment didn't go through/)).toBeVisible();
  });

  it('says when AI searches are used up, and shows the plans without buttons where they aren’t open', () => {
    mount(planAiUsedUpData);
    expect(screen.getByText(/^No AI searches left this month\. They renew (\w+, )?Dec 1\.$/)).toBeVisible();
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
    const handlers = mount({ ...planFreeClientData, memberships: [{ plan: 'pro', interval: 'month', priceCents: 799, status: 'unpaid', periodEnd: '2026-12-18T15:00:00.000Z', cancelAtPeriodEnd: false, rebatedThisMonthCents: 0 }] });
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
    expect(screen.queryByText(/AI searches a month: describe/)).not.toBeInTheDocument();
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
