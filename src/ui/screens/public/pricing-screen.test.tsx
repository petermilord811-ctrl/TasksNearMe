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

describe('PricingScreen (no service fees, 2026-11-23; the plans as a ladder the same day)', () => {
  it('shows the two ways to pay, worked out on the fee engine’s $60 desk', () => {
    show();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'No service fees' })).toBeInTheDocument();
    const direct = screen.getByRole('region', { name: 'Pay directly' });
    expect(within(direct).getByText('$0')).toBeInTheDocument();
    expect(within(direct).getByText('A $60.00 desk: you pay your helper $60.00. Nothing goes through TasksNearMe.')).toBeInTheDocument();
    const held = screen.getByRole('region', { name: 'Held by TasksNearMe' });
    expect(within(held).getByText('5%')).toBeInTheDocument();
    expect(within(held).getByText('hold fee, paid by the client (at least $1.00); free with Pro')).toBeInTheDocument();
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

  it('lists Starter, Plus and Pro as a ladder with their numbers, and compares them row by row (owner, 2026-11-23)', () => {
    show(pricingWithPlansData);
    const starter = screen.getByRole('region', { name: 'Starter' });
    for (const line of ['AI search: 3 a day, up to 50 a month', 'Start 3 new direct conversations a day, up to 60 as you earn Sparks', '10 saved searches, with 10 instant alerts a day']) expect(within(starter).getByText(line)).toBeInTheDocument();
    expect(within(starter).getByRole('link', { name: 'Sign up free' })).toHaveAttribute('href', routes.signUp());
    const plus = screen.getByRole('region', { name: 'Plus' });
    expect(within(plus).getByText('$4.99')).toBeInTheDocument();
    for (const line of ['Everything in Starter, and more of it', 'AI search: 5 a day, up to 150 a month', 'Start 25 new direct conversations a day', '25 saved searches, with 25 instant alerts a day']) expect(within(plus).getByText(line)).toBeInTheDocument();
    // Only Pro waives the hold fee (owner: "Pro only no fee").
    expect(within(plus).queryByText(/No hold fee/)).not.toBeInTheDocument();
    expect(within(plus).getByRole('link', { name: 'Get Plus' })).toHaveAttribute('href', routes.app.plan());
    const pro = screen.getByRole('region', { name: 'Pro' });
    expect(within(pro).getByText('$7.99')).toBeInTheDocument();
    for (const line of ['Everything in Plus', 'No hold fee: we hold your upfront payments for free', 'Your offers shown first to clients', 'A Pro badge on your offers', 'Offer insights on every task: how many offers and their price range', 'Unlimited AI search', 'Start 100 new direct conversations a day', '50 saved searches, with 50 instant alerts a day']) expect(within(pro).getByText(line)).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['What you get', 'Starter', 'Plus', 'Pro']);
    const cells = (name: RegExp) => within(within(table).getByRole('row', { name })).getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells(/^Service fees/)).toEqual(['None', 'None', 'None']);
    expect(cells(/^Hold fee on upfront payments/)).toEqual(['5%', '5%', 'Free']);
    expect(cells(/^AI search/)).toEqual(['3 a day, 50 a month', '5 a day, 150 a month', 'Unlimited']);
    expect(cells(/^New direct conversations a day/)).toEqual(['3 (up to 60 with Sparks)', '25', '100']);
    expect(cells(/^Messages before they answer/)).toEqual(['3', '3', '3']);
    expect(cells(/^Saved searches/)).toEqual(['10', '25', '50']);
    expect(cells(/^Instant alerts a day/)).toEqual(['10', '25', '50']);
    expect(within(within(table).getByRole('row', { name: /^Offers shown first/ })).getAllByRole('cell').map((cell) => cell.firstElementChild?.getAttribute('aria-label'))).toEqual(['Not included', 'Not included', 'Included']);
  });

  it('describes the direct message limits: new conversations a day by tier, the first messages, and what stays private', () => {
    show(pricingWithPlansData);
    const messages = screen.getByRole('region', { name: 'Direct messages' });
    expect(within(messages).getByText(/You can start 3 new conversations a day on Starter \(up to 60 as you earn Sparks\), 25 on Plus and 100 on Pro\./)).toBeInTheDocument();
    expect(within(messages).getByText('Until the other person answers, you can send up to 3 messages. Once they answer, keep the conversation going.')).toBeInTheDocument();
    expect(within(messages).getByText(/Only new conversations count/)).toBeInTheDocument();
    expect(within(messages).getByText(/anyone, only people they've talked with about a task, or nobody/)).toBeInTheDocument();
    expect(within(messages).getByText('Phone numbers and emails stay hidden until you\'ve booked together.')).toBeInTheDocument();
    cleanup();
    // Where the plans aren't open, only Starter's.
    show();
    expect(within(screen.getByRole('region', { name: 'Direct messages' })).getByText(/You can start 3 new conversations a day, up to 60 as you earn Sparks\./)).toBeInTheDocument();
  });

  it('leaves the plans out where subscribing isn’t open', () => {
    show();
    expect(screen.queryByRole('region', { name: 'Plus' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('answers the common questions in closed disclosures, and ends with a way to post a task', () => {
    const { container } = show();
    const disclosures = [...container.querySelectorAll('details')];
    expect(disclosures.map((details) => details.querySelector('summary')?.textContent)).toEqual((['why', 'which', 'safe', 'when', 'fee', 'aiSearch', 'cancelPlan'] as const).map((key) => publicPages.pricing.faq[key].q));
    expect(screen.getByText(/Starter has 3 a day, up to 50 a month; Plus has more, and Pro has no limit/)).toBeInTheDocument();
    expect(disclosures.every((details) => !details.open)).toBe(true);
    expect(screen.getByRole('link', { name: 'Cancellation policy' })).toHaveAttribute('href', routes.legal('cancellation-policy'));
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', routes.app.newTask());
  });
});
