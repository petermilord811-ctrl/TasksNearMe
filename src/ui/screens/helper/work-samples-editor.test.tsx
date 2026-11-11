/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ActionResult, HelperProfileEditorHandlers, WorkSampleUploadResult } from '@/contracts';
import { samProfileEditorData, uploadedTaskPhotos } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import helperProfileEditor from '../../../../messages/en/ui/helperProfileEditor.json';
import { WorkSamplesEditor } from './work-samples-editor';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const uploadedSample = { id: 'ws_new', photo: uploadedTaskPhotos[1]!, caption: 'Completed desk' };
const baseHandlers = {
  onUploadWorkSample: vi.fn(async (): Promise<WorkSampleUploadResult> => ({ ok: true, photo: uploadedSample.photo, sample: uploadedSample })),
  onUpdateWorkSample: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' })),
  onRemoveWorkSample: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' })),
  onReorderWorkSamples: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' })),
};
function view(handlers: Partial<HelperProfileEditorHandlers> = {}, maxWorkSamples = 12, maxPhotoMegabytes = samProfileEditorData.maxPhotoMegabytes) {
  return <NextIntlClientProvider locale="en" messages={{ ...messages, helperProfileEditor }}><WorkSamplesEditor samples={samProfileEditorData.workSamples} categories={samProfileEditorData.categories} maxWorkSamples={maxWorkSamples} maxPhotoMegabytes={maxPhotoMegabytes} handlers={{ ...baseHandlers, ...handlers }} /></NextIntlClientProvider>;
}

