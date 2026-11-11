/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { routes, STAFF_ROLES, type AdminUsersPageData } from '@/contracts';
import { ADMIN_NOW, adminUsersData, adminUsersEmptyData, adminUsersSearchData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import adminUsers from '../../../../messages/en/ui/adminUsers.json';
import { AdminUsersScreen } from './admin-users-screen';

afterEach(cleanup);
function mount(data: AdminUsersPageData = adminUsersData) { render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, adminUsers }}><AdminUsersScreen data={data} now={ADMIN_NOW} /></NextIntlClientProvider>); }

describe('AdminUsersScreen', () => {
  it('uses a native GET search, preserves q, and leaves search available when empty', () => {
    mount(adminUsersSearchData);
    const form = screen.getByRole('search', { name: adminUsers.search });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', routes.admin.users(adminUsersSearchData.query));
    expect(screen.getByRole('searchbox', { name: adminUsers.search })).toHaveAttribute('name', 'q');
    expect(screen.getByRole('searchbox')).toHaveValue('jor');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows supplied people in order with their email, status, counts and route', () => {
    mount();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    for (const [index, person] of adminUsersData.rows.entries()) {
      const row = within(rows[index]);
      expect(row.getByRole('link', { name: new RegExp(person.person.displayName) })).toHaveAttribute('href', routes.admin.user(person.id));
      expect(row.getByText(person.email)).toBeInTheDocument();
      expect(row.getByText(adminUsers.helperStatuses[person.helperStatus])).toBeInTheDocument();
      expect(rows[index].querySelectorAll('td')[3]).toHaveTextContent(String(person.openCases));
      expect(rows[index].querySelectorAll('td')[4]).toHaveTextContent(String(person.strikes));
    }
  });

  it('provides a clear search link when no one matches', () => {
    mount(adminUsersEmptyData);
    expect(screen.getByRole('heading', { name: adminUsers.emptyTitle })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: adminUsers.clearSearch })).toHaveAttribute('href', routes.admin.users());
    expect(screen.getByRole('searchbox')).toHaveValue('nobody');
  });

  it('shows staff role labels and has a readable label for every helper status', () => {
    mount({ ...adminUsersSearchData, rows: [{ ...adminUsersSearchData.rows[0], roles: [...STAFF_ROLES] }] });
    const table = within(screen.getByRole('table'));
    for (const role of STAFF_ROLES) expect(table.getByText(uiMessages.shell.roles[role])).toBeInTheDocument();
    for (const status of ['none', 'draft', 'active', 'paused', 'suspended'] as const) expect(adminUsers.helperStatuses[status]).toMatch(/\S/);
  });
});
