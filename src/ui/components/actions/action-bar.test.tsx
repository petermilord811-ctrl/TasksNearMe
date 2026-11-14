/** @vitest-environment jsdom */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, ACTION_SUCCESS_CODES, ALL_ACTION_IDS, DISABLED_REASON_CODES, type ActionDescriptor, type ActionResult } from '@/contracts';
import { deskBeforeNoShowPosterActions, deskCompletionSubmittedPosterActions } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import actions from '../../../../messages/en/ui/actions.json';
import feedback from '../../../../messages/en/ui/feedback.json';
import reasons from '../../../../messages/en/ui/actionReasons.json';
import { ActionBar } from './action-bar';

const { push, toastSuccess, toastError } = vi.hoisted(() => ({ push: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function show(descriptors: ActionDescriptor[], onAction = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'saved' }))) {
  return render(<NextIntlClientProvider locale="en" messages={uiMessages}><ActionBar actions={descriptors} onAction={onAction} /></NextIntlClientProvider>);
}

describe('action copy coverage', () => {
  it('labels every contract action and result code', () => {
    for (const id of ALL_ACTION_IDS) expect(actions).toHaveProperty(id, expect.any(String));
    for (const code of ACTION_ERROR_CODES) expect(feedback.error).toHaveProperty(code, expect.any(String));
    for (const code of ACTION_SUCCESS_CODES) expect(feedback.success).toHaveProperty(code, expect.any(String));
    for (const code of DISABLED_REASON_CODES) expect(reasons).toHaveProperty(code, expect.any(String));
  });
});

describe('ActionBar', () => {
  it('displays the disabled reason and does not call its handler', async () => {
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'saved' }));
    show(deskBeforeNoShowPosterActions, handler);
    const button = screen.getByRole('button', { name: 'Report a no-show' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Available at 11:00 am');
    await userEvent.click(button);
    expect(handler).not.toHaveBeenCalled();
  });

  it('waits for confirmation before calling the handler', async () => {
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'approved' }));
    show(deskCompletionSubmittedPosterActions, handler);
    await userEvent.click(screen.getByRole('button', { name: 'Approve task' }));
    expect(handler).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(handler).toHaveBeenCalledExactlyOnceWith('approve');
    expect(await screen.findByText('Task approved')).toBeVisible();
  });

  it('does not invoke an action when confirmation is canceled', async () => {
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'approved' }));
    show(deskCompletionSubmittedPosterActions, handler);
    await userEvent.click(screen.getByRole('button', { name: 'Approve task' }));
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(handler).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('disables the submitting button while the promise is pending', async () => {
    let finish: (result: ActionResult) => void = () => {};
    const handler = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    show([{ id: 'message', kind: 'primary', enabled: true }], handler);
    const button = screen.getByRole('button', { name: 'Send message' });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await act(async () => finish({ ok: true, code: 'sent' }));
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-busy', 'false');
  });

  it.each(ACTION_ERROR_CODES)('shows friendly %s feedback without assuming success', async (code) => {
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code }));
    show([{ id: 'pay', kind: 'primary', enabled: true }], handler);
    await userEvent.click(screen.getByRole('button', { name: 'Finish payment' }));
    expect(await screen.findByText(feedback.error[code])).toBeVisible();
    expect(toastError).toHaveBeenCalledWith(feedback.error[code]);
    expect(push).not.toHaveBeenCalled();
  });

  it('handles rejected handler promises with unknown-error copy', async () => {
    show([{ id: 'pay', kind: 'primary', enabled: true }], vi.fn(async () => { throw new Error('Network unavailable'); }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish payment' }));
    expect(await screen.findByText(feedback.error.unknown)).toBeVisible();
  });

  it('follows a successful redirect', async () => {
    show([{ id: 'pay', kind: 'primary', enabled: true }], vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'paid', redirectTo: '/app/bookings/desk' })));
    await userEvent.click(screen.getByRole('button', { name: 'Finish payment' }));
    expect(push).toHaveBeenCalledExactlyOnceWith('/app/bookings/desk');
  });

  it('preserves the given order even when the primary action is not first', () => {
    const descriptors: ActionDescriptor[] = [{ id: 'message', kind: 'secondary', enabled: true }, { id: 'approve', kind: 'primary', enabled: true }, { id: 'cancel', kind: 'destructive', enabled: true }];
    const { container } = show(descriptors);
    expect(Array.from(container.querySelectorAll('[data-action-id]'), (element) => element.getAttribute('data-action-id'))).toEqual(['message', 'approve', 'cancel']);
  });

  it('keeps secondary actions and their reasons in the mobile More sheet', async () => {
    show(deskBeforeNoShowPosterActions);
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More actions' });
    expect(Array.from(sheet.querySelectorAll('[data-action-id]'), (element) => element.getAttribute('data-action-id'))).toEqual(deskBeforeNoShowPosterActions.slice(1).map((action) => action.id));
    expect(within(sheet).getByRole('button', { name: 'Report a no-show' })).toHaveAccessibleDescription('Available at 11:00 am');
  });

  it('returns focus to the button after a confirmed action, and to the result once the button is gone', async () => {
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'approved' }));
    const { rerender } = show(deskCompletionSubmittedPosterActions, handler);
    const approve = screen.getByRole('button', { name: 'Approve task' });
    approve.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Task approved')).toBeVisible();
    expect(approve).toHaveFocus();
    // The refreshed booking has other actions: focus moves to the result, not to the top of the page.
    rerender(<NextIntlClientProvider locale="en" messages={uiMessages}><ActionBar actions={[{ id: 'message', kind: 'secondary', enabled: true }]} onAction={handler} /></NextIntlClientProvider>);
    expect(approve).not.toBeInTheDocument();
    expect(screen.getByText('Task approved').closest('[tabindex="-1"]')).toHaveFocus();
  });

  it('moves focus to the next action when a refresh removes the focused one without a result', () => {
    const { rerender } = show([{ id: 'approve', kind: 'primary', enabled: true }, { id: 'message', kind: 'secondary', enabled: true }]);
    act(() => screen.getByRole('button', { name: 'Approve task' }).focus());
    rerender(<NextIntlClientProvider locale="en" messages={uiMessages}><ActionBar actions={[{ id: 'message', kind: 'secondary', enabled: true }]} onAction={vi.fn()} /></NextIntlClientProvider>);
    expect(screen.getByRole('button', { name: 'Send message' })).toHaveFocus();
  });

  it('does not submit twice while an action is pending', async () => {
    let finish: (result: ActionResult) => void = () => {};
    const handler = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    show([{ id: 'message', kind: 'primary', enabled: true }], handler);
    const button = screen.getByRole('button', { name: 'Send message' });
    await userEvent.dblClick(button);
    expect(handler).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, code: 'sent' }));
  });
});
