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
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
/** `null`: no tab asked for, as on the page (it opens on what needs the poster most). */
function renderTasks(data: MyTasksPageData = myTasksPageData, initialTab: 'open' | 'booked' | 'past' | null = 'open') {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, myTasks }}><TimeZoneProvider timeZone="America/Chicago"><MyTasksScreen data={data} now={now} initialTab={initialTab ?? undefined} /></TimeZoneProvider></NextIntlClientProvider>);
}

describe('MyTasksScreen', () => {
  it('shows the tab counts with what needs the poster, supplied offer counts, new badge, and one page title', () => {
    renderTasks();
    expect(screen.getByRole('tab', { name: 'Open (3), 2 need you' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Booked (2), 1 needs you' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Past (1)' })).toBeVisible();
    expect(screen.getByText('3 offers')).toBeVisible();
    expect(screen.getByText('1 new')).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: myTasksPageData.open[0].title })).toHaveAttribute('href', routes.app.task(myTasksPageData.open[0].id));
  });

  it('switches to booked tasks and links the row to its supplied booking', async () => {
    const user = userEvent.setup();
    renderTasks();
    await user.click(screen.getByRole('tab', { name: /^Booked \(2\)/ }));
    const row = screen.getByRole('link', { name: myTasksPageData.booked[0].title });
    expect(row).toHaveAttribute('href', routes.app.booking('bkg_truck'));
    // By day, with the helper and the time.
    expect(screen.getByRole('heading', { level: 2, name: 'Mon, Nov 16' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Sat, Nov 28' })).toBeVisible();
    const saturday = within(screen.getByRole('article', { name: myTasksPageData.booked[1]!.title }));
    expect(saturday.getByText('9:00 am')).toBeVisible();
    expect(saturday.getByText('with Sam K.')).toBeVisible();
    expect(within(screen.getByRole('article', { name: myTasksPageData.booked[0].title })).getByText('Booked')).toBeVisible();
    expect(screen.queryByText('1 new')).not.toBeInTheDocument();
  });

  it('marks what needs the poster on its own row, with the step, and counts it on each tab (audit M27)', async () => {
    const user = userEvent.setup();
    renderTasks(myTasksPageData, null);
    // No second list: each task appears once. The first tab with tasks opens; the others say what waits there.
    expect(screen.queryByRole('region', { name: /Needs you/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Open/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Booked (2), 1 needs you' }));
    const truck = within(screen.getByRole('article', { name: 'Help load a moving truck' }));
    expect(truck.getByText(/Jordan T\. marked the work complete/)).toBeVisible();
    expect(truck.getByRole('link', { name: 'Review the work: Help load a moving truck' })).toHaveAttribute('href', routes.app.booking('bkg_truck'));
    await user.click(screen.getByRole('tab', { name: /^Open/ }));
    const desk = within(screen.getByRole('article', { name: myTasksPageData.open[0].title }));
    expect(desk.getByText('1 new offer to look at.')).toBeVisible();
    expect(desk.getByRole('link', { name: `See offers: ${myTasksPageData.open[0].title}` })).toHaveAttribute('href', routes.app.task(myTasksPageData.open[0].id));
    const fridge = within(screen.getByRole('article', { name: 'Clean out the fridge and pantry' }));
    expect(fridge.getByRole('link', { name: 'Find helpers: Clean out the fridge and pantry' })).toHaveAttribute('href', routes.app.helpers({ category: 'light-cleaning' }));
    expect(screen.getAllByRole('article').filter((article) => article.textContent?.includes(myTasksPageData.open[0].title))).toHaveLength(1);
  });

  it('shows the newest offer on open tasks', () => {
    renderTasks();
    const desk = within(screen.getByRole('article', { name: myTasksPageData.open[0].title }));
    expect(desk.getByText(/Newest offer: Jordan T\., \$60\.00/)).toBeVisible();
    expect(within(screen.getByRole('article', { name: 'Clean out the fridge and pantry' })).queryByText(/Newest offer/)).not.toBeInTheDocument();
  });

  it('marks nothing when nothing needs the poster', () => {
    const calm = (rows: MyTasksPageData['open']) => rows.map((row) => ({ ...row, attention: undefined }));
    renderTasks({ needsYou: [], open: calm(myTasksPageData.open), booked: calm(myTasksPageData.booked), past: calm(myTasksPageData.past) }, null);
    expect(screen.getByRole('tab', { name: 'Open (3)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText(/need/)).not.toBeInTheDocument();
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
