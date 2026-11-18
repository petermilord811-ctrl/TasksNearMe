/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, routes, type ActionResult, type PhotoUploadResult, type SendMessageInput, type ThreadHandlers } from '@/contracts';
import { deskBookingThreadPageData, fakeHandler, fakeThreadHandlers, uploadedTaskPhotos } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import thread from '../../../../messages/en/ui/thread.json';
import { MessageComposer, type MessageComposerProps } from './message-composer';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

const messages = { ...uiMessages, thread };
const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function mount(props: Partial<MessageComposerProps> = {}) {
  const handlers: ThreadHandlers = {
    ...fakeThreadHandlers,
    onSend: vi.fn(fakeHandler<SendMessageInput>({ ok: true, code: 'sent' }, 0)),
    onUploadPhoto: vi.fn(async () => ({ ok: true as const, photo: uploadedTaskPhotos[0]! })),
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><TimeZoneProvider timeZone="America/Chicago"><MessageComposer rules={deskBookingThreadPageData.composer} handlers={handlers} {...props} /></TimeZoneProvider></NextIntlClientProvider>) };
}

const input = () => screen.getByRole('textbox', { name: thread.composer.label });
const send = () => screen.getByRole('button', { name: thread.composer.send });
const file = () => new File(['photo'], 'desk.jpg', { type: 'image/jpeg' });

