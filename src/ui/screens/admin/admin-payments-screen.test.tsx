/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_MONEY_TABS, RECONCILIATION_EXCEPTIONS, routes } from '@/contracts';
import { ADMIN_NOW, adminPaymentsChargesData, adminPaymentsEmptyData, adminPaymentsExceptionsData, adminPaymentsSearchData } from '@/fixtures';
import { formatMoney } from '@/shared/format';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/adminPayments.json';
import { AdminPaymentsScreen } from './admin-payments-screen';

afterEach(cleanup);

const show = (data = adminPaymentsExceptionsData) => render(<NextIntlClientProvider locale="en" messages={uiMessages}><AdminPaymentsScreen data={data} now={ADMIN_NOW} /></NextIntlClientProvider>);

describe('AdminPaymentsScreen', () => {
  it('has copy for every tab and exception', () => {
    for (const tab of ADMIN_MONEY_TABS) expect(copy.tabs[tab]).toMatch(/\S/);
    for (const exception of RECONCILIATION_EXCEPTIONS) {
      expect(copy.exceptions[exception]).toMatch(/\S/);
      expect(copy.exceptionHelp[exception]).toMatch(/\S/);
    }
  });

  it('shows the 30-day totals and explains each exception', () => {
    show();
    expect(screen.getByText(formatMoney(adminPaymentsExceptionsData.totals!.chargedCents))).toBeInTheDocument();
    for (const row of adminPaymentsExceptionsData.rows) expect(screen.getAllByText(copy.exceptionHelp[row.exception!]).length).toBeGreaterThan(0);
  });

  it('shows support the summary: no totals (security review SEC24)', () => {
    const { totals, ...summary } = adminPaymentsExceptionsData;
    show(summary);
    expect(screen.queryByText(copy.totalsTitle)).not.toBeInTheDocument();
    expect(screen.queryByText(formatMoney(totals!.chargedCents))).not.toBeInTheDocument();
    for (const row of summary.rows) expect(screen.getAllByText(copy.exceptionHelp[row.exception!]).length).toBeGreaterThan(0);
  });

  it('keeps the search on every tab and searches with a GET form', () => {
    show(adminPaymentsSearchData);
    const tabs = within(screen.getByRole('navigation', { name: copy.tabsLabel }));
    for (const tab of ADMIN_MONEY_TABS) expect(tabs.getByRole('link', { name: new RegExp(`^${copy.tabs[tab]}`) })).toHaveAttribute('href', routes.admin.payments({ tab, q: 'maya' }));
    const form = screen.getByRole('search', { name: copy.search });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', routes.admin.payments());
  });

  it('labels statuses and links bookings and people', () => {
    show(adminPaymentsChargesData);
    expect(screen.getAllByText(copy.statuses.partially_refunded).length).toBeGreaterThan(0);
    const [first] = adminPaymentsChargesData.rows;
    expect(screen.getAllByRole('link', { name: first!.booking!.title })[0]).toHaveAttribute('href', routes.admin.booking(first!.booking!.id));
    expect(screen.getAllByRole('link', { name: first!.person.displayName })[0]).toHaveAttribute('href', routes.admin.user(first!.person.id));
  });

  it('says when nothing needs a look', () => {
    show(adminPaymentsEmptyData);
    expect(screen.getByText(copy.emptyExceptions)).toBeInTheDocument();
  });
});
