/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type TaskBoardPageData } from '@/contracts';
import {
  taskBoardByDayData,
  taskBoardCardsData,
  taskBoardFilteredData,
  taskBoardFilteredEmptyData,
  taskBoardHubData,
  taskBoardNoTasksData,
  taskBoardPageData,
  taskBoardPagedData,
} from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { TaskBoardScreen } from './task-board-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
function renderBoard(data: TaskBoardPageData) {
  return render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}><TaskBoardScreen data={data} now={now} /></NextIntlClientProvider>);
}
const hrefOf = (element: HTMLElement) => element.getAttribute('href');
const group = (name: string) => within(screen.getByRole('group', { name }));
const board = (data: TaskBoardPageData, change: Parameters<typeof routes.taskBoard>[1] = {}) => routes.taskBoard(data.market.slug, { ...data.query, page: undefined, ...change });

describe('TaskBoardScreen', () => {
  it('groups tasks by neighborhood with their counts, and links the rest of a busy one', () => {
    renderBoard(taskBoardPageData);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Open tasks in Austin');
    // The market's counts in the header; no "N match" line on an unfiltered board.
    expect(screen.getByText('13 open tasks')).toBeDefined();
    expect(screen.getByText('3 posted today')).toBeDefined();
    expect(screen.queryByRole('status')).toBeNull();

    const mueller = within(screen.getByRole('region', { name: /^Mueller/ }));
    expect(mueller.getByText('9 tasks')).toBeDefined();
    expect(mueller.getAllByRole('listitem')).toHaveLength(5);
    expect(hrefOf(mueller.getByRole('link', { name: /See all 9 in Mueller/ }))).toBe(board(taskBoardPageData, { areas: ['mueller'] }));
    // Rows inside a neighborhood leave its name out; each title links to the public task page.
    const bed = taskBoardPageData.sections![0]!.tasks[0]!;
    expect(hrefOf(mueller.getByRole('link', { name: bed.title }))).toBe(routes.publicTask(bed.slug));
    expect(mueller.queryByText('Mueller', { selector: 'p span' })).toBeNull();

    // A section with all its tasks shown has no "See all"; remote work comes last.
    expect(within(screen.getByRole('region', { name: /^Crestview/ })).queryByRole('link', { name: /See all/ })).toBeNull();
    const regions = screen.getAllByRole('region').map((region) => region.getAttribute('aria-labelledby'));
    expect(regions.at(-1)).toBe('board-remote');
  });

  it('marks new tasks and the ones nobody has offered on yet', () => {
    renderBoard(taskBoardPageData);
    const bedRow = screen.getByRole('link', { name: 'Put together a queen bed frame tonight' }).closest('article')!;
    expect(within(bedRow).getByText('New')).toBeDefined();
    expect(within(bedRow).getByText('No offers yet')).toBeDefined();
    // The price twice: in the details line on phones, in its own column from `sm` up (CSS shows one).
    expect(within(bedRow).getAllByText('$85.00', { exact: false }).length).toBeGreaterThan(0);
    const dresserRow = screen.getByRole('link', { name: 'Assemble a six-drawer dresser' }).closest('article')!;
    expect(within(dresserRow).getAllByText('$35.00/h').length).toBeGreaterThan(0);
    expect(within(dresserRow).getAllByText('up to 3 h').length).toBeGreaterThan(0);
    expect(within(dresserRow).getByText('Dresser')).toBeDefined();
  });

  it('counts every filter option and links each to its own URL, back on page 1', () => {
    renderBoard(taskBoardPagedData);
    const query = taskBoardPagedData.query;
    expect(hrefOf(group('Category').getByRole('link', { name: /^Furniture assembly/ }))).toBe(board(taskBoardPagedData, { category: 'furniture-assembly' }));
    expect(group('Category').getByRole('link', { name: /^Furniture assembly/ }).textContent).toContain('8');
    expect(hrefOf(group('Neighborhoods').getByRole('link', { name: /^Mueller/ }))).toBe(board(taskBoardPagedData, { areas: ['mueller'] }));
    expect(hrefOf(group('When').getByRole('link', { name: /^Today/ }))).toBe(board(taskBoardPagedData, { when: 'today' }));
    expect(hrefOf(group('Time of day').getByRole('link', { name: /^Morning/ }))).toBe(board(taskBoardPagedData, { times: ['morning'] }));
    expect(hrefOf(group('Price').getByRole('link', { name: /^Under \$50/ }))).toBe(board(taskBoardPagedData, { maxPrice: 49 }));
    expect(hrefOf(group('More').getByRole('link', { name: /^Remote only/ }))).toBe(board(taskBoardPagedData, { remoteOnly: true }));
    expect(hrefOf(screen.getByRole('navigation', { name: 'Sort' }).querySelector('[aria-current]') as HTMLElement)).toBe(board(taskBoardPagedData, { sort: 'newest' }));
    expect(hrefOf(within(screen.getByRole('navigation', { name: 'Sort' })).getByRole('link', { name: 'Soonest' }))).toBe(board(taskBoardPagedData, { sort: 'soonest' }));
    for (const link of screen.getByRole('complementary', { name: 'Filter open tasks' }).querySelectorAll('a')) expect(link.getAttribute('href')).not.toContain('page=');
    expect(query.page).toBe(2);
  });

  it('searches with a GET form that keeps the other filters', () => {
    renderBoard(taskBoardFilteredData);
    expect(screen.getByRole('status').textContent).toBe('2 open tasks');
    const search = screen.getByRole('search');
    expect(search.getAttribute('method')).toBe('get');
    expect((within(search).getByRole('searchbox', { name: 'Search' }) as HTMLInputElement).defaultValue).toBe('assemble');
    const kept = Object.fromEntries([...search.querySelectorAll<HTMLInputElement>('input[type=hidden]')].map((input) => [input.name, input.value]));
    expect(kept).toMatchObject({ area: 'mueller', min: '50', max: '150', pricing: 'fixed', posted: '3d', time: 'morning', few: '1' });
    expect(kept.q).toBeUndefined();
    expect(kept.page).toBeUndefined();
    expect(new URL(board(taskBoardFilteredData, { q: undefined }), 'https://x.invalid').pathname).toBe(search.getAttribute('action'));
  });

  it('shows the filters in use as chips that each remove one, and clears them all', () => {
    renderBoard(taskBoardFilteredData);
    const chips = within(screen.getByRole('navigation', { name: 'Filters in use' }));
    expect(hrefOf(chips.getByRole('link', { name: 'Remove Mueller' }))).toBe(board(taskBoardFilteredData, { areas: [] }));
    expect(hrefOf(chips.getByRole('link', { name: 'Remove “assemble”' }))).toBe(board(taskBoardFilteredData, { q: undefined }));
    expect(hrefOf(chips.getByRole('link', { name: 'Remove $50 to $150' }))).toBe(board(taskBoardFilteredData, { minPrice: undefined, maxPrice: undefined }));
    expect(hrefOf(chips.getByRole('link', { name: 'Remove Morning (before noon)' }))).toBe(board(taskBoardFilteredData, { times: [] }));
    expect(hrefOf(chips.getByRole('link', { name: 'Remove Furniture assembly' }))).toBe(board(taskBoardFilteredData, { category: undefined, type: undefined }));
    expect(hrefOf(chips.getByRole('link', { name: 'Clear all' }))).toBe(routes.taskBoard('austin'));
    // One neighborhood: one list, with the neighborhood named in each row.
    expect(screen.queryAllByRole('region')).toHaveLength(0);
    expect(screen.getAllByText('Mueller', { selector: 'p span' }).length).toBe(taskBoardFilteredData.tasks.length);
  });

  it('pages one list: back to page 1 without a page parameter, forward to page 3', () => {
    renderBoard(taskBoardPagedData);
    expect(screen.getByText('Page 2 of 3')).toBeDefined();
    expect(hrefOf(screen.getByRole('link', { name: 'Previous' }))).toBe(routes.taskBoard('austin', { ...taskBoardPagedData.query, page: 1 }));
    expect(hrefOf(screen.getByRole('link', { name: 'Previous' }))).not.toContain('page=');
    expect(hrefOf(screen.getByRole('link', { name: 'Next' }))).toBe(routes.taskBoard('austin', { ...taskBoardPagedData.query, page: 3 }));
  });

  it('groups by day with Today and Tomorrow first', () => {
    renderBoard(taskBoardByDayData);
    const days = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.firstChild?.textContent);
    expect(days.slice(0, 2)).toEqual(['Today', 'Tomorrow']);
    expect(new Set(days).size).toBe(days.length);
    expect(within(screen.getByRole('navigation', { name: 'Group' })).getByRole('link', { name: /By day/ }).getAttribute('aria-current')).toBe('true');
  });

  it('shows cards without the grouping control', () => {
    renderBoard(taskBoardCardsData);
    expect(screen.queryByRole('navigation', { name: 'Group' })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(taskBoardCardsData.tasks.length);
    expect(hrefOf(within(screen.getByRole('navigation', { name: 'View' })).getByRole('link', { name: 'List' }))).toBe(board(taskBoardCardsData, { view: 'list' }));
  });

  it('heads a category page with its own title and offers its task types', () => {
    renderBoard(taskBoardHubData);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Furniture assembly jobs in Austin');
    expect(screen.getByText(taskBoardHubData.heading!.intro)).toBeDefined();
    const types = group('Task type');
    expect(hrefOf(types.getByRole('link', { name: /^Bookshelf or shelves/ }))).toBe(board(taskBoardHubData, { type: 'shelving' }));
    expect(types.getByRole('link', { name: /^Bookshelf or shelves/ }).textContent).toContain('2');
    expect(hrefOf(group('Category').getByRole('link', { name: /^All/ }))).toBe(board(taskBoardHubData, { category: undefined }));
  });

  it('clears every filter for a filtered empty state', () => {
    renderBoard(taskBoardFilteredEmptyData);
    expect(screen.getByRole('heading', { name: 'No tasks match these filters' })).toBeDefined();
    expect(hrefOf(screen.getByRole('link', { name: 'Clear filters' }))).toBe(routes.taskBoard('austin'));
  });

  it('invites posting when no tasks are available', () => {
    renderBoard(taskBoardNoTasksData);
    expect(screen.getByRole('heading', { name: 'No open tasks right now' })).toBeDefined();
    expect(screen.getByText('none posted today yet')).toBeDefined();
    for (const link of screen.getAllByRole('link', { name: 'Post a task' })) expect(hrefOf(link)).toBe(routes.app.newTask());
  });

  it('turns off remote work without dropping the category or the timing', () => {
    renderBoard({ ...taskBoardFilteredEmptyData, query: { ...taskBoardFilteredEmptyData.query, remoteOnly: true, page: 2 } });
    const remote = group('More').getByRole('link', { name: /^Remote only/ });
    expect(remote.getAttribute('aria-current')).toBe('true');
    expect(hrefOf(remote)).toBe(routes.taskBoard('austin', { category: 'moving-help', when: 'today' }));
  });
});
