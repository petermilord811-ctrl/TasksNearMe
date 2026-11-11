/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type MyTasksPageData } from '@/contracts';
import { myTasksEmptyData, myTasksPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import myTasks from '../../../../messages/en/ui/myTasks.json';
import { MyTasksScreen } from './my-tasks-screen';

afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
function renderTasks(data: MyTasksPageData = myTasksPageData, initialTab: 'open' | 'booked' | 'past' = 'open') {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, myTasks }}><MyTasksScreen data={data} now={now} initialTab={initialTab} /></NextIntlClientProvider>);
}

describe('MyTasksScreen', () => {
  it('shows the tab counts, supplied offer counts, new badge, and one page title', () => {
    renderTasks();
    expect(screen.getByRole('tab', { name: 'Open (2)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Booked (1)' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Past (1)' })).toBeVisible();
    expect(screen.getByText('3 offers')).toBeVisible();
    expect(screen.getByText('1 new')).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: myTasksPageData.open[0].title })).toHaveAttribute('href', routes.app.task(myTasksPageData.open[0].id));
  });

  it('switches to booked tasks and links the row to its supplied booking', async () => {
    const user = userEvent.setup();
    renderTasks();
    await user.click(screen.getByRole('tab', { name: 'Booked (1)' }));
    const row = screen.getByRole('link', { name: myTasksPageData.booked[0].title });
    expect(row).toHaveAttribute('href', routes.app.booking('bkg_yard'));
    expect(within(screen.getByRole('article', { name: myTasksPageData.booked[0].title })).getByText('Booked')).toBeVisible();
    expect(screen.queryByText('1 new')).not.toBeInTheDocument();
  });

  it('uses the task link if a booked row has no booking id', () => {
    renderTasks({ ...myTasksPageData, booked: [{ ...myTasksPageData.booked[0], bookingId: undefined }] }, 'booked');
    expect(screen.getByRole('link', { name: myTasksPageData.booked[0].title })).toHaveAttribute('href', routes.app.task(myTasksPageData.booked[0].id));
  });

  it('keeps past rows linked to their task and labels a completed task Done', () => {
    renderTasks(myTasksPageData, 'past');
    const row = screen.getByRole('link', { name: myTasksPageData.past[0].title });
    expect(row).toHaveAttribute('href', routes.app.task(myTasksPageData.past[0].id));
    expect(within(screen.getByRole('article', { name: myTasksPageData.past[0].title })).getByText('Done')).toBeVisible();
  });

  it.each(['open', 'booked', 'past'] as const)('explains the empty %s tab and offers posting', (tab) => {
    renderTasks(myTasksEmptyData, tab);
    expect(screen.getByRole('heading', { name: myTasks.empty[tab].title })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', routes.app.newTask());
  });
});
