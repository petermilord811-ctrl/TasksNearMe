/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes, type ActionResult, type SavedSearchUpdateInput } from '@/contracts';
import { editFindWorkSavedSearchPageData, editSavedSearchPageData, savedSearchesWithFindWorkData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { EditSavedSearchScreen } from './edit-saved-search-screen';
import { SavedSearchesScreen } from './saved-searches-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const copy = messages.savedSearches;
function show(data = editSavedSearchPageData, onSave = vi.fn(async (_input: SavedSearchUpdateInput): Promise<ActionResult> => ({ ok: true, code: 'saved', redirectTo: routes.app.savedSearches() }))) {
  render(<NextIntlClientProvider locale="en" messages={messages} onError={(error) => { throw error; }}><EditSavedSearchScreen data={data} handlers={{ onSave }} /></NextIntlClientProvider>);
  return onSave;
}

describe('EditSavedSearchScreen (sweep SS5)', () => {
  it('saves the new name, alerts and filters, then goes back to the list', async () => {
    const onSave = show();
    await userEvent.clear(screen.getByLabelText(copy.new.name));
    await userEvent.type(screen.getByLabelText(copy.new.name), 'Desks in Mueller');
    await userEvent.click(screen.getByRole('radio', { name: copy.alerts.daily }));
    await userEvent.click(screen.getByText('Hyde Park', { exact: true }));
    await userEvent.click(screen.getByText('Zilker', { exact: true }));
    await userEvent.type(screen.getByLabelText(messages.taskBoard.priceRange.max), '120');
    await userEvent.click(screen.getByRole('button', { name: copy.edit.submit }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      id: editSavedSearchPageData.id,
      name: 'Desks in Mueller',
      alert: 'daily',
      filters: expect.objectContaining({ category: 'furniture-assembly', areas: ['mueller', 'zilker'], maxPrice: 120, minPrice: undefined }),
    }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(routes.app.savedSearches()));
  });

  it("won't send a minimum above the maximum, and offers the distance only for find work searches", async () => {
    const onSave = show();
    expect(screen.queryByLabelText(messages.findWork.distance)).toBeNull();
    await userEvent.type(screen.getByLabelText(messages.taskBoard.priceRange.min), '200');
    await userEvent.type(screen.getByLabelText(messages.taskBoard.priceRange.max), '50');
    expect(screen.getByText(copy.edit.priceOrder)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.edit.submit })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
    cleanup();
    show(editFindWorkSavedSearchPageData);
    expect(screen.getByLabelText(messages.findWork.distance)).toHaveValue('within_5_mi');
    expect(screen.getByLabelText(messages.taskBoard.types)).toHaveValue('desk');
  });

  it('drops the task type when the category changes', async () => {
    const onSave = show(editFindWorkSavedSearchPageData);
    await userEvent.selectOptions(screen.getByLabelText(messages.taskBoard.category), 'moving-help');
    expect(screen.getByLabelText(messages.taskBoard.types)).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: copy.edit.submit }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ filters: expect.objectContaining({ category: 'moving-help', type: undefined, distance: 'within_5_mi' }) }));
  });

  it('links each saved search to its edit page and marks the ones from find work', () => {
    render(<NextIntlClientProvider locale="en" messages={messages}><SavedSearchesScreen data={savedSearchesWithFindWorkData} handlers={{ onAlert: vi.fn(), onDelete: vi.fn() }} boardHref={routes.taskBoard('austin')} /></NextIntlClientProvider>);
    const nearby = savedSearchesWithFindWorkData.searches[0]!;
    expect(screen.getByRole('link', { name: `Edit ${nearby.name}` })).toHaveAttribute('href', routes.app.editSavedSearch(nearby.id));
    expect(screen.getAllByText(copy.sources.find_work)).toHaveLength(1);
    expect(screen.getByText(messages.findWork.distanceOptions.within_5_mi)).toBeInTheDocument();
  });
});
