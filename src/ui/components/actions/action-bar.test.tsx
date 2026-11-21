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
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

const { push, toastSuccess, toastError } = vi.hoisted(() => ({ push: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

/** The desk's day (Sat Nov 21, Chicago): its reasons' times read without the day. */
const DESK_DAY = '2026-11-21T14:00:00.000Z';

/** `now: null` renders without the page's clock. */
function show(descriptors: ActionDescriptor[], onAction = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'saved' })), now: string | null = DESK_DAY) {
  return render(<NextIntlClientProvider locale="en" messages={uiMessages}><TimeZoneProvider timeZone="America/Chicago"><ActionBar actions={descriptors} onAction={onAction} now={now ?? undefined} /></TimeZoneProvider></NextIntlClientProvider>);
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
  it('names the day of a reason’s time that is not today, or without the page’s clock (journeys on a phone, J-H18)', () => {
    const noShow = (now: string | null) => {
      cleanup();
      show(deskBeforeNoShowPosterActions, undefined, now);
      return screen.getAllByRole('button', { name: 'Report a no-show' })[0]!;
    };
    expect(noShow(DESK_DAY)).toHaveAccessibleDescription('Available at 11:00 am');
    // Four days before: the day, not a time that reads as today.
    expect(noShow('2026-11-17T15:00:00.000Z')).toHaveAccessibleDescription(/^Available Sat, Nov 21 · 11:00\s?am$/);
    expect(noShow(null)).toHaveAccessibleDescription(/^Available Sat, Nov 21 · 11:00\s?am$/);
  });

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
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve and release payment' }));
    expect(handler).toHaveBeenCalledExactlyOnceWith('approve');
    expect(await screen.findByText('Task approved')).toBeVisible();
  });

  it('spells out what approving does, and asks other actions generically (journeys on a phone, J-C5)', async () => {
    show(deskCompletionSubmittedPosterActions);
    await userEvent.click(screen.getByRole('button', { name: 'Approve task' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Approve the completed task?' })).toBeVisible();
    expect(dialog).toHaveTextContent(feedback.confirmations.approve.description);
    expect(within(dialog).getByRole('button', { name: 'Approve and release payment' })).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Go back' }));
    cleanup();
    show([{ id: 'skip_visit', kind: 'destructive', enabled: true, confirm: true }]);
    await userEvent.click(screen.getByRole('button', { name: actions.skip_visit }));
    const generic = screen.getByRole('alertdialog');
    expect(within(generic).getByRole('heading', { name: 'Confirm action' })).toBeVisible();
    expect(generic).toHaveTextContent(`Continue with “${actions.skip_visit}”?`);
    expect(within(generic).getByRole('button', { name: 'Confirm' })).toBeVisible();
  });

  it('opens the next page without a success message when the action only opens it (J-C3)', async () => {
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'opened', redirectTo: '/app/messages/thr_1' }));
    show([{ id: 'message', kind: 'secondary', enabled: true }], handler);
    await userEvent.click(screen.getByRole('button', { name: actions.message }));
    expect(handler).toHaveBeenCalledExactlyOnceWith('message');
    expect(push).toHaveBeenCalledExactlyOnceWith('/app/messages/thr_1');
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText(feedback.success.opened)).toBeNull();
    expect(screen.queryByText(feedback.success.updated)).toBeNull();
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

  it('says the phone is offline when an action gets no answer without a network (bad connections pass, J-N3)', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    try {
      show([{ id: 'pay', kind: 'primary', enabled: true }], vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
      await userEvent.click(screen.getByRole('button', { name: 'Finish payment' }));
      expect(await screen.findByText(feedback.error.offline)).toBeVisible();
      expect(toastError).toHaveBeenCalledWith(feedback.error.offline);
    } finally {
      delete (window.navigator as unknown as { onLine?: boolean }).onLine;
    }
  });

  it('says the session ended, with a sign-in link, when an action gets no answer and the session is gone (bad connections pass, J-N2)', async () => {
    const fetched = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ signedIn: false }), { status: 200, headers: { 'content-type': 'application/json' } }));
    try {
      show([{ id: 'pay', kind: 'primary', enabled: true }], vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
      await userEvent.click(screen.getByRole('button', { name: 'Finish payment' }));
      expect(await screen.findByText(feedback.error.signed_out, { exact: false })).toBeVisible();
      expect(screen.getByRole('link', { name: feedback.error.signInAgain })).toHaveAttribute('href', expect.stringMatching(/^\/sign-in\?next=/));
      expect(toastError).toHaveBeenCalledWith(feedback.error.signed_out);
      expect(fetched).toHaveBeenCalledOnce();
    } finally {
      fetched.mockRestore();
    }
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
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Approve and release payment' }));
    expect(await screen.findByText('Task approved')).toBeVisible();
    expect(approve).toHaveFocus();
    // The refreshed booking has other actions: focus moves to the result, not to the top of the page.
    rerender(<NextIntlClientProvider locale="en" messages={uiMessages}><TimeZoneProvider timeZone="America/Chicago"><ActionBar actions={[{ id: 'message', kind: 'secondary', enabled: true }]} onAction={handler} /></TimeZoneProvider></NextIntlClientProvider>);
    expect(approve).not.toBeInTheDocument();
    expect(screen.getByText('Task approved').closest('[tabindex="-1"]')).toHaveFocus();
  });

  it('moves focus to the next action when a refresh removes the focused one without a result', () => {
    const { rerender } = show([{ id: 'approve', kind: 'primary', enabled: true }, { id: 'message', kind: 'secondary', enabled: true }]);
    act(() => screen.getByRole('button', { name: 'Approve task' }).focus());
    rerender(<NextIntlClientProvider locale="en" messages={uiMessages}><TimeZoneProvider timeZone="America/Chicago"><ActionBar actions={[{ id: 'message', kind: 'secondary', enabled: true }]} onAction={vi.fn()} /></TimeZoneProvider></NextIntlClientProvider>);
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
