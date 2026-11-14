/** @vitest-environment jsdom */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskPublicView } from '@/contracts';
import { deskPublicTask, yardPublicTask } from '@/fixtures';
import { resetTaskLiveStates, setTaskLiveState } from '@/ui/components/search/board-live-store';
import { resetLastVisits } from '@/ui/lib/last-visit';
import messages from '../../../../messages/en/ui';
import { LastVisitNote } from './task-live';
import { TaskRow } from './task-row';

/** The board's rows, live (completion plan 7.6): offer counts and ends from the stream, "New" since your last visit. */
const now = '2026-11-17T15:00:00.000Z';
const later = (ms: number) => new Date(Date.parse(now) + ms).toISOString();
const visitKey = 'board:austin';

function renderRows(tasks: TaskPublicView[]) {
  return render(
    <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>
      <p data-testid="stats"><LastVisitNote visitKey={visitKey} now={now} /></p>
      <ol>{tasks.map((task) => <li key={task.id}><TaskRow task={task} now={now} visitKey={visitKey} /></li>)}</ol>
    </NextIntlClientProvider>,
  );
}
const row = (title: string) => within(screen.getByRole('link', { name: title }).closest('article')!);

beforeEach(() => {
  // The browser's clock reads the page's "now" (the last visit is measured from it).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse(now));
  window.localStorage.clear();
  resetLastVisits();
  resetTaskLiveStates();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('live board rows', () => {
  it('shows the page’s count until the stream has newer news, then the new count', () => {
    const task = { ...deskPublicTask, offerCount: 1 };
    renderRows([task]);
    expect(row(task.title).getByText('1 offer')).toBeDefined();
    // News read before the page was rendered is old: the page's number stays.
    act(() => setTaskLiveState({ id: task.id, offerCount: 5, state: 'open', readAt: later(-60_000) }));
    expect(row(task.title).getByText('1 offer')).toBeDefined();
    act(() => setTaskLiveState({ id: task.id, offerCount: 2, state: 'open', readAt: later(5_000) }));
    expect(row(task.title).getByText('2 offers')).toBeDefined();
    // An older notice arriving late never undoes a newer one.
    act(() => setTaskLiveState({ id: task.id, offerCount: 1, state: 'open', readAt: later(4_000) }));
    expect(row(task.title).getByText('2 offers')).toBeDefined();
  });

  it('says booked or no longer taking offers when the task ends, and leaves other rows alone', () => {
    const desk = { ...deskPublicTask, offerCount: 2 };
    const yard = { ...yardPublicTask, offerCount: 0 };
    renderRows([desk, yard]);
    act(() => setTaskLiveState({ id: desk.id, offerCount: 0, state: 'booked', readAt: later(1_000) }));
    expect(row(desk.title).getByText('Booked')).toBeDefined();
    expect(row(yard.title).getByText('No offers yet')).toBeDefined();
    act(() => setTaskLiveState({ id: yard.id, offerCount: 0, state: 'closed', readAt: later(2_000) }));
    expect(row(yard.title).getByText('No longer taking offers')).toBeDefined();
  });

  it('marks what was posted since the last visit, and says when that was', () => {
    // The last visit ended an hour before the desk was posted, and after the yard task was.
    const lastVisit = Date.parse(deskPublicTask.postedAt) - 3_600_000;
    const desk = deskPublicTask;
    const yard = { ...yardPublicTask, postedAt: new Date(lastVisit - 60_000).toISOString() };
    window.localStorage.setItem(`tnm:visit:${visitKey}`, JSON.stringify({ seen: lastVisit, previous: null }));
    renderRows([desk, yard]);
    expect(row(desk.title).getByText('New')).toBeDefined();
    expect(row(desk.title).getByText('New').getAttribute('title')).toBe('Posted since your last visit');
    expect(row(yard.title).queryByText('New')).toBeNull();
    expect(within(screen.getByTestId('stats')).getByText(/^since your last visit, /)).toBeDefined();
    // The visit is remembered for next time.
    const stored = JSON.parse(window.localStorage.getItem(`tnm:visit:${visitKey}`)!) as { seen: number; previous: number };
    expect(stored.previous).toBe(lastVisit);
  });

  it('keeps the usual "New" (posted within a day) and no note on a first visit', () => {
    const fresh = { ...deskPublicTask, postedAt: later(-3_600_000) };
    const old = { ...yardPublicTask, postedAt: later(-3 * 86_400_000) };
    renderRows([fresh, old]);
    expect(row(fresh.title).getByText('New').getAttribute('title')).toBeNull();
    expect(row(old.title).queryByText('New')).toBeNull();
    expect(screen.getByTestId('stats').textContent).toBe('');
  });
});
