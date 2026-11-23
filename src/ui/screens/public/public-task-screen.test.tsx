/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type PublicTaskPageData } from '@/contracts';
import { publicTaskAssignedPageData, publicTaskHelperPageData, publicTaskPageData, publicTaskVisitorPageData, publicRemoteTaskPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import publicTask from '../../../../messages/en/ui/publicTask.json';
import { PublicTaskScreen } from './public-task-screen';

afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
function renderTask(data: PublicTaskPageData) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, publicTask }}><PublicTaskScreen data={data} now={now} liveMap={false} /></NextIntlClientProvider>);
}

describe('PublicTaskScreen', () => {
  it('links offers to the signed-in helper task and keeps private details absent', () => {
    const { container } = renderTask(publicTaskPageData);
    // The price card's link, and on phones the bar at the bottom of the screen (2026-11-23).
    const offers = screen.getAllByRole('link', { name: 'Make an offer' });
    expect(offers).toHaveLength(2);
    for (const link of offers) expect(link.getAttribute('href')).toBe('/app/find-work/tsk_desk');
    expect(screen.getByText('Sign in to see the full details and make an offer.')).toBeDefined();
    expect(container.textContent).not.toMatch(/Example Lane|1234|Apt 2B|Buzz 2B|78723/);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    // The budget in its fact tile, in the price card beside the task, and in the phone's bottom bar.
    expect(screen.getAllByText('$60.00')).toHaveLength(3);
    const breadcrumb = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(breadcrumb.getByRole('link', { name: 'Austin' }).getAttribute('href')).toBe('/austin');
    expect(breadcrumb.getByRole('link', { name: 'Open tasks' }).getAttribute('href')).toBe('/austin/tasks');
    expect(breadcrumb.getByRole('link', { name: 'Furniture assembly' }).getAttribute('href')).toBe('/austin/furniture-assembly');
  });

  it('shows a helper who can offer the photos as a carousel, the whole description and the answers (2026-11-23)', () => {
    renderTask(publicTaskHelperPageData);
    const gallery = screen.getByRole('region', { name: '3 photos' });
    expect(within(gallery).getByRole('button', { name: 'Open photo 1 of 3' })).toBeInTheDocument();
    expect(within(gallery).getByRole('button', { name: 'Next photo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'What to know' })).toBeInTheDocument();
    const details = within(screen.getByRole('region', { name: 'Task details' }));
    expect(details.getByText('Brand or model')).toBeInTheDocument();
    expect(details.getByText('IKEA MALM')).toBeInTheDocument();
    expect(details.getByText('Expense allowance: $15.00')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'The full task' })).toBeNull();
  });

  it('tells a visitor how many photos there are and how to see them, without any photo on the page', () => {
    const { container } = renderTask(publicTaskVisitorPageData);
    const locked = within(screen.getByRole('region', { name: 'The full task' }));
    expect(locked.getByText('3 photos')).toBeInTheDocument();
    expect(locked.getByRole('link', { name: /Sign in to see it all/ }).getAttribute('href')).toBe(routes.signIn(routes.publicTask(publicTaskVisitorPageData.task.slug)));
    expect(container.querySelector('img')).toBeNull();
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
