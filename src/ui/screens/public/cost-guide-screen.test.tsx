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

    const low = screen.getByRole('region', { name: 'At the low end: $50.00 per item' });
    expect(within(low).getByText('$55.00')).toBeTruthy();
    const high = screen.getByRole('region', { name: 'At the high end: $80.00 per item' });
    expect(within(high).getByText('$88.00')).toBeTruthy();
    const earns = screen.getByRole('region', { name: 'What your helper earns at $50.00 per item' });
    expect(within(earns).getByText('$45.00')).toBeTruthy();

    expect(screen.getByText('Posters pay a service fee of 10% (at least $3.00). Helpers pay 10% of the task price.')).toBeTruthy();
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
    expect(screen.getByText('Worked out with the service fees in effect today, for 2 hours.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'At the low end: $32.00 an hour' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'At the high end: $40.00 an hour' })).toBeTruthy();
  });
});
