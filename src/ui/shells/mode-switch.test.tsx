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
    // Says which mode, not "Updated" (journeys on a phone).
    expect(toastSuccess).toHaveBeenCalledWith('You’re in helper mode');
    // The app owns the viewer; a success does not invent a new prop value.
    expect(screen.getByRole('button', { name: 'I need help' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('says the result once, by its toast: the line beside the switch describes it and isn’t a live region (accessibility pass, J-A8)', async () => {
    const { container } = show(vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' })));
    await userEvent.click(screen.getByRole('button', { name: 'I can help' }));
    expect(toastSuccess).toHaveBeenCalledExactlyOnceWith('You’re in helper mode');
    expect(screen.getByRole('group', { name: uiMessages.shell.mode.label })).toHaveAccessibleDescription('You’re in helper mode');
    expect(container.querySelector('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]')).toBeNull();
  });

  it('marks both options busy while pending, keeping focus (accessibility pass, J-A9), prevents duplicate calls, and follows redirectTo', async () => {
    let finish: (result: ActionResult) => void = () => {};
    const handler = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    show(handler);
    const helper = screen.getByRole('button', { name: 'I can help' });
    await userEvent.dblClick(helper);
    expect(handler).toHaveBeenCalledExactlyOnceWith({ mode: 'helper' });
    // aria-disabled, not disabled: a disabled button would lose keyboard focus to the page.
    expect(helper).not.toBeDisabled();
    expect(helper).toHaveAttribute('aria-disabled', 'true');
    expect(helper).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'I need help' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('group')).toHaveAttribute('aria-busy', 'true');
    expect(push).not.toHaveBeenCalled();
    await act(async () => finish({ ok: true, code: 'updated', redirectTo: routes.app.helperOnboarding() }));
    expect(helper).not.toHaveAttribute('aria-disabled');
    expect(helper).toHaveAttribute('aria-busy', 'false');
    expect(push).toHaveBeenCalledExactlyOnceWith(routes.app.helperOnboarding());
  });

  it('keeps keyboard focus on the pressed option while the change saves, and ignores presses meanwhile (accessibility pass, J-A9)', async () => {
    let finish: (result: ActionResult) => void = () => {};
    const handler = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    show(handler);
    const helper = screen.getByRole('button', { name: 'I can help' });
    helper.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');
    expect(handler).toHaveBeenCalledOnce();
    expect(helper).toHaveFocus();
    await act(async () => finish({ ok: true, code: 'updated' }));
    expect(helper).toHaveFocus();
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
    expect(screen.getByRole('group', { name: uiMessages.shell.mode.label })).toHaveAccessibleDescription(feedback.error[code]);
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
    expect(screen.getByRole('group', { name: uiMessages.shell.mode.label })).toHaveAccessibleDescription('You’re in helper mode');
  });
});
