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
function PhotosHarness({ handlers, onBusyChange }: { handlers: PostTaskHandlers; onBusyChange?: (busy: boolean) => void }) {
  const [photos, setPhotos] = useState<Photo[]>([uploadedTaskPhotos[0]!]);
  return <PhotosStep data={postTaskPageData} handlers={handlers} photos={photos} onPhotosChange={setPhotos} onBusyChange={onBusyChange} />;
}

describe('posting AI suggestion', () => {
  it('uses the suggested title, description, and details without posting anything', async () => {
    const user = userEvent.setup();
    const onPost = vi.fn(fakePostTaskHandlers.onPost);
    render(<Harness><DescribeStep data={postTaskPageData} handlers={{ ...fakePostTaskHandlers, onPost }} initialSuggestion={aiDeskDraft} /></Harness>);
    expect(screen.getAllByRole('checkbox')).toHaveLength(aiDeskDraft.openQuestions.length);
    await user.click(screen.getByRole('button', { name: 'Use this' }));
    expect(draft()).toMatchObject({ title: aiDeskDraft.title, description: aiDeskDraft.description, details: aiDeskDraft.details });
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveValue(aiDeskDraft.title);
    expect(screen.getByRole('textbox', { name: 'What do you need help with?' })).toHaveValue(aiDeskDraft.description);
    expect(onPost).not.toHaveBeenCalled();
  });

  it('keeps existing values when a suggestion is dismissed', async () => {
    const user = userEvent.setup();
    render(<Harness><DescribeStep data={postTaskPageData} handlers={fakePostTaskHandlers} initialSuggestion={aiDeskDraft} /></Harness>);
    await user.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(draft().title).toBe(deskDraft.title);
    expect(screen.queryByText(aiDeskDraft.title)).not.toBeInTheDocument();
  });

  it.each(['unavailable', 'rate_limited', 'prohibited'] as const)('shows the %s AI response and never treats it as a suggestion', async (code) => {
    const user = userEvent.setup();
    const handler = vi.fn(async () => ({ ok: false as const, code }));
    render(<Harness><DescribeStep data={postTaskPageData} handlers={{ ...fakePostTaskHandlers, onDraftWithAi: handler }} /></Harness>);
    await user.type(screen.getByRole('textbox', { name: 'Say it your way' }), 'Put together my desk');
    await user.click(screen.getByRole('button', { name: 'Help me describe this' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(messages.postTask.describe.errors[code]);
    expect(handler).toHaveBeenCalledWith({ categorySlug: deskDraft.categorySlug, text: 'Put together my desk' });
    expect(screen.queryByRole('button', { name: 'Use this' })).not.toBeInTheDocument();
    if (code === 'prohibited') expect(screen.getByRole('link', { name: 'See tasks we cannot help with' })).toHaveAttribute('href', routes.legal('prohibited-tasks'));
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

  it('preserves the saved address, unit, and notes when the selected mode is clicked again', async () => {
    const user = userEvent.setup();
    const onAddressChange = vi.fn();
    render(<Harness><LocationStep data={postTaskPageData} handlers={fakePostTaskHandlers} selectedAddress={addressSuggestions[0]} onAddressChange={onAddressChange} /></Harness>);
    await user.click(screen.getByRole('radio', { name: 'In person' }));
    expect(draft().location).toEqual(deskDraft.location);
    expect(screen.getByRole('combobox')).toHaveValue(addressSuggestions[0]!.line1);
    expect(onAddressChange).not.toHaveBeenCalled();
  });

  it('waits for three characters and 300 ms, selects a result with the keyboard, and refuses out-of-area results', async () => {
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
    expect(outside).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(outside);
    expect(draft().location).toMatchObject({ mode: 'local', placeId: '' });
    expect(screen.getByRole('link', { name: 'Join the waitlist' })).toHaveAttribute('href', routes.waitlist());
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
