/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ADMIN_QUEUES, routes, type AdminHomeData } from '@/contracts';
import { ADMIN_NOW, adminHomeData, adminHomeQuietData } from '@/fixtures';
import { formatDateTime } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import adminHome from '../../../../messages/en/ui/adminHome.json';
import adminCases from '../../../../messages/en/ui/adminCases.json';
import { AdminHomeScreen } from './admin-home-screen';

afterEach(cleanup);

function renderHome(data: AdminHomeData = adminHomeData) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, adminHome, adminCases }}><AdminHomeScreen data={data} now={ADMIN_NOW} /></NextIntlClientProvider>);
}

describe('AdminHomeScreen', () => {
  it('links each queue to active cases and preserves supplied counts and response breaches', () => {
    renderHome();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const queue of ADMIN_QUEUES) {
      const card = screen.getByRole('heading', { name: adminCases.queues[queue] }).closest('a');
      expect(card).toHaveAttribute('href', routes.admin.cases({ queue, status: 'active' }));
    }
    expect(screen.getByRole('link', { name: 'My cases (1)' })).toHaveAttribute('href', routes.admin.cases({ mine: true, status: 'active' }));
    expect(screen.getByText('1 past due')).toHaveClass('text-destructive');
    expect(screen.getByText('2 open cases')).toBeVisible();
    expect(screen.getByText(formatDateTime(adminHomeData.queues[0].oldestOpenedAt!))).toBeVisible();
    expect(screen.queryByText('Nothing waiting')).not.toBeInTheDocument();
  });

  it('makes a queue with an urgent case stand out, with the count in words', () => {
    renderHome();
    const safety = screen.getByRole('heading', { name: adminCases.queues.safety }).closest('a')!;
    expect(safety).toHaveTextContent('1 urgent');
    expect(safety.className).toContain('border-destructive/50');
    const disputes = screen.getByRole('heading', { name: adminCases.queues.disputes }).closest('a')!;
    expect(disputes).not.toHaveTextContent(/urgent/);
  });

  it('keeps the four queues available when there is nothing waiting', () => {
    renderHome(adminHomeQuietData);
    expect(screen.getByRole('heading', { name: 'Nothing waiting' })).toBeVisible();
    expect(screen.getAllByText('0 open cases')).toHaveLength(4);
    expect(screen.getAllByText('No open cases')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'View all cases' })).toHaveAttribute('href', routes.admin.cases({ status: 'all' }));
  });
});
