/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { type TaskBoardPageData } from '@/contracts';
import { taskBoardFilteredEmptyData, taskBoardNoTasksData, taskBoardPageData, taskBoardPagedData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import taskBoard from '../../../../messages/en/ui/taskBoard.json';
import { TaskBoardScreen } from './task-board-screen';

afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
function renderBoard(data: TaskBoardPageData) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, taskBoard }}><TaskBoardScreen data={data} now={now} /></NextIntlClientProvider>);
}

describe('TaskBoardScreen', () => {
  it('links Today to its URL and shows the supplied result count', () => {
    renderBoard(taskBoardPageData);
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('href')).toBe('/austin/tasks?when=today');
    expect(screen.getByText(`${taskBoardPageData.totalCount} open tasks`)).toBeDefined();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('resets the page for every filter and preserves the other query values', () => {
    renderBoard(taskBoardPagedData);
    const category = within(screen.getByRole('navigation', { name: 'Category' }));
    expect(category.getByRole('link', { name: 'Furniture assembly' }).getAttribute('href')).toBe('/austin/tasks?category=furniture-assembly&sort=newest');
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('href')).toBe('/austin/tasks?when=today&sort=newest');
    expect(screen.getByRole('link', { name: /Remote only/ }).getAttribute('href')).toBe('/austin/tasks?remote=1&sort=newest');
    expect(screen.getByRole('link', { name: 'Soonest' }).getAttribute('href')).toBe('/austin/tasks');
    for (const name of ['Category', 'When', 'Sort']) {
      for (const link of within(screen.getByRole('navigation', { name })).getAllByRole('link')) {
        expect(link.getAttribute('href')).not.toContain('page=');
      }
    }
  });

  it('links page 2 backward without page and forward to page 3', () => {
    renderBoard(taskBoardPagedData);
    expect(screen.getByText('Page 2 of 3')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe('/austin/tasks?sort=newest');
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe('/austin/tasks?sort=newest&page=3');
  });

  it('clears every filter for a filtered empty state', () => {
    renderBoard(taskBoardFilteredEmptyData);
    expect(screen.getByRole('heading', { name: 'No tasks match these filters' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe('/austin/tasks');
  });

  it('invites posting when no tasks are available', () => {
    renderBoard(taskBoardNoTasksData);
    expect(screen.getByRole('heading', { name: 'No open tasks right now' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Post a task' }).getAttribute('href')).toBe('/app/tasks/new');
  });

  it('turns off remote filtering without dropping the category or timing', () => {
    renderBoard({ ...taskBoardFilteredEmptyData, query: { ...taskBoardFilteredEmptyData.query, remoteOnly: true, page: 2 } });
    const remote = screen.getByRole('link', { name: /Remote only On/ });
    expect(remote.getAttribute('aria-current')).toBe('true');
    expect(remote.getAttribute('href')).toBe('/austin/tasks?category=moving-help&when=today');
  });
});
