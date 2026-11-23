/** @vitest-environment jsdom */
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import type { AddressSuggestion, Photo, PhotoUploadResult, PostTaskHandlers, TaskDraftInput } from '@/contracts';
import { routes } from '@/contracts';
import { addressSuggestions, aiDeskDraft, deskDraft, fakePostTaskHandlers, outOfAreaSuggestion, postTaskPageData, uploadedTaskPhotos } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { DescribeStep } from './describe-step';
import { PhotosStep } from './photos-step';
import { LocationStep } from './location-step';

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test-photo') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

function Harness({ children, initialValues = deskDraft }: { children: ReactNode; initialValues?: TaskDraftInput }) {
  const form = useForm<TaskDraftInput>({ defaultValues: initialValues });
  const values = useWatch({ control: form.control });
  return <NextIntlClientProvider locale="en" messages={messages}><FormProvider {...form}><form>{children}<output data-testid="draft">{JSON.stringify(values)}</output></form></FormProvider></NextIntlClientProvider>;
}
function draft() { return JSON.parse(screen.getByTestId('draft').textContent!) as TaskDraftInput; }
function LocationHarness({ handlers }: { handlers: PostTaskHandlers }) {
  const [address, setAddress] = useState<AddressSuggestion>();
  return <LocationStep data={postTaskPageData} handlers={handlers} selectedAddress={address} onAddressChange={setAddress} />;
}
function ModeErrorControl() {
  const form = useFormContext<TaskDraftInput>();
  return <button type="button" onClick={() => form.setError('location.mode', { type: 'server', message: 'not_supported' }, { shouldFocus: true })}>Reject location mode</button>;
}
function PlaceErrorControl() {
  const form = useFormContext<TaskDraftInput>();
  return <button type="button" onClick={() => form.setError('location.placeId', { type: 'server', message: 'not_supported' })}>Reject the address</button>;
}
function PhotosHarness({ handlers, onBusyChange }: { handlers: PostTaskHandlers; onBusyChange?: (busy: boolean) => void }) {
  const [photos, setPhotos] = useState<Photo[]>([uploadedTaskPhotos[0]!]);
  return <PhotosStep data={postTaskPageData} handlers={handlers} photos={photos} onPhotosChange={setPhotos} onBusyChange={onBusyChange} />;
}

