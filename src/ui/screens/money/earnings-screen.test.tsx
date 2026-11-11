/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, EARNINGS_KINDS, EARNINGS_STATUSES, PAYOUT_ACCOUNT_STATUSES, PAYOUT_STATUSES, routes, type ActionResult, type EarningsHandlers, type EarningsPageData } from '@/contracts';
import { earningsEmptyData, earningsFirstPayoutData, fakeEarningsHandlers, fakeHandler, jordanEarningsActionNeededData, jordanEarningsPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import earnings from '../../../../messages/en/ui/earnings.json';
import { EarningsScreen } from './earnings-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const now = '2026-11-30T18:00:00.000Z';

function mount(data: EarningsPageData = jordanEarningsPageData, handlers: EarningsHandlers = fakeEarningsHandlers) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, earnings }}><EarningsScreen data={data} handlers={handlers} now={now} /></NextIntlClientProvider>);
}

describe('EarningsScreen', () => {
  it('shows supplied totals, every transfer kind, client, amount, status and booking links', () => {
    mount();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const totals = within(screen.getByLabelText(earnings.totals.label));
    expect(totals.getByText('$75.00')).toBeVisible();
    expect(totals.getByText('$110.25')).toBeVisible();
    expect(totals.getByText('$62.00')).toBeVisible();
    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(jordanEarningsPageData.rows.length);
    jordanEarningsPageData.rows.forEach((row, index) => {
      const article = within(articles[index]);
      expect(article.getByText(earnings.kinds[row.kind])).toBeVisible();
      expect(article.getByText(`Client: ${row.client.displayName}`)).toBeVisible();
      expect(article.getByText(messages.status.earnings[row.status])).toBeVisible();
      expect(article.getByRole('link', { name: row.title })).toHaveAttribute('href', routes.app.booking(row.bookingId));
    });
    expect(screen.getByText('Arrives Tue, Dec 1 · •••• 6789')).toBeVisible();
    expect(screen.getAllByText('Paid Wed, Nov 25 · •••• 6789')).toHaveLength(2);
    expect(screen.getByText('Payouts go to •••• 6789')).toBeVisible();
    expect(screen.queryByText('po_1127')).not.toBeInTheDocument();
  });

  it.each(['dispute', 'payout_account'] as const)('explains the %s hold reason', (holdReason) => {
    mount({ ...jordanEarningsPageData, rows: [{ ...jordanEarningsPageData.rows[0], holdReason }] });
    expect(screen.getByText(earnings.holdReasons[holdReason])).toBeVisible();
  });

  it.each(PAYOUT_STATUSES)('shows the %s payout status without treating a failed or canceled payout as arriving', (status) => {
    const row = jordanEarningsPageData.rows[2];
    mount({ ...jordanEarningsPageData, rows: [{ ...row, payout: { ...row.payout!, status } }] });
    expect(screen.getByText(earnings.payout[status])).toBeVisible();
    if (status === 'failed' || status === 'canceled') {
      expect(screen.getByText('Bank account •••• 6789')).toBeVisible();
      expect(screen.queryByText(/^Arrives /)).not.toBeInTheDocument();
      expect(screen.queryByText(/^Paid Tue/)).not.toBeInTheDocument();
    }
  });

  it('uses the supplied calendar date across daylight saving time', () => {
    const row = jordanEarningsPageData.rows[2];
    mount({ ...jordanEarningsPageData, rows: [{ ...row, payout: { ...row.payout!, arrivalDate: '2026-07-01' } }] });
    expect(screen.getByText('Arrives Wed, Jul 1 · •••• 6789')).toBeVisible();
  });

  it.each(PAYOUT_ACCOUNT_STATUSES)('labels the %s payout account', (status) => {
    mount({ ...earningsEmptyData, payoutAccount: { status, actionNeeded: false } });
    expect(screen.getByText(earnings.account.statuses[status])).toBeVisible();
    expect(screen.getByText(earnings.account.noBank)).toBeVisible();
  });

  it('shows the first payout notice only when supplied', () => {
    const { unmount } = mount(earningsFirstPayoutData);
    expect(screen.getByText(earnings.firstPayoutNotice)).toBeVisible();
    unmount();
    mount(jordanEarningsPageData);
    expect(screen.queryByText(earnings.firstPayoutNotice)).not.toBeInTheDocument();
  });

  it('provides a find-work link when there are no earnings', () => {
    mount(earningsEmptyData);
    expect(screen.getByRole('heading', { name: 'No earnings yet' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Find work' })).toHaveAttribute('href', routes.app.findWork());
  });

  it('opens the payout dashboard from the action-needed alert and follows the returned destination', async () => {
    const redirectTo = routes.app.helperOnboarding('payout');
    const onOpenPayoutDashboard = vi.fn(fakeHandler<void>({ ok: true, code: 'updated', redirectTo }, 0));
    mount(jordanEarningsActionNeededData, { onOpenPayoutDashboard });
    const alert = within(screen.getByRole('alert'));
    expect(alert.getByText(earnings.actionNeeded)).toBeVisible();
    await userEvent.click(alert.getByRole('button', { name: 'Update bank details' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(redirectTo));
    expect(onOpenPayoutDashboard).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByText('Payout failed')).toBeVisible();
  });

  it('locks repeat clicks and announces the pending and successful result', async () => {
    let resolve!: (result: ActionResult) => void;
    const onOpenPayoutDashboard = vi.fn(() => new Promise<ActionResult>((done) => { resolve = done; }));
    mount(jordanEarningsPageData, { onOpenPayoutDashboard });
    const button = screen.getByRole('button', { name: 'Payout dashboard' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onOpenPayoutDashboard).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent(earnings.openingDashboard);
    await act(async () => resolve({ ok: true, code: 'updated' }));
    expect(button).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(earnings.dashboardReady);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each(ACTION_ERROR_CODES)('shows a friendly %s error and allows retry', async (code) => {
    const onOpenPayoutDashboard = vi.fn(fakeHandler<void>({ ok: false, code }, 0));
    mount(jordanEarningsPageData, { onOpenPayoutDashboard });
    await userEvent.click(screen.getByRole('button', { name: 'Payout dashboard' }));
    const expected = code === 'not_allowed' ? earnings.dashboardNotAllowed : messages.feedback.error[code];
    expect(await screen.findByText(expected)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Payout dashboard' })).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: messages.forms.getHelp })).toHaveAttribute('href', routes.help());
  });

  it('handles a rejected handler without navigation', async () => {
    mount(jordanEarningsPageData, { onOpenPayoutDashboard: vi.fn().mockRejectedValue(new Error('Provider unavailable')) });
    await userEvent.click(screen.getByRole('button', { name: 'Payout dashboard' }));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('has copy for every earnings kind, earnings status, payout status, account status, and hold reason', () => {
    for (const kind of EARNINGS_KINDS) expect(earnings.kinds[kind]).toBeTruthy();
    for (const status of EARNINGS_STATUSES) expect(messages.status.earnings[status]).toBeTruthy();
    for (const status of PAYOUT_STATUSES) expect(earnings.payout[status]).toBeTruthy();
    for (const status of PAYOUT_ACCOUNT_STATUSES) expect(earnings.account.statuses[status]).toBeTruthy();
    for (const reason of ['dispute', 'payout_account'] as const) expect(earnings.holdReasons[reason]).toBeTruthy();
  });
});
