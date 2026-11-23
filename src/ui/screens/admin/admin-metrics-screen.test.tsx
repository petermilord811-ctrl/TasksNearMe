/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { FUNNEL_STEPS, METRIC_TARGET_IDS, METRICS_PERIODS, REWARD_PROGRAM_CODES, routes } from '@/contracts';
import { adminMetricsAgentData, adminMetricsEmptyData, adminMetricsFinanceData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/adminMetrics.json';
import { AdminMetricsScreen } from './admin-metrics-screen';
import { formatMoney } from '@/shared/format';

afterEach(cleanup);

const withMessages = (node: React.ReactNode) => <NextIntlClientProvider locale="en" messages={uiMessages}>{node}</NextIntlClientProvider>;

describe('AdminMetricsScreen', () => {
  it('has copy for every target, status, area, funnel step, period and reward program', () => {
    for (const id of METRIC_TARGET_IDS) expect(copy.targets.items[id].title).toBeTruthy();
    for (const status of ['met', 'missed', 'no_data', 'restricted', 'not_measured'] as const) expect(copy.targets.status[status]).toBeTruthy();
    for (const step of FUNNEL_STEPS) expect(copy.funnel.steps[step]).toBeTruthy();
    for (const days of METRICS_PERIODS) expect(copy.periods[String(days) as '7' | '30' | '90']).toBeTruthy();
    for (const program of REWARD_PROGRAM_CODES) expect(copy.rewards.programs[program]).toBeTruthy();
  });

  it('shows finance every figure, money included', () => {
    render(withMessages(<AdminMetricsScreen data={adminMetricsFinanceData} />));
    expect(screen.getByRole('heading', { level: 1, name: 'Market metrics' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '30 days' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: '7 days' }).getAttribute('href')).toBe(routes.admin.metrics(7));

    const targets = within(screen.getByRole('region', { name: 'Launch targets' }));
    expect(targets.getAllByRole('listitem')).toHaveLength(METRIC_TARGET_IDS.length);
    // A held booking's contribution (2026-11-23: no service fees; the hold fee alone doesn't cover Stripe's costs).
    expect(targets.getByText(formatMoney(-45))).toBeTruthy();
    expect(targets.getByText('Target: at least $0.00')).toBeTruthy();
    // 6 of 217 is over the 2% ceiling.
    expect(targets.getByText('2.8%')).toBeTruthy();
    expect(targets.getAllByText('Off target')).toHaveLength(3);
    expect(targets.getByText('Not counted here')).toBeTruthy();

    const rewards = within(screen.getByRole('region', { name: 'Reward spend' }));
    expect(rewards.getByRole('heading', { name: 'Welcome' })).toBeTruthy();
    expect(rewards.getByRole('meter', { name: 'Welcome: 29% of the budget committed' })).toBeTruthy();
    expect(rewards.getByText('Delivered in this period: $375.00')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'By area' })).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'By area' })).getByRole('rowheader', { name: 'Remote' })).toBeTruthy();
  });

  it('leaves money out for a support agent', () => {
    render(withMessages(<AdminMetricsScreen data={adminMetricsAgentData} />));
    expect(screen.getByText('Money figures are shown to finance and admins.')).toBeTruthy();
    expect(screen.getByText('Reward spend is shown to finance and admins.')).toBeTruthy();
    expect(screen.queryByText('Rewards delivered')).toBeNull();
    expect(screen.queryByText(/Contribution is an estimate/)).toBeNull();
  });

  it('says there is nothing yet on a new market', () => {
    render(withMessages(<AdminMetricsScreen data={adminMetricsEmptyData} />));
    expect(screen.getAllByText('No data yet')).toHaveLength(METRIC_TARGET_IDS.length - 1);
    expect(within(screen.getByRole('region', { name: 'From posting to booking again' })).getByText('No tasks were posted in this period.')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'By category' })).toBeNull();
  });
});
