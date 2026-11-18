/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type HelpersBrowsePageData, type SavedHelperHandlers } from '@/contracts';
import { fakeHandler, helpersBrowseData, helpersBrowseEmptyData, helpersBrowseFilteredData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/helpersBrowse.json';
import { HelpersBrowseScreen } from './helpers-browse-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function mount(data: HelpersBrowsePageData = helpersBrowseData) {
  const onToggleSaved = vi.fn<SavedHelperHandlers['onToggleSaved']>(fakeHandler({ ok: true, code: 'updated' }, 0));
  render(<NextIntlClientProvider locale="en" messages={uiMessages}><HelpersBrowseScreen data={data} handlers={{ onToggleSaved }} /></NextIntlClientProvider>);
  return onToggleSaved;
}

describe('HelpersBrowseScreen', () => {
  it('filters in one compact bar on the route builder, keeping the current filters (audit M35)', () => {
    mount(helpersBrowseFilteredData);
    const form = screen.getByRole('search', { name: copy.filtersTitle });
    expect(form).toHaveAttribute('action', routes.app.helpers());
    expect(form.getAttribute('method') ?? 'get').toBe('get');
    expect(form.querySelector('input[name="category"]')).toHaveValue('furniture-assembly');
    expect(within(form).getByLabelText(copy.area)).toHaveValue('mueller');
    expect(within(form).getByRole('checkbox', { name: copy.openTimes })).toBeChecked();
    const categories = screen.getByRole('list', { name: copy.category });
    expect(within(categories).getByRole('link', { name: 'Furniture assembly' })).toHaveAttribute('aria-current', 'true');
    expect(within(categories).getByRole('link', { name: copy.anyCategory })).toHaveAttribute('href', routes.app.helpers({ area: 'mueller', openTimes: true }));
    expect(screen.getByRole('link', { name: copy.clear })).toHaveAttribute('href', routes.app.helpers());
  });

  it('applies a neighborhood or "open this week" as soon as it changes', () => {
    mount();
    const form = screen.getByRole<HTMLFormElement>('search', { name: copy.filtersTitle });
    const submit = vi.spyOn(form, 'requestSubmit').mockImplementation(() => {});
    fireEvent.change(within(form).getByLabelText(copy.area), { target: { value: 'mueller' } });
    fireEvent.click(within(form).getByRole('checkbox', { name: copy.openTimes }));
    expect(submit).toHaveBeenCalledTimes(2);
    // A typed name waits for Enter or Search.
    fireEvent.change(within(form).getByRole('searchbox', { name: copy.search }), { target: { value: 'Jor' } });
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("keeps Ask and Save inside each helper's card", () => {
    mount();
    for (const row of helpersBrowseData.rows) {
      const card = screen.getByRole('link', { name: `Ask ${row.helper.displayName}` }).closest('article')!;
      expect(within(card).getByRole('link', { name: row.helper.displayName })).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: new RegExp(row.helper.displayName) })).toHaveAttribute('aria-pressed', String(row.saved));
    }
  });

  it('shows each helper with their next open time, a request link and a save toggle', async () => {
    const user = userEvent.setup();
    const onToggleSaved = mount();
    const [jordan, sam] = helpersBrowseData.rows;
    expect(screen.getByRole('link', { name: `Ask ${sam!.helper.displayName}` })).toHaveAttribute('href', routes.app.requestHelper(sam!.helper.handle));
    expect(screen.getAllByText(/^Open (Mon|Tue|Wed|Thu|Fri|Sat|Sun), /).length).toBe(helpersBrowseData.rows.filter((row) => row.nextOpenTime).length);
    expect(screen.getByRole('button', { name: `Remove ${jordan!.helper.displayName} from saved helpers` })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: `Save ${sam!.helper.displayName}` }));
    await waitFor(() => expect(onToggleSaved).toHaveBeenCalledWith({ helperId: sam!.helper.id, saved: true }));
    expect(await screen.findByText(`${sam!.helper.displayName} is in your saved helpers.`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Remove ${sam!.helper.displayName} from saved helpers` })).toHaveAttribute('aria-pressed', 'true');
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('offers to post a task when no helper matches', () => {
    mount(helpersBrowseEmptyData);
    expect(screen.getByText(copy.emptyTitle)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.postTask })).toHaveAttribute('href', routes.app.newTask());
  });
});
