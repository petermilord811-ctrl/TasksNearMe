/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ADMIN_CASE_STATUS_FILTERS, ADMIN_QUEUES, CASE_PRIORITIES, CASE_TYPES, routes, type AdminCasesPageData } from '@/contracts';
import { ADMIN_NOW, adminCasesEmptyData, adminCasesFilteredData, adminCasesPageData } from '@/fixtures';
import { formatDateTime } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import adminCases from '../../../../messages/en/ui/adminCases.json';
import { AdminCasesScreen } from './admin-cases-screen';
import { AdminResponseTarget } from './admin-response-target';

afterEach(cleanup);

function renderCases(data: AdminCasesPageData = adminCasesPageData) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, adminCases }}><AdminCasesScreen data={data} now={ADMIN_NOW} /></NextIntlClientProvider>);
}

describe('AdminCasesScreen', () => {
  it('builds every filter link from the route builder while preserving the other filters', () => {
    renderCases(adminCasesFilteredData);
    const { filters } = adminCasesFilteredData;
    const queueNav = within(screen.getByRole('navigation', { name: 'Queue' }));
    for (const queue of ADMIN_QUEUES) {
      expect(queueNav.getByRole('link', { name: adminCases.queues[queue] })).toHaveAttribute('href', routes.admin.cases({ ...filters, queue }));
    }
    expect(queueNav.getByRole('link', { name: 'All queues' })).toHaveAttribute('href', routes.admin.cases({ ...filters, queue: undefined }));
    const statusNav = within(screen.getByRole('navigation', { name: 'Status' }));
    for (const status of ADMIN_CASE_STATUS_FILTERS) {
      expect(statusNav.getByRole('link', { name: adminCases.filters[status] })).toHaveAttribute('href', routes.admin.cases({ ...filters, status }));
    }
    expect(screen.getByRole('link', { name: 'Assigned to me On' })).toHaveAttribute('href', routes.admin.cases({ ...filters, mine: false }));
    expect(queueNav.getByRole('link', { name: 'Disputes' })).toHaveAttribute('aria-current', 'true');
    expect(statusNav.getByRole('link', { name: 'Active' })).toHaveAttribute('aria-current', 'true');
  });

  it('uses the supplied case order and status, priority, assignee, and reply markers', () => {
    renderCases();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const table = within(screen.getByRole('table'));
    const rows = table.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(adminCasesPageData.cases.length);
    for (const [index, item] of adminCasesPageData.cases.entries()) {
      const row = within(rows[index]);
      expect(row.getByRole('link', { name: item.subject })).toHaveAttribute('href', routes.admin.case(item.id));
      expect(row.getByText(adminCases.types[item.type])).toBeVisible();
      expect(row.getByText(`Priority: ${adminCases.priorities[item.priority]}`)).toBeVisible();
      expect(row.getByText(item.openedBy.displayName)).toBeVisible();
      expect(row.getByText(item.assignee?.displayName ?? 'Unassigned')).toBeVisible();
      expect(row.queryByText('New reply') !== null).toBe(item.awaitingReply);
    }
    expect(table.getByText('Past due 1 h')).toHaveClass('text-destructive');
    expect(table.getByText('Due in 2 h')).toBeVisible();
    expect(table.getByText('With support')).toBeVisible();
    const cards = within(screen.getByRole('region', { name: 'Case results' }).querySelector('ul')!);
    const card = cards.getByRole('link', { name: /Assemble a desk/ });
    expect(card).toHaveAccessibleName(/Priority: High/);
    expect(card).toHaveAccessibleName(/Problem report/);
    expect(card).toHaveAccessibleName(/New reply/);
  });

  it('keeps the filters available in the empty state', () => {
    renderCases(adminCasesEmptyData);
    expect(screen.getByRole('heading', { name: 'No cases match these filters' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', routes.admin.cases({ status: 'all' }));
    expect(screen.getByRole('link', { name: 'Assigned to me Off' })).toHaveAttribute('href', routes.admin.cases({ ...adminCasesEmptyData.filters, mine: true }));
  });

  it('has readable copy for every contract queue, type, priority and status filter', () => {
    for (const queue of ADMIN_QUEUES) expect(adminCases.queues[queue]).toMatch(/\S/);
    for (const type of CASE_TYPES) expect(adminCases.types[type]).toMatch(/\S/);
    for (const priority of CASE_PRIORITIES) expect(adminCases.priorities[priority]).toMatch(/\S/);
    for (const filter of ADMIN_CASE_STATUS_FILTERS) expect(adminCases.filters[filter]).toMatch(/\S/);
  });
});

describe('AdminResponseTarget', () => {
  it('shows the absolute target and trusts the supplied breach flag', () => {
    const dueAt = adminCasesPageData.cases[0].slaDueAt!;
    render(<NextIntlClientProvider locale="en" messages={{ ...messages, adminCases }}><AdminResponseTarget slaDueAt={dueAt} slaBreached={false} now={ADMIN_NOW} /></NextIntlClientProvider>);
    expect(screen.getByText(formatDateTime(dueAt))).toHaveAttribute('dateTime', dueAt);
    expect(screen.getByText('Due in 1 h')).not.toHaveClass('text-destructive');
    expect(screen.queryByText(/Past due/)).not.toBeInTheDocument();
  });
});
