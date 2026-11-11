/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, type AdminCaseHandlers, type RevealConversationResult } from '@/contracts';
import { ADMIN_NOW, reportAdminCaseData, reportedConversation } from '@/fixtures';
import { formatDateTime } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import adminCase from '../../../../messages/en/ui/adminCase.json';
import { AdminConversationGate } from './admin-conversation-gate';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const copy = adminCase.conversation;
const reason = 'Review the payment report.';

function mount(onRevealConversation = vi.fn<AdminCaseHandlers['onRevealConversation']>().mockResolvedValue({ ok: true, conversation: reportedConversation })) {
  return { onRevealConversation, ...render(<NextIntlClientProvider locale="en" messages={{ ...messages, adminCase }}><AdminConversationGate context={reportAdminCaseData.context!} onRevealConversation={onRevealConversation} now={ADMIN_NOW} /></NextIntlClientProvider>) };
}

const input = () => screen.getByRole('textbox', { name: copy.reason });
const submit = () => screen.getByRole('button', { name: copy.submit });

describe('AdminConversationGate', () => {
  it('keeps messages hidden until a reason of at least ten characters is submitted and discloses logging', async () => {
    const user = userEvent.setup();
    const { onRevealConversation } = mount();
    expect(screen.queryByText(reportedConversation.messages[1]!.body)).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: copy.messages })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.open }));
    const dialog = screen.getByRole('dialog', { name: copy.open });
    expect(dialog).toHaveAccessibleDescription(copy.loggedHint);
    expect(within(dialog).getByText(copy.loggedHint)).toBeVisible();
    fireEvent.change(input(), { target: { value: '123456789' } });
    await user.click(submit());
    expect(await screen.findByText(copy.reasonRequired)).toBeVisible();
    await waitFor(() => expect(input()).toHaveFocus());
    expect(onRevealConversation).not.toHaveBeenCalled();
    expect(screen.queryByText(reportedConversation.messages[1]!.body)).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: '  1234567890  ' } });
    await user.click(submit());
    expect(await screen.findByText(copy.logged)).toBeVisible();
    expect(onRevealConversation).toHaveBeenCalledExactlyOnceWith({ reason: '1234567890' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.open })).not.toBeInTheDocument();
    const items = within(screen.getByRole('list', { name: copy.messages })).getAllByRole('listitem');
    expect(items).toHaveLength(reportedConversation.messages.length);
    reportedConversation.messages.forEach((message, index) => {
      expect(items[index]).toHaveTextContent(message.body);
      expect(items[index]).toHaveTextContent(message.sender!.displayName);
      expect(items[index]).toHaveTextContent(formatDateTime(message.at));
    });
    await waitFor(() => expect(screen.getByText(copy.logged).parentElement).toHaveFocus());
  });

  it('locks the form and dialog while opening, prevents duplicate requests, and keeps a rejected reason available to retry', async () => {
    const user = userEvent.setup();
    let finish!: (result: RevealConversationResult) => void;
    const onRevealConversation = vi.fn<AdminCaseHandlers['onRevealConversation']>().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce({ ok: true, conversation: reportedConversation });
    mount(onRevealConversation);
    await user.click(screen.getByRole('button', { name: copy.open }));
    fireEvent.change(input(), { target: { value: reason } });
    await user.click(submit());
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true');
    expect(input()).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.opening })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.cancel })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form'));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(onRevealConversation).toHaveBeenCalledOnce();
    await act(async () => finish({ ok: false, code: 'unknown' }));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(input()).toHaveValue(reason);
    expect(input()).toBeEnabled();
    expect(screen.queryByText(reportedConversation.messages[1]!.body)).not.toBeInTheDocument();
    await user.click(submit());
    expect(await screen.findByText(copy.logged)).toBeVisible();
    expect(onRevealConversation).toHaveBeenCalledTimes(2);
  });

  it.each(ACTION_ERROR_CODES)('shows friendly %s failure copy without revealing the conversation', async (code) => {
    const user = userEvent.setup();
    mount(vi.fn<AdminCaseHandlers['onRevealConversation']>().mockResolvedValue({ ok: false, code, ...(code === 'validation_failed' ? { fieldErrors: { reason: ['too_short'] } } : {}) }));
    await user.click(screen.getByRole('button', { name: copy.open }));
    fireEvent.change(input(), { target: { value: reason } });
    await user.click(submit());
    const expected = messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] ?? messages.feedback.error[code];
    expect(await screen.findByText(expected)).toBeVisible();
    expect(input()).toHaveValue(reason);
    expect(screen.queryByText(reportedConversation.messages[1]!.body)).not.toBeInTheDocument();
    if (code === 'validation_failed') {
      expect(await screen.findByText(copy.reasonRequired)).toBeVisible();
      await waitFor(() => expect(input()).toHaveFocus());
    }
  });

  it('catches a rejected query and restores the opening control on cancellation', async () => {
    const user = userEvent.setup();
    mount(vi.fn<AdminCaseHandlers['onRevealConversation']>().mockRejectedValue(new Error('offline')));
    const opener = screen.getByRole('button', { name: copy.open });
    await user.click(opener);
    fireEvent.change(input(), { target: { value: reason } });
    await user.click(submit());
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    await user.click(screen.getByRole('button', { name: copy.cancel }));
    await waitFor(() => expect(opener).toHaveFocus());
    expect(screen.queryByRole('list', { name: copy.messages })).not.toBeInTheDocument();
  });
});
