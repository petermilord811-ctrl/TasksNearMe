/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, routes, type ActionResult, type AppShellHandlers, type Mode } from '@/contracts';
import uiMessages from '../../../messages/en/ui';
import feedback from '../../../messages/en/ui/feedback.json';
import { ModeSwitch } from './mode-switch';

const { push, toastSuccess, toastError } = vi.hoisted(() => ({ push: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function show(onModeChange: AppShellHandlers['onModeChange'], mode: Mode = 'poster') {
  return render(<NextIntlClientProvider locale="en" messages={uiMessages}><ModeSwitch mode={mode} onModeChange={onModeChange} /></NextIntlClientProvider>);
}

describe('ModeSwitch', () => {
  it('announces the current mode and sends only the other mode to its handler', async () => {
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    show(handler);
    expect(screen.getByRole('button', { name: 'I need help' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'I need help' }));
    expect(handler).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'I can help' }));
    expect(handler).toHaveBeenCalledExactlyOnceWith({ mode: 'helper' });
    expect(toastSuccess).toHaveBeenCalledWith(feedback.success.updated);
    // The app owns the viewer; a success does not invent a new prop value.
    expect(screen.getByRole('button', { name: 'I need help' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('disables both options while pending, prevents duplicate calls, and follows redirectTo', async () => {
    let finish: (result: ActionResult) => void = () => {};
    const handler = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    show(handler);
    const helper = screen.getByRole('button', { name: 'I can help' });
    await userEvent.dblClick(helper);
    expect(handler).toHaveBeenCalledExactlyOnceWith({ mode: 'helper' });
    expect(helper).toBeDisabled();
    expect(helper).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'I need help' })).toBeDisabled();
    expect(screen.getByRole('group')).toHaveAttribute('aria-busy', 'true');
    expect(push).not.toHaveBeenCalled();
    await act(async () => finish({ ok: true, code: 'updated', redirectTo: routes.app.helperOnboarding() }));
    expect(helper).toBeEnabled();
    expect(helper).toHaveAttribute('aria-busy', 'false');
    expect(push).toHaveBeenCalledExactlyOnceWith(routes.app.helperOnboarding());
  });

  it('works from the keyboard in helper mode', async () => {
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    show(handler, 'helper');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'I need help' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(handler).toHaveBeenCalledExactlyOnceWith({ mode: 'poster' });
  });

  it.each(ACTION_ERROR_CODES)('shows persistent friendly feedback for %s', async (code) => {
    show(vi.fn(async (): Promise<ActionResult> => ({ ok: false, code })));
    await userEvent.click(screen.getByRole('button', { name: 'I can help' }));
    expect(await screen.findByText(feedback.error[code])).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(feedback.error[code]);
    expect(toastError).toHaveBeenCalledWith(feedback.error[code]);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'I need help' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('handles a rejected handler and allows another attempt', async () => {
    const handler = vi.fn(async (): Promise<ActionResult> => { throw new Error('Offline'); });
    show(handler);
    await userEvent.click(screen.getByRole('button', { name: 'I can help' }));
    expect(await screen.findByText(feedback.error.unknown)).toBeVisible();
    expect(screen.getByRole('button', { name: 'I can help' })).toBeEnabled();
    handler.mockResolvedValueOnce({ ok: true, code: 'updated' });
    await userEvent.click(screen.getByRole('button', { name: 'I can help' }));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent(feedback.success.updated);
  });
});
