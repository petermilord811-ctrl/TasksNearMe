/** @vitest-environment jsdom */
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { routes } from '@/contracts';
import { furnitureCostGuideData, movingCostGuideData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { CostGuideScreen } from './cost-guide-screen';

afterEach(cleanup);
function renderScreen(element: ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{element}</NextIntlClientProvider>);
}

describe('CostGuideScreen', () => {
  it('puts the next step and why to trust it under the question, and every "Post a task" opens the wizard on the service (J-V)', () => {
    renderScreen(<CostGuideScreen data={furnitureCostGuideData} />);
    const posts = screen.getAllByRole('link', { name: 'Post a task' });
    expect(posts.length).toBeGreaterThanOrEqual(2);
    for (const link of posts) expect(link.getAttribute('href')).toBe(routes.app.newTask({ category: furnitureCostGuideData.category.slug }));
    expect(screen.getByText(messages.publicPages.shared.freeToPost)).toBeDefined();
    expect(within(screen.getByRole('list', { name: messages.publicPages.shared.trustPoints.label })).getAllByRole('listitem')).toHaveLength(3);
  });

  it('answers the question with the typical range and what each end costs and earns', () => {
    renderScreen(<CostGuideScreen data={furnitureCostGuideData} />);
    expect(screen.getByRole('heading', { level: 1, name: 'How much does furniture assembly cost in Austin?' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Furniture assembly in Austin/ }).getAttribute('href')).toBe('/austin/furniture-assembly');

    // Held by TasksNearMe: the price plus the 5% hold fee. Helpers get the whole price (no service fees since 2026-11-23).
    const low = screen.getByRole('region', { name: 'At the low end: $50.00 per item' });
    expect(within(low).getByText('$52.50')).toBeTruthy();
    const high = screen.getByRole('region', { name: 'At the high end: $80.00 per item' });
    expect(within(high).getByText('$84.00')).toBeTruthy();
    expect(screen.queryByRole('region', { name: /What your helper earns/ })).toBeNull();

    expect(screen.getByText(/^There are no service fees, and helpers get the whole price\. A hold fee of 5% \(at least \$1\.00\) applies only when a helper asks to be paid upfront and TasksNearMe holds the payment\. Plus members don't pay it\./)).toBeTruthy();
    const factors = screen.getByRole('region', { name: 'What changes the price' });
    expect(within(factors).getAllByRole('listitem')).toHaveLength(4);
    const steps = screen.getByRole('region', { name: 'How to get an exact price' });
    expect(within(steps).getAllByRole('listitem')).toHaveLength(3);
    expect(within(screen.getByRole('region', { name: 'More in Austin' })).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/austin/furniture-assembly',
      '/austin/tasks/furniture-assembly',
      '/pricing',
    ]);
  });

  it('works out an hourly service for its minimum hours, at its hourly rates', () => {
    renderScreen(<CostGuideScreen data={movingCostGuideData} />);
    expect(screen.getByText("Worked out for an upfront payment TasksNearMe holds, at today's hold fee, for 2 hours. Paid directly, you pay just the task price.")).toBeTruthy();
    expect(screen.getByRole('region', { name: 'At the low end: $32.00 an hour' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'At the high end: $40.00 an hour' })).toBeTruthy();
  });
});
