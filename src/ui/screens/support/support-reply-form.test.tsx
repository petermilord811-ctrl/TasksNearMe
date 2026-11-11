/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, routes, type ActionResult, type SupportCaseHandlers, type SupportReplyInput } from '@/contracts';
import { fakeHandler } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import supportCase from '../../../../messages/en/ui/supportCase.json';
import { SupportReplyForm } from './support-reply-form';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const messages = { ...uiMessages, supportCase };

function mount(onReply = vi.fn(fakeHandler<SupportReplyInput>({ ok: true, code: 'sent' }, 0))) {
  return { onReply, ...render(<NextIntlClientProvider locale="en" messages={messages}><SupportReplyForm handlers={{ onReply }} /></NextIntlClientProvider>) };
}
const input = () => screen.getByRole('textbox', { name: supportCase.body });
const submit = () => screen.getByRole('button', { name: supportCase.send });

describe('SupportReplyForm', () => {
  it('validates required and length limits with focus, then trims and sends, clears and refreshes', async () => {
    const user = userEvent.setup();
    const { onReply } = mount();
    await user.click(submit());
    expect(await screen.findByText(supportCase.bodyRequired)).toBeInTheDocument();
    await waitFor(() => expect(input()).toHaveFocus());
    fireEvent.change(input(), { target: { value: 'x'.repeat(2001) } });
    await user.click(submit());
    expect(await screen.findByText(supportCase.bodyTooLong)).toBeInTheDocument();
    expect(onReply).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: '  Sunday works for me.  ' } });
    await user.click(submit());
    await waitFor(() => expect(onReply).toHaveBeenCalledExactlyOnceWith({ body: 'Sunday works for me.' }));
    expect(input()).toHaveValue('');
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(screen.getByText(supportCase.sent)).toBeInTheDocument();
  });

  it('disables pending controls and prevents duplicate requests, then follows redirectTo', async () => {
    const user = userEvent.setup();
    let finish!: (result: ActionResult) => void;
    const onReply = vi.fn<SupportCaseHandlers['onReply']>(() => new Promise((resolve) => { finish = resolve; }));
    mount(onReply);
    await user.type(input(), 'Sunday works.');
    await user.click(submit());
    expect(screen.getByRole('button', { name: supportCase.sending })).toBeDisabled();
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true');
    expect(input()).toBeDisabled();
    fireEvent.submit(screen.getByRole('form'));
    await act(async () => finish({ ok: true, code: 'sent', redirectTo: routes.app.support() }));
    expect(onReply).toHaveBeenCalledOnce();
    expect(navigation.push).toHaveBeenCalledWith(routes.app.support());
  });

  it.each(ACTION_ERROR_CODES)('keeps the reply on %s and shows friendly error copy', async (code) => {
    const user = userEvent.setup();
    mount(vi.fn(fakeHandler({ ok: false, code, ...(code === 'validation_failed' ? { fieldErrors: { body: ['required'] } } : {}) }, 0)));
    await user.type(input(), 'Keep my reply.');
    await user.click(submit());
    const expected = code === 'not_allowed' ? supportCase.notAllowed : messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] ?? messages.feedback.error[code];
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(input()).toHaveValue('Keep my reply.');
    expect(navigation.refresh).not.toHaveBeenCalled();
    if (code === 'validation_failed') {
      expect(await screen.findByText(supportCase.bodyRequired)).toBeInTheDocument();
      await waitFor(() => expect(input()).toHaveFocus());
    }
  });

  it('keeps a failed network reply and can retry', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn<SupportCaseHandlers['onReply']>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, code: 'sent' });
    mount(onReply);
    await user.type(input(), 'Keep my reply.');
    await user.click(submit());
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeInTheDocument();
    expect(input()).toHaveValue('Keep my reply.');
    await user.click(submit());
    expect(await screen.findByText(supportCase.sent)).toBeInTheDocument();
    expect(onReply).toHaveBeenCalledTimes(2);
  });
});
