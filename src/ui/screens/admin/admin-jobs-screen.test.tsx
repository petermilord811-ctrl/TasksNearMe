/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_NOW, adminJobsOffData, adminJobsRunningData, adminJobsStalledData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import { AdminJobsScreen } from './admin-jobs-screen';

afterEach(cleanup);
const withMessages = (node: React.ReactNode) => <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={uiMessages}>{node}</NextIntlClientProvider>;

describe('AdminJobsScreen (when things break, 2026-11-21)', () => {
  it('says since when it knows, and lists each job’s last run, failing ones first with their error', () => {
    render(withMessages(<AdminJobsScreen data={adminJobsRunningData} now={ADMIN_NOW} />));
    expect(screen.getByText(/^Since .*, when this server started\. A deploy or a restart starts this history over\.$/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Runner' })).getByText('Running')).toBeTruthy();
    const jobs = within(screen.getByRole('region', { name: 'Jobs' })).getAllByRole('listitem').filter((item) => item.parentElement?.tagName === 'UL');
    expect(within(jobs[0]!).getByText('bookings.scheduled_charges')).toBeTruthy();
    expect(within(jobs[0]!).getAllByText('Failed').length).toBeGreaterThan(0);
    expect(within(jobs[0]!).getByText(/2 failures in a row/)).toBeTruthy();
    expect(within(jobs[0]!).getByText('Error: Stripe answered 503 (service unavailable)')).toBeTruthy();
    expect(within(jobs[0]!).getAllByText('30.1 s').length).toBeGreaterThan(0);
    expect(within(jobs[1]!).getByText('38 ms')).toBeTruthy();
    expect(within(jobs[3]!).getByText('No run yet')).toBeTruthy();
  });

  it('says a stuck run stops every job, and when it started', () => {
    render(withMessages(<AdminJobsScreen data={adminJobsStalledData} now={ADMIN_NOW} />));
    expect(within(screen.getByRole('region', { name: 'Runner' })).getByText('Stuck')).toBeTruthy();
    expect(screen.getByText(/hasn't finished, so no job runs/)).toBeTruthy();
  });

  it('says when the runner doesn’t run on this server', () => {
    render(withMessages(<AdminJobsScreen data={adminJobsOffData} now={ADMIN_NOW} />));
    expect(within(screen.getByRole('region', { name: 'Runner' })).getByText('Not running')).toBeTruthy();
    expect(screen.getAllByText(/isn't running on this server/).length).toBeGreaterThan(0);
  });
});
