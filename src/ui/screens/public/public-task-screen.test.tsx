/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type PublicTaskPageData } from '@/contracts';
import { publicTaskAssignedPageData, publicTaskPageData, publicRemoteTaskPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import publicTask from '../../../../messages/en/ui/publicTask.json';
import { PublicTaskScreen } from './public-task-screen';

afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
function renderTask(data: PublicTaskPageData) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, publicTask }}><PublicTaskScreen data={data} now={now} /></NextIntlClientProvider>);
}

describe('PublicTaskScreen', () => {
  it('links offers to the signed-in helper task and keeps private details absent', () => {
    const { container } = renderTask(publicTaskPageData);
    expect(screen.getByRole('link', { name: 'Make an offer' }).getAttribute('href')).toBe('/app/find-work/tsk_desk');
    expect(screen.getByText('Sign in to see the full details and make an offer.')).toBeDefined();
    expect(container.textContent).not.toMatch(/Example Lane|1234|Apt 2B|Buzz 2B|78723/);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('$60.00')).toBeDefined();
    const breadcrumb = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(breadcrumb.getByRole('link', { name: 'Austin' }).getAttribute('href')).toBe('/austin');
    expect(breadcrumb.getByRole('link', { name: 'Open tasks' }).getAttribute('href')).toBe('/austin/tasks');
    expect(breadcrumb.getByRole('link', { name: 'Furniture assembly' }).getAttribute('href')).toBe('/austin/furniture-assembly');
  });

  it('uses acceptingOffers as supplied even when a task still has open status', () => {
    renderTask({ ...publicTaskAssignedPageData, task: publicTaskPageData.task });
    expect(screen.queryByRole('link', { name: 'Make an offer' })).toBeNull();
    expect(screen.getByText("This task isn't taking offers anymore")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Browse open tasks' }).getAttribute('href')).toBe('/austin/tasks');
  });

  it('renders remote tasks without a local area and hides empty similar tasks', () => {
    renderTask(publicRemoteTaskPageData);
    expect(screen.getByText('Remote')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Similar tasks' })).toBeNull();
    // The wizard opens on this task's service (J-V).
    expect(screen.getByRole('link', { name: 'Need something similar? Post a task' }).getAttribute('href')).toBe(routes.app.newTask({ category: publicRemoteTaskPageData.category.slug }));
  });
});
