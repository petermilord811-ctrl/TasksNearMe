/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import type { PricingPageData } from '@/contracts';
import { routes } from '@/contracts/routes';
import { pricingPageData, pricingWithPlansData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import publicPages from '../../../../messages/en/ui/publicPages.json';
import { PricingScreen } from './pricing-screen';

afterEach(cleanup);

function show(data: PricingPageData = pricingPageData) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, publicPages }}><PricingScreen data={data} /></NextIntlClientProvider>);
}

describe('PricingScreen (no service fees, 2026-11-23)', () => {
  it('shows the two ways to pay, worked out on the fee engine’s $60 desk', () => {
    show();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'No service fees' })).toBeInTheDocument();
    const direct = screen.getByRole('region', { name: 'Pay directly' });
    expect(within(direct).getByText('$0')).toBeInTheDocument();
    expect(within(direct).getByText('A $60.00 desk: you pay your helper $60.00. Nothing goes through TasksNearMe.')).toBeInTheDocument();
    const held = screen.getByRole('region', { name: 'Held by TasksNearMe' });
    expect(within(held).getByText('5%')).toBeInTheDocument();
    expect(within(held).getByText('hold fee, paid by the client (at least $1.00); free with Plus')).toBeInTheDocument();
    expect(within(held).getByText('A $60.00 desk: you pay $63.00 ($60.00 + $3.00 hold fee), and your helper gets $60.00.')).toBeInTheDocument();
    // Nothing is taken from a helper anywhere on the page.
    expect(screen.queryByText(/helper fee|service fee of/i)).not.toBeInTheDocument();
  });

  it('follows the published policy: the hold fee, its minimum, the approval timer and the cancellation terms', () => {
    show({ ...pricingPageData, holdFee: { percent: 4, minimumCents: 200 }, cancellation: { freeUntilHours: 36, lateFeePercent: 15, lateFeeMinimumCents: 900 }, timers: { autoApproveHours: 60 } });
    const held = screen.getByRole('region', { name: 'Held by TasksNearMe' });
    expect(within(held).getByText('4%')).toBeInTheDocument();
    expect(within(held).getByText(/at least \$2\.00/)).toBeInTheDocument();
    expect(screen.getByText(/No answer within 60 hours counts as done/)).toBeInTheDocument();
    expect(screen.getByText(/Cancel for free until 36 hours before the start/)).toHaveTextContent('your helper gets 15% of the price (at least $9.00)');
  });

  it('lists Free, Plus and Pro with what each adds, and compares them row by row', () => {
    show(pricingWithPlansData);
    const plus = screen.getByRole('region', { name: 'Plus' });
    expect(within(plus).getByText('$4.99')).toBeInTheDocument();
    expect(within(plus).getByText('No hold fee: we hold your upfront payments for free')).toBeInTheDocument();
    expect(within(plus).getByRole('link', { name: 'Get Plus' })).toHaveAttribute('href', routes.app.plan());
    const pro = screen.getByRole('region', { name: 'Pro' });
    expect(within(pro).getByText('$7.99')).toBeInTheDocument();
    for (const benefit of ['Your offers shown first to clients', 'A Pro badge on your offers', 'Offer insights on every task: how many offers and their price range']) expect(within(pro).getByText(benefit)).toBeInTheDocument();
    const free = screen.getByRole('region', { name: 'Free' });
    expect(within(free).getByText('5 AI searches a month')).toBeInTheDocument();
    expect(within(free).getByRole('link', { name: 'Sign up free' })).toHaveAttribute('href', routes.signUp());
    const table = screen.getByRole('table');
    const cells = (name: RegExp) => within(within(table).getByRole('row', { name })).getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells(/^Service fees/)).toEqual(['None', 'None', 'None']);
    expect(cells(/^Hold fee on upfront payments/)).toEqual(['5%', 'Free', '5%']);
    expect(cells(/^AI searches a month/)).toEqual(['5', '100', '100']);
  });

  it('leaves the plans out where subscribing isn’t open', () => {
    show();
    expect(screen.queryByRole('region', { name: 'Plus' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('answers the common questions in closed disclosures, and ends with a way to post a task', () => {
    const { container } = show();
    const disclosures = [...container.querySelectorAll('details')];
    expect(disclosures.map((details) => details.querySelector('summary')?.textContent)).toEqual((['why', 'safe', 'when', 'fee', 'cancelPlan'] as const).map((key) => publicPages.pricing.faq[key].q));
    expect(disclosures.every((details) => !details.open)).toBe(true);
    expect(screen.getByRole('link', { name: 'Cancellation policy' })).toHaveAttribute('href', routes.legal('cancellation-policy'));
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', routes.app.newTask());
  });
});
