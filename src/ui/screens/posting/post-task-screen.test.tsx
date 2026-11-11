/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ActionResult, Photo, PostTaskHandlers, TaskDraftInput } from '@/contracts';
import { addressSuggestions, aiDeskDraft, deskBreakdown, deskDraft, fakeHandler, fakePostTaskHandlers, postTaskPageData, postTaskResults, uploadedTaskPhotos } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { PostTaskScreen, type PostTaskScreenProps } from './post-task-screen';
import { draftStorageKey } from './draft-storage';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount(props: Partial<PostTaskScreenProps> = {}) {
  const handlers: PostTaskHandlers = { ...fakePostTaskHandlers, onQuote: vi.fn(async () => deskBreakdown), onPost: vi.fn(fakeHandler<TaskDraftInput>(postTaskResults.posted, 0)) };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><PostTaskScreen data={postTaskPageData} handlers={handlers} initialValues={deskDraft} initialAddress={addressSuggestions[0]} persistDraft={false} {...props} /></NextIntlClientProvider>) };
}

describe('posting wizard', () => {
  it('validates only describe on Next, focuses its empty title, and Back never validates', async () => {
    const user = userEvent.setup();
    mount({ initialStep: 'describe', initialValues: { ...deskDraft, title: '', location: { mode: 'local', placeId: '' } } });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(messages.forms.fieldErrors.required)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: messages.postTask.describe.title })).toHaveFocus());
    expect(screen.getByText('Step 2 of 8 · Describe')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Step 1 of 8 · Category')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(screen.getByRole('textbox', { name: messages.postTask.describe.title }), deskDraft.title);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Step 3 of 8 · Details')).toBeInTheDocument();
  });

  it('starts a supplied category at describe and allows Back to category', async () => {
    const user = userEvent.setup();
    mount({ data: { ...postTaskPageData, initialCategory: 'furniture-assembly' }, initialValues: undefined });
    expect(screen.getByText('Step 2 of 8 · Describe')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Step 1 of 8 · Category')).toBeInTheDocument();
    expect(screen.queryByText(messages.forms.fieldErrors.required)).not.toBeInTheDocument();
  });

  it('applies the AI suggestion to editable fields and details without posting', async () => {
    const user = userEvent.setup();
    const { handlers } = mount({ initialStep: 'describe', initialSuggestion: aiDeskDraft });
    await user.click(screen.getByRole('button', { name: 'Use this' }));
    expect(screen.getByRole('textbox', { name: messages.postTask.describe.title })).toHaveValue(aiDeskDraft.title);
    expect(screen.getByRole('textbox', { name: messages.postTask.describe.description })).toHaveValue(aiDeskDraft.description);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('combobox', { name: 'What needs assembling?' })).toHaveValue('desk');
    expect(screen.getByRole('spinbutton', { name: 'Number of items' })).toHaveValue(1);
    expect(handlers.onPost).not.toHaveBeenCalled();
  });

  it('blocks an invalid money edit and passes parsed cents to the quote', async () => {
    const user = userEvent.setup();
    const { handlers } = mount({ initialStep: 'budget' });
    const input = screen.getByRole('textbox', { name: 'Task price ($)' });
    await user.clear(input); await user.type(input, '12.345');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(messages.forms.fieldErrors.invalid)).toBeInTheDocument();
    expect(screen.getByText('Step 7 of 8 · Budget')).toBeInTheDocument();
    await user.clear(input); await user.type(input, '$60');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(handlers.onQuote).toHaveBeenCalledWith({ budget: { type: 'fixed', priceCents: 6000 }, expenseAllowanceCents: 0 }));
    expect(await screen.findByText('$66.00')).toBeInTheDocument();
  });

  it('posts the contract draft, prevents duplicate posts, announces success and follows redirectTo', async () => {
    const user = userEvent.setup();
    let finish!: (result: ActionResult) => void;
    const onPost = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    mount({ initialStep: 'review', handlers: { ...fakePostTaskHandlers, onQuote: async () => deskBreakdown, onPost } });
    await user.click(screen.getByRole('button', { name: 'Post task' }));
    const pending = screen.getByRole('button', { name: /Posting…/ });
    expect(pending).toBeDisabled(); expect(pending).toHaveAttribute('aria-busy', 'true');
    await user.click(pending);
    expect(onPost).toHaveBeenCalledExactlyOnceWith(deskDraft);
    await act(async () => finish(postTaskResults.posted));
    expect(navigation.push).toHaveBeenCalledWith(postTaskResults.posted.redirectTo);
    expect(screen.getByText(messages.feedback.success.submitted)).toBeInTheDocument();
  });

  it('still validates timing after going Back from an invalid budget edit', async () => {
    const user = userEvent.setup();
    mount({ initialStep: 'budget' });
    const price = screen.getByRole('textbox', { name: 'Task price ($)' });
    await user.clear(price); await user.type(price, '12.345');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-17' } });
    await user.selectOptions(screen.getByLabelText('Window starts'), '09:00');
    await user.selectOptions(screen.getByLabelText('Window ends'), '08:00');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Pick a start at least 3 hours from now.')).toBeInTheDocument();
    expect(screen.getByText('Step 6 of 8 · When')).toBeInTheDocument();
  });

  it('shows a validation summary for an unrecognized server field', async () => {
    const user = userEvent.setup();
    mount({ initialStep: 'review', handlers: { ...fakePostTaskHandlers, onPost: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { unexpected: ['invalid'] } }, 0) } });
    await user.click(screen.getByRole('button', { name: 'Post task' }));
    expect(await screen.findByText(messages.feedback.error.validation_failed)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.forms.getHelp })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('routes a dotted server error to when and focuses the invalid time', async () => {
    const user = userEvent.setup();
    mount({ initialStep: 'review', handlers: { ...fakePostTaskHandlers, onPost: fakeHandler(postTaskResults.tooSoon, 0) } });
    await user.click(screen.getByRole('button', { name: 'Post task' }));
    expect(await screen.findByText('Step 6 of 8 · When')).toBeInTheDocument();
    expect(await screen.findByText('Pick a start at least 3 hours from now.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Window starts')).toHaveFocus());
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each([postTaskResults.limitReached, { ok: false, code: 'unknown' } as const])('announces $code and keeps the draft on failed post', async (result) => {
    const user = userEvent.setup();
    mount({ initialStep: 'review', handlers: { ...fakePostTaskHandlers, onPost: fakeHandler(result, 0) }, persistDraft: true });
    await user.click(screen.getByRole('button', { name: 'Post task' }));
    const text = result.code === 'limit_reached' ? messages.forms.actionErrors.limit_reached : messages.feedback.error.unknown;
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(sessionStorage.getItem(draftStorageKey('austin'))).not.toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('restores values and the current step after remount, stores only photo ids, and clears storage after posting', async () => {
    const user = userEvent.setup();
    const first = mount({ initialStep: 'describe', persistDraft: true });
    fireEvent.change(screen.getByRole('textbox', { name: messages.postTask.describe.title }), { target: { value: 'Assemble my flat-pack desk' } });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    first.unmount();
    const second = mount({ persistDraft: true });
    expect(await screen.findByText('Step 3 of 8 · Details')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('textbox', { name: messages.postTask.describe.title })).toHaveValue('Assemble my flat-pack desk');
    const raw = sessionStorage.getItem(draftStorageKey('austin'))!;
    expect(JSON.parse(raw).values.photoIds).toEqual(deskDraft.photoIds);
    expect(raw).not.toContain('blob:'); expect(raw).not.toContain('src');
    second.unmount();
    sessionStorage.setItem(draftStorageKey('austin'), JSON.stringify({ values: deskDraft, step: 'review', address: addressSuggestions[0] }));
    mount({ persistDraft: true });
    await user.click(await screen.findByRole('button', { name: 'Post task' }));
    await waitFor(() => expect(sessionStorage.getItem(draftStorageKey('austin'))).toBeNull());
  });

  it('recovers from malformed stored review data without rendering an invalid review', async () => {
    sessionStorage.setItem(draftStorageKey('austin'), JSON.stringify({ values: { ...deskDraft, categorySlug: undefined }, step: 'review' }));
    mount({ persistDraft: true });
    expect(await screen.findByText('Your draft is ready to continue.')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 8 · Category')).toBeInTheDocument();
  });

  it('uses the supplied storage key and resolves restored photo ids without storing image URLs', async () => {
    const scopedKey = 'tasksnearme:post-task:maya:austin:v1';
    const legacyDraft = JSON.stringify({ values: { ...deskDraft, title: 'A different saved draft' }, step: 'describe' });
    sessionStorage.setItem(draftStorageKey('austin'), legacyDraft);
    sessionStorage.setItem(scopedKey, JSON.stringify({ values: deskDraft, step: 'photos' }));
    const onResolvePhotos = vi.fn(async () => [uploadedTaskPhotos[0]!]);
    const view = mount({ data: { ...postTaskPageData, draftStorageKey: scopedKey }, handlers: { ...fakePostTaskHandlers, onResolvePhotos }, persistDraft: true });
    expect(await screen.findByRole('img', { name: uploadedTaskPhotos[0]!.alt })).toHaveAttribute('src', uploadedTaskPhotos[0]!.src);
    expect(onResolvePhotos).toHaveBeenCalledExactlyOnceWith({ photoIds: deskDraft.photoIds });
    const raw = sessionStorage.getItem(scopedKey)!;
    expect(JSON.parse(raw).values.photoIds).toEqual(deskDraft.photoIds);
    expect(raw).not.toContain('src');
    expect(sessionStorage.getItem(draftStorageKey('austin'))).toBe(legacyDraft);
    view.unmount();

    sessionStorage.setItem(scopedKey, JSON.stringify({ values: deskDraft, step: 'review', address: addressSuggestions[0] }));
    mount({ data: { ...postTaskPageData, draftStorageKey: scopedKey }, persistDraft: true });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Post task' }));
    await waitFor(() => expect(sessionStorage.getItem(scopedKey)).toBeNull());
    expect(sessionStorage.getItem(draftStorageKey('austin'))).toBe(legacyDraft);
  });

  it('does not restore a photo removed while thumbnails are loading', async () => {
    sessionStorage.setItem(draftStorageKey('austin'), JSON.stringify({ values: deskDraft, step: 'photos' }));
    let finish!: (photos: Photo[]) => void;
    const onResolvePhotos = vi.fn(() => new Promise<Photo[]>((resolve) => { finish = resolve; }));
    mount({ handlers: { ...fakePostTaskHandlers, onResolvePhotos }, persistDraft: true });
    expect(await screen.findByText(messages.postTask.photos.loadingSaved)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove photo 1' }));
    await act(async () => finish([uploadedTaskPhotos[0]!]));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(draftStorageKey('austin'))!).values.photoIds).toEqual([]);
  });

  it('keeps saved photo ids and announces when thumbnail resolution fails', async () => {
    sessionStorage.setItem(draftStorageKey('austin'), JSON.stringify({ values: deskDraft, step: 'photos' }));
    mount({ handlers: { ...fakePostTaskHandlers, onResolvePhotos: async () => { throw new Error('Unavailable'); } }, persistDraft: true });
    expect(await screen.findByText(messages.postTask.photos.restoreFailed)).toBeInTheDocument();
    expect(screen.getByText(messages.postTask.photos.restoredHint)).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(draftStorageKey('austin'))!).values.photoIds).toEqual(deskDraft.photoIds);
  });

  it('clears obsolete thumbnail loading when same-scope data refreshes after removing the saved photo', async () => {
    sessionStorage.setItem(draftStorageKey('austin'), JSON.stringify({ values: deskDraft, step: 'photos' }));
    let finish!: (photos: Photo[]) => void;
    const onResolvePhotos = vi.fn(() => new Promise<Photo[]>((resolve) => { finish = resolve; }));
    const handlers = { ...fakePostTaskHandlers, onResolvePhotos };
    const tree = () => <NextIntlClientProvider locale="en" messages={messages}><PostTaskScreen data={{ ...postTaskPageData }} handlers={handlers} /></NextIntlClientProvider>;
    const view = render(tree());
    expect(await screen.findByText(messages.postTask.photos.loadingSaved)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove photo 1' }));
    view.rerender(tree());
    await waitFor(() => expect(screen.queryByText(messages.postTask.photos.loadingSaved)).not.toBeInTheDocument());
    await act(async () => finish([uploadedTaskPhotos[0]!]));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(onResolvePhotos).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(draftStorageKey('austin'))!).values.photoIds).toEqual([]);
  });

  it('starts a separate in-memory draft when the person-scoped key changes', async () => {
    const firstKey = 'tasksnearme:post-task:maya:austin:v1';
    const secondKey = 'tasksnearme:post-task:ruth:austin:v1';
    sessionStorage.setItem(firstKey, JSON.stringify({ values: deskDraft, step: 'describe' }));
    const tree = (key: string) => <NextIntlClientProvider locale="en" messages={messages}><PostTaskScreen data={{ ...postTaskPageData, draftStorageKey: key }} handlers={fakePostTaskHandlers} initialStep="describe" /></NextIntlClientProvider>;
    const view = render(tree(firstKey));
    await waitFor(() => expect(screen.getByRole('textbox', { name: messages.postTask.describe.title })).toHaveValue(deskDraft.title));
    view.rerender(tree(secondKey));
    await waitFor(() => expect(sessionStorage.getItem(secondKey)).not.toBeNull());
    expect(screen.getByRole('textbox', { name: messages.postTask.describe.title })).toHaveValue('');
    expect(JSON.parse(sessionStorage.getItem(secondKey)!).values.title).toBe('');
    expect(JSON.parse(sessionStorage.getItem(firstKey)!).values.title).toBe(deskDraft.title);
  });
});