describe('work samples editor', () => {
  it('reorders by authoritative sample ids and disables controls while saving', async () => {
    const user = userEvent.setup();
    let resolve!: (result: ActionResult) => void;
    const reorder = vi.fn((_input: { ids: string[] }) => new Promise<ActionResult>((done) => { resolve = done; }));
    render(view({ onReorderWorkSamples: reorder }));
    expect(screen.getByRole('button', { name: 'Move up: sample 1' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move down: sample 1' }));
    expect(reorder).toHaveBeenCalledWith({ ids: ['ws_2', 'ws_1', 'ws_3'] });
    expect(screen.getByRole('button', { name: 'Save sample 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move down: sample 1' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Move up: sample 1' })).toHaveAttribute('aria-busy', 'false');
    await act(async () => { resolve({ ok: true, code: 'updated' }); });
    expect(within(screen.getByRole('form', { name: 'Work sample 1' })).getByLabelText('Caption (optional)')).toHaveValue(samProfileEditorData.workSamples[1]!.caption);
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('preserves order on a failed reorder and shows unmapped field errors as a visible result', async () => {
    const user = userEvent.setup();
    render(view({ onReorderWorkSamples: async () => ({ ok: false, code: 'validation_failed', fieldErrors: { ids: ['invalid'] } }) }));
    await user.click(screen.getByRole('button', { name: 'Move down: sample 1' }));
    expect(within(screen.getByRole('form', { name: 'Work sample 1' })).getByLabelText('Caption (optional)')).toHaveValue(samProfileEditorData.workSamples[0]!.caption);
    expect(await screen.findByText(messages.feedback.error.validation_failed)).toBeInTheDocument();
  });

  it('requires confirmation before removal and supports canceling', async () => {
    const user = userEvent.setup();
    render(view());
    await user.click(screen.getByRole('button', { name: 'Remove sample 1' }));
    expect(baseHandlers.onRemoveWorkSample).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Remove this work sample?');
    await user.click(screen.getByRole('button', { name: 'Keep work sample' }));
    expect(baseHandlers.onRemoveWorkSample).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove sample 1' }));
    await user.click(screen.getByRole('button', { name: 'Remove work sample' }));
    expect(baseHandlers.onRemoveWorkSample).toHaveBeenCalledWith({ id: 'ws_1' });
    expect(screen.getAllByRole('form')).toHaveLength(2);
  });

  it('saves caption and category independently and follows redirectTo', async () => {
    const user = userEvent.setup();
    const update = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated', redirectTo: '/preview-saved' }));
    render(view({ onUpdateWorkSample: update }));
    const form = screen.getByRole('form', { name: 'Work sample 1' });
    await user.clear(within(form).getByLabelText('Caption (optional)'));
    await user.type(within(form).getByLabelText('Caption (optional)'), 'A finished desk');
    await user.selectOptions(within(form).getByLabelText('Service (optional)'), 'furniture-assembly');
    await user.click(within(form).getByRole('button', { name: 'Save sample 1' }));
    expect(update).toHaveBeenCalledWith({ id: 'ws_1', caption: 'A finished desk', categorySlug: 'furniture-assembly' });
    expect(push).toHaveBeenCalledWith('/preview-saved');
  });

  it('uploads metadata and immediately captions, reorders, and removes the returned sample without a refresh', async () => {
    const user = userEvent.setup();
    let resolve!: (result: WorkSampleUploadResult) => void;
    const upload = vi.fn((_input: FormData) => new Promise<WorkSampleUploadResult>((done) => { resolve = done; }));
    render(view({ onUploadWorkSample: upload }, 4));
    const file = new File(['photo'], 'desk.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Photo'), file);
    const captions = screen.getAllByLabelText('Caption (optional)');
    await user.type(captions[captions.length - 1]!, 'Completed desk');
    await user.click(screen.getByRole('button', { name: 'Upload work sample' }));
    expect(upload.mock.calls[0]![0].get('file')).toBe(file);
    expect(upload.mock.calls[0]![0].get('caption')).toBe('Completed desk');
    expect(screen.getByRole('button', { name: 'Uploading work sample' })).toBeDisabled();
    await act(async () => { resolve({ ok: true, photo: uploadedSample.photo, sample: uploadedSample }); });
    expect(screen.getByText('4 of 4 work samples')).toBeInTheDocument();
    expect(screen.queryByText(helperProfileEditor.samples.awaitingSync)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload work sample' })).toBeDisabled();
    expect(refresh).not.toHaveBeenCalled();
    const form = within(screen.getByRole('form', { name: 'Work sample 4' }));
    expect(form.getByLabelText('Caption (optional)')).toHaveValue('Completed desk');
    await user.clear(form.getByLabelText('Caption (optional)'));
    await user.type(form.getByLabelText('Caption (optional)'), 'Desk with drawers');
    await user.click(form.getByRole('button', { name: 'Save sample 4' }));
    expect(baseHandlers.onUpdateWorkSample).toHaveBeenCalledWith({ id: 'ws_new', caption: 'Desk with drawers', categorySlug: undefined });
    await user.click(screen.getByRole('button', { name: 'Move up: sample 4' }));
    expect(baseHandlers.onReorderWorkSamples).toHaveBeenCalledWith({ ids: ['ws_1', 'ws_2', 'ws_new', 'ws_3'] });
    expect(within(screen.getByRole('form', { name: 'Work sample 3' })).getByLabelText('Caption (optional)')).toHaveValue('Desk with drawers');
    await user.click(screen.getByRole('button', { name: 'Remove sample 3' }));
    await user.click(screen.getByRole('button', { name: 'Remove work sample' }));
    expect(baseHandlers.onRemoveWorkSample).toHaveBeenCalledWith({ id: 'ws_new' });
    expect(screen.getByText('3 of 4 work samples')).toBeInTheDocument();
  });

  it.each(['too_large', 'unsupported_type', 'too_many', 'rate_limited', 'unknown'] as const)('preserves existing samples and metadata after a %s upload error', async (code) => {
    const user = userEvent.setup();
    render(view({ onUploadWorkSample: async () => ({ ok: false, code }) }));
    await user.upload(screen.getByLabelText('Photo'), new File(['photo'], 'desk.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Upload work sample' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('3 of 12 work samples')).toBeInTheDocument();
    expect(screen.getAllByRole('form')).toHaveLength(3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('counts an uploaded photo once when authoritative props arrive before the upload completes', async () => {
    const user = userEvent.setup();
    let resolve!: (result: WorkSampleUploadResult) => void;
    const upload = vi.fn((_input: FormData) => new Promise<WorkSampleUploadResult>((done) => { resolve = done; }));
    const rendered = render(view({ onUploadWorkSample: upload }, 4));
    await user.upload(screen.getByLabelText('Photo'), new File(['photo'], 'desk.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Upload work sample' }));
    rendered.rerender(<NextIntlClientProvider locale="en" messages={{ ...messages, helperProfileEditor }}><WorkSamplesEditor samples={[...samProfileEditorData.workSamples, uploadedSample]} categories={samProfileEditorData.categories} maxWorkSamples={4} maxPhotoMegabytes={samProfileEditorData.maxPhotoMegabytes} handlers={{ ...baseHandlers, onUploadWorkSample: upload }} /></NextIntlClientProvider>);
    await act(async () => { resolve({ ok: true, photo: uploadedSample.photo, sample: uploadedSample }); });
    expect(screen.getByText('4 of 4 work samples')).toBeInTheDocument();
    expect(screen.queryByText(helperProfileEditor.samples.awaitingSync)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save sample 4' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove sample 4' }));
    await user.click(screen.getByRole('button', { name: 'Remove work sample' }));
    expect(screen.getByText('3 of 4 work samples')).toBeInTheDocument();
    expect(screen.queryByText(helperProfileEditor.samples.awaitingSync)).not.toBeInTheDocument();
  });

  it('rejects unsupported files before upload and respects the supplied sample limit', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const rendered = render(view());
    await user.upload(screen.getByLabelText('Photo'), new File(['text'], 'notes.txt', { type: 'text/plain' }));
    await user.click(screen.getByRole('button', { name: 'Upload work sample' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(helperProfileEditor.samples.errors.unsupported_type);
    expect(baseHandlers.onUploadWorkSample).not.toHaveBeenCalled();
    rendered.rerender(view({}, 3));
    expect(screen.getByLabelText('Photo')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Upload work sample' })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Photo').closest('form')!);
    expect(baseHandlers.onUploadWorkSample).not.toHaveBeenCalled();
  });

  it('explains the supplied size limit and rejects oversized photos before upload', async () => {
    const user = userEvent.setup();
    render(view({}, 12, 2));
    const input = screen.getByLabelText('Photo');
    expect(input).toHaveAccessibleDescription('Choose a JPEG, PNG, WebP, or HEIC photo, up to 2 MB.');
    const file = new File(['photo'], 'large.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 + 1 });
    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: 'Upload work sample' }));
    expect(screen.getByRole('alert')).toHaveTextContent('This photo is too large. Choose a photo up to 2 MB and try again.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(baseHandlers.onUploadWorkSample).not.toHaveBeenCalled();
  });

  it('allows photos exactly at the supplied size limit', async () => {
    const user = userEvent.setup();
    render(view({}, 12, 2));
    const file = new File(['photo'], 'limit.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 });
    await user.upload(screen.getByLabelText('Photo'), file);
    await user.click(screen.getByRole('button', { name: 'Upload work sample' }));
    expect(baseHandlers.onUploadWorkSample).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps legacy photo-only responses separate until their sample id arrives', async () => {
    const user = userEvent.setup();
    render(view({ onUploadWorkSample: async () => ({ ok: true, photo: uploadedSample.photo }) }, 4));
    await user.upload(screen.getByLabelText('Photo'), new File(['photo'], 'desk.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Upload work sample' }));
    expect(screen.getByText(helperProfileEditor.samples.awaitingSync)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save sample 4' })).not.toBeInTheDocument();
    expect(screen.getByText('4 of 4 work samples')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