describe('posting: Rewrite with AI in the description field', () => {
  const field = () => screen.getByRole('textbox', { name: 'What do you need help with?' });

  it('rewrites the description in place, suggests a title beside the person’s own, and Undo puts everything back, posting nothing', async () => {
    const user = userEvent.setup();
    const onPost = vi.fn(fakePostTaskHandlers.onPost);
    render(<Harness><DescribeStep data={postTaskPageData} handlers={{ ...fakePostTaskHandlers, onPost }} initialSuggestion={aiDeskDraft} /></Harness>);
    await waitFor(() => expect(field()).toHaveValue(aiDeskDraft.description));
    // Maya's own title stays; the AI's is offered beside it.
    expect(draft()).toMatchObject({ title: deskDraft.title, description: aiDeskDraft.description, details: { ...deskDraft.details, ...aiDeskDraft.details } });
    expect(screen.getByText(`Suggested title: ${aiDeskDraft.title}`)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(aiDeskDraft.openQuestions.length);
    await user.click(screen.getByRole('button', { name: 'Use this title' }));
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveValue(aiDeskDraft.title);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(draft()).toMatchObject({ title: deskDraft.title, description: deskDraft.description, details: deskDraft.details });
    expect(screen.getByText(messages.postTask.describe.undone)).toHaveAttribute('role', 'status');
    expect(onPost).not.toHaveBeenCalled();
  });

  it('sends what the person wrote, fills an empty title, and drops Undo once they edit the new text', async () => {
    const user = userEvent.setup();
    const onDraftWithAi = vi.fn(async () => ({ ok: true as const, draft: aiDeskDraft }));
    render(<Harness initialValues={{ ...deskDraft, title: '', description: '' }}><DescribeStep data={postTaskPageData} handlers={{ ...fakePostTaskHandlers, onDraftWithAi }} /></Harness>);
    const rewrite = screen.getByRole('button', { name: 'Rewrite with AI' });
    await user.type(field(), 'de');
    expect(rewrite).toBeDisabled();
    await user.type(field(), 'sk to build');
    await user.click(rewrite);
    expect(onDraftWithAi).toHaveBeenCalledWith({ categorySlug: deskDraft.categorySlug, text: 'desk to build' });
    await waitFor(() => expect(field()).toHaveValue(aiDeskDraft.description));
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveValue(aiDeskDraft.title);
    expect(screen.queryByText(/Suggested title/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    await user.type(field(), ' Thanks!');
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it.each(['unavailable', 'rate_limited', 'prohibited'] as const)('shows the %s answer and leaves the words as they were', async (code) => {
    const user = userEvent.setup();
    const handler = vi.fn(async () => ({ ok: false as const, code }));
    render(<Harness><DescribeStep data={postTaskPageData} handlers={{ ...fakePostTaskHandlers, onDraftWithAi: handler }} /></Harness>);
    await user.clear(field());
    await user.type(field(), 'Put together my desk');
    await user.click(screen.getByRole('button', { name: 'Rewrite with AI' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(messages.postTask.describe.errors[code]);
    expect(handler).toHaveBeenCalledWith({ categorySlug: deskDraft.categorySlug, text: 'Put together my desk' });
    expect(field()).toHaveValue('Put together my desk');
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    if (code === 'prohibited') expect(screen.getByRole('link', { name: 'See tasks we cannot help with' })).toHaveAttribute('href', routes.legal('prohibited-tasks'));
  });

  it('formats from the toolbar and previews how it will read', async () => {
    const user = userEvent.setup();
    render(<Harness initialValues={{ ...deskDraft, description: 'Things to do' }}><DescribeStep data={postTaskPageData} handlers={fakePostTaskHandlers} /></Harness>);
    await user.click(field());
    await user.click(screen.getByRole('button', { name: 'Heading' }));
    expect(field()).toHaveValue('## Things to do');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 3, name: 'Things to do' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
  });
});

describe('posting address combobox', () => {
  it('announces location mode errors with posting copy and focuses the first mode choice', async () => {
    const user = userEvent.setup();
    render(<Harness initialValues={{ ...deskDraft, location: { mode: 'remote' } }}><LocationHarness handlers={fakePostTaskHandlers} /><ModeErrorControl /></Harness>);
    await user.click(screen.getByRole('button', { name: 'Reject location mode' }));
    const modeGroup = screen.getByRole('group', { name: 'Where will this happen?' });
    expect(modeGroup).toHaveAttribute('aria-invalid', 'true');
    expect(modeGroup).toHaveAccessibleDescription(`${messages.postTask.location.modeHint} ${messages.postTask.location.errors.not_supported}`);
    expect(screen.getByRole('alert')).toHaveTextContent(messages.postTask.location.errors.not_supported);
    await waitFor(() => expect(screen.getByRole('radio', { name: 'In person' })).toHaveFocus());
  });

  it("says an address the server can't place is one it can't place, not a phone message (sweep PT12)", async () => {
    const user = userEvent.setup();
    render(<Harness initialValues={deskDraft}><LocationHarness handlers={fakePostTaskHandlers} /><PlaceErrorControl /></Harness>);
    await user.click(screen.getByRole('button', { name: 'Reject the address' }));
    expect(await screen.findByText(messages.postTask.location.unplaceable)).toBeInTheDocument();
    expect(screen.queryByText(messages.forms.fieldErrors.not_supported)).toBeNull();
  });

  it('preserves the saved address, unit, and notes when the selected mode is clicked again', async () => {
    const user = userEvent.setup();
    const onAddressChange = vi.fn();
    render(<Harness><LocationStep data={postTaskPageData} handlers={fakePostTaskHandlers} selectedAddress={addressSuggestions[0]} onAddressChange={onAddressChange} /></Harness>);
    await user.click(screen.getByRole('radio', { name: 'In person' }));
    expect(draft().location).toEqual(deskDraft.location);
    expect(screen.getByRole('combobox')).toHaveValue(addressSuggestions[0]!.line1);
    expect(onAddressChange).not.toHaveBeenCalled();
  });

  it('waits for three characters and 300 ms, takes an address in another city like any other, and selects a result with the keyboard', async () => {
    vi.useFakeTimers();
    const onSearchAddresses = vi.fn(async () => [addressSuggestions[0]!, outOfAreaSuggestion]);
    render(<Harness><LocationHarness handlers={{ ...fakePostTaskHandlers, onSearchAddresses }} /></Harness>);
    const search = screen.getByRole('combobox', { name: 'Search your address' });
    fireEvent.change(search, { target: { value: '12' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(onSearchAddresses).not.toHaveBeenCalled();
    fireEvent.change(search, { target: { value: '123' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(onSearchAddresses).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onSearchAddresses).toHaveBeenCalledWith({ query: '123' });
    const outside = screen.getByRole('option', { name: /100 Example Road/ });
    // Any US address is posted the same way (owner, 2026-11-23: "remove the limit of Location totally"): each result
    // says what helpers will see, and nothing warns about the city.
    expect(outside).not.toHaveAttribute('aria-disabled');
    expect(outside).toHaveTextContent('Helpers see: Waco, TX.');
    expect(screen.getByRole('option', { name: /Mueller, Austin/ })).toBeInTheDocument();
    fireEvent.click(outside);
    expect(draft().location).toMatchObject({ mode: 'local', placeId: outOfAreaSuggestion.placeId });
    expect(screen.getByText('Helpers see: Waco, TX.')).toBeInTheDocument();
    expect(screen.queryByText(/not open/i)).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(draft().location).toMatchObject({ mode: 'local', placeId: addressSuggestions[0]!.placeId });
    expect(search).toHaveValue(addressSuggestions[0]!.line1);
    expect(screen.getByText('Helpers see: Mueller, Austin.')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('ignores stale searches after the query changes', async () => {
    vi.useFakeTimers();
    let resolve!: (results: AddressSuggestion[]) => void;
    const onSearchAddresses = vi.fn(() => new Promise<AddressSuggestion[]>((done) => { resolve = done; }));
    render(<Harness><LocationHarness handlers={{ ...fakePostTaskHandlers, onSearchAddresses }} /></Harness>);
    const search = screen.getByRole('combobox');
    fireEvent.change(search, { target: { value: '123' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fireEvent.change(search, { target: { value: '1' } });
    await act(async () => { resolve(addressSuggestions); });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(search).toHaveValue('1');
  });
});

describe('posting photos', () => {
  it('sends file FormData, shows pending state, and adds only the uploaded id to the draft', async () => {
    const user = userEvent.setup();
    let resolve!: (result: PhotoUploadResult) => void;
    const onUploadPhoto = vi.fn((_formData: FormData) => new Promise<PhotoUploadResult>((done) => { resolve = done; }));
    const onBusyChange = vi.fn();
    render(<Harness><PhotosHarness handlers={{ ...fakePostTaskHandlers, onUploadPhoto }} onBusyChange={onBusyChange} /></Harness>);
    const file = new File(['image'], 'room.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Add photos (optional)'), file);
    expect(onUploadPhoto.mock.calls[0]![0]).toBeInstanceOf(FormData);
    expect(onUploadPhoto.mock.calls[0]![0].get('file')).toBe(file);
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByAltText('Photo preview: room.png')).toBeInTheDocument();
    await act(async () => { resolve({ ok: true, photo: uploadedTaskPhotos[1]! }); });
    expect(draft().photoIds).toEqual(['ph_box', 'ph_room']);
    expect(JSON.stringify(draft())).not.toContain('blob:');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-photo');
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole('button', { name: 'Remove photo 2' }));
    expect(draft().photoIds).toEqual(['ph_box']);
  });

  it.each(['too_large', 'unsupported_type', 'too_many', 'rate_limited', 'unknown'] as const)('shows %s upload errors and preserves the existing photos', async (code) => {
    const user = userEvent.setup();
    render(<Harness><PhotosHarness handlers={{ ...fakePostTaskHandlers, onUploadPhoto: async () => ({ ok: false, code }) }} /></Harness>);
    await user.upload(screen.getByLabelText('Add photos (optional)'), new File(['image'], 'room.png', { type: 'image/png' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(draft().photoIds).toEqual(['ph_box']);
    expect(screen.queryByAltText('Photo preview: room.png')).not.toBeInTheDocument();
  });
});