describe('MessageComposer', () => {
  it('trims the message, submits the contract input, clears on sent, and refreshes', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.type(input(), '  See you Saturday.  ');
    await user.click(send());
    await waitFor(() => expect(handlers.onSend).toHaveBeenCalledExactlyOnceWith({ body: 'See you Saturday.', attachmentIds: [] }));
    await waitFor(() => expect(input()).toHaveValue(''));
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(screen.getByText(thread.composer.sent)).toBeInTheDocument();
  });

  it('uploads a photo and allows an attachment-only message, clearing it after sent', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(screen.getByText(thread.composer.attach));
    const upload = file();
    await user.upload(screen.getByLabelText(thread.composer.photos), upload);
    expect(handlers.onUploadPhoto).toHaveBeenCalledOnce();
    expect(vi.mocked(handlers.onUploadPhoto).mock.calls[0]![0].get('file')).toBe(upload);
    expect(await screen.findByRole('img')).toHaveAccessibleName(uploadedTaskPhotos[0]!.alt);
    await user.click(send());
    await waitFor(() => expect(handlers.onSend).toHaveBeenCalledExactlyOnceWith({ body: '', attachmentIds: [uploadedTaskPhotos[0]!.id] }));
    await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument());
  });

  it('removes a photo before sending and enforces the supplied photo count and size', async () => {
    const user = userEvent.setup();
    const { handlers } = mount({ rules: { ...deskBookingThreadPageData.composer, maxAttachments: 1, maxPhotoMegabytes: 1 } });
    await user.click(screen.getByText(thread.composer.attach));
    const uploadInput = screen.getByLabelText(thread.composer.photos);
    const large = file(); Object.defineProperty(large, 'size', { value: 1024 * 1024 + 1 });
    await user.upload(uploadInput, large);
    expect(handlers.onUploadPhoto).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('This photo is too large.');
    await user.upload(uploadInput, file());
    await screen.findByRole('img');
    await user.upload(uploadInput, file());
    expect(handlers.onUploadPhoto).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('You can add up to 1 photo.');
    await user.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(send()).toBeDisabled();
    await user.type(input(), 'Ready');
    await user.click(send());
    await waitFor(() => expect(handlers.onSend).toHaveBeenCalledExactlyOnceWith({ body: 'Ready', attachmentIds: [] }));
  });

  it('keeps the draft and attached photos after send errors and rejected requests', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn<ThreadHandlers['onSend']>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: false, code: 'rate_limited', retryAt: '2026-11-21T16:10:00.000Z' });
    mount({ handlers: { ...fakeThreadHandlers, onSend, onUploadPhoto: async () => ({ ok: true, photo: uploadedTaskPhotos[0]! }) } });
    await user.type(input(), 'Keep this draft');
    await user.click(screen.getByText(thread.composer.attach));
    await user.upload(screen.getByLabelText(thread.composer.photos), file());
    await screen.findByRole('img');
    await user.click(send());
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeInTheDocument();
    expect(input()).toHaveValue('Keep this draft'); expect(screen.getByRole('img')).toBeInTheDocument();
    await user.click(send());
    expect(await screen.findByText(thread.composer.rateLimited)).toBeInTheDocument();
    expect(screen.getByText('Try again after Sat, Nov 21 · 10:10 am (Central Time).')).toBeInTheDocument();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('blocks empty and over-limit messages, including a forged submit', async () => {
    const user = userEvent.setup();
    const { handlers } = mount({ rules: { ...deskBookingThreadPageData.composer, maxLength: 5 } });
    expect(send()).toBeDisabled();
    await user.type(input(), '   ');
    expect(send()).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: thread.composer.label }));
    expect(await screen.findByText(thread.composer.empty)).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: '123456' } });
    expect(screen.getByText('6 / 5 characters')).toBeInTheDocument();
    expect(send()).toBeDisabled();
    expect(screen.getByText('Use 5 characters or fewer before sending.')).toBeInTheDocument();
    fireEvent.submit(screen.getByRole('form', { name: thread.composer.label }));
    await waitFor(() => expect(input()).toHaveFocus());
    expect(handlers.onSend).not.toHaveBeenCalled();
  });

  it('locks send while uploading or sending and prevents duplicate requests', async () => {
    const user = userEvent.setup();
    let finishUpload!: (result: PhotoUploadResult) => void;
    let finishSend!: (result: ActionResult) => void;
    const onSend = vi.fn(() => new Promise<ActionResult>((resolve) => { finishSend = resolve; }));
    mount({ handlers: { onSend, onUploadPhoto: () => new Promise((resolve) => { finishUpload = resolve; }) } });
    await user.type(input(), 'See attached');
    await user.click(screen.getByText(thread.composer.attach));
    await user.upload(screen.getByLabelText(thread.composer.photos), file());
    expect(send()).toBeDisabled();
    fireEvent.submit(screen.getByRole('form'));
    expect(onSend).not.toHaveBeenCalled();
    await act(async () => finishUpload({ ok: true, photo: uploadedTaskPhotos[0]! }));
    await user.click(send());
    const pending = screen.getByRole('button', { name: thread.composer.sending });
    expect(pending).toBeDisabled(); expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(input()).toBeDisabled();
    fireEvent.submit(screen.getByRole('form'));
    await act(async () => finishSend({ ok: true, code: 'sent', redirectTo: routes.app.messages() }));
    expect(onSend).toHaveBeenCalledOnce();
    expect(navigation.push).toHaveBeenCalledWith(routes.app.messages());
  });

  it.each(['blocked', 'closed'] as const)('renders the %s reason without a send button', (disabledReason) => {
    mount({ rules: { ...deskBookingThreadPageData.composer, canSend: false, disabledReason } });
    expect(screen.getByRole('status')).toHaveTextContent(thread.composer[disabledReason]);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reloads after not_allowed and keeps the draft', async () => {
    const user = userEvent.setup();
    mount({ handlers: { ...fakeThreadHandlers, onSend: fakeHandler({ ok: false, code: 'not_allowed' }, 0) } });
    await user.type(input(), 'Still here'); await user.click(send());
    expect(await screen.findByText(thread.composer.notAllowed)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: thread.composer.reload }));
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(input()).toHaveValue('Still here');
  });

  it('shows server field errors and opens photo controls for attachment errors', async () => {
    const user = userEvent.setup();
    mount({ handlers: { ...fakeThreadHandlers, onSend: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { attachmentIds: ['invalid'] } }, 0) } });
    await user.type(input(), 'See attached'); await user.click(send());
    const upload = await screen.findByLabelText(thread.composer.photos);
    await waitFor(() => expect(upload).toHaveFocus());
    expect(upload).toBeVisible(); expect(upload).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Check your photos. You can attach up to 4 photos.')).toBeInTheDocument();
  });

  it.each(ACTION_ERROR_CODES)('provides translated feedback for %s', async (code) => {
    const user = userEvent.setup();
    mount({ handlers: { ...fakeThreadHandlers, onSend: fakeHandler({ ok: false, code }, 0) } });
    await user.type(input(), 'Keep this'); await user.click(send());
    const expected = code === 'not_allowed' ? thread.composer.notAllowed
      : code === 'rate_limited' ? thread.composer.rateLimited
        : messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] ?? messages.feedback.error[code];
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(input()).toHaveValue('Keep this');
  });

  it('sends on desktop Enter, but keeps Shift+Enter and composition as text input', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const { handlers } = mount();
    fireEvent.change(input(), { target: { value: 'Ready' } });
    fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    expect(handlers.onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(handlers.onSend).toHaveBeenCalledExactlyOnceWith({ body: 'Ready', attachmentIds: [] }));
  });

  it('leaves mobile Enter available for a new line', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    const { handlers } = mount();
    fireEvent.change(input(), { target: { value: 'Ready' } });
    expect(fireEvent.keyDown(input(), { key: 'Enter' })).toBe(true);
    expect(handlers.onSend).not.toHaveBeenCalled();
  });
});
