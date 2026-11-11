/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { ACTION_ERROR_CODES, REPORT_REASONS, routes, type ActionResult, type ReportHandlers, type ReportInput } from '@/contracts';
import { blockedReportSubject, fakeHandler, jordanReportSubject } from '@/fixtures';
import baseMessages from '../../../../messages/en/ui';
import safety from '../../../../messages/en/ui/safety.json';
import { ReportBlockMenu } from './report-block-menu';
import { ReportDialog } from './report-dialog';

const messages = { ...baseMessages, safety };
const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mountDialog(onReport = vi.fn(fakeHandler<ReportInput>({ ok: true, code: 'submitted' }, 0)), initialResult?: ActionResult) {
  render(<NextIntlClientProvider locale="en" messages={messages}><ReportDialog subject={jordanReportSubject} onReport={onReport} open onOpenChange={vi.fn()} initialResult={initialResult} /></NextIntlClientProvider>);
  return onReport;
}

function mountMenu(blocked = false, overrides: Partial<ReportHandlers> = {}) {
  const handlers: ReportHandlers = { onReport: vi.fn(fakeHandler<ReportInput>({ ok: true, code: 'submitted' }, 0)), onBlock: vi.fn(fakeHandler<{ blocked: boolean }>({ ok: true, code: 'updated' }, 0)), ...overrides };
  render(<NextIntlClientProvider locale="en" messages={messages}><ReportBlockMenu subject={blocked ? blockedReportSubject : jordanReportSubject} handlers={handlers} /></NextIntlClientProvider>);
  return handlers;
}

describe('Reporting and blocking', () => {
  it('requires a reason and ten characters, focuses the first invalid field, and sends only validated values', async () => {
    const user = userEvent.setup();
    const onReport = mountDialog();
    await user.click(screen.getByRole('button', { name: safety.send }));
    expect(await screen.findByText(safety.reasonRequired)).toBeInTheDocument();
    expect(screen.getByText(safety.detailsTooShort)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('radio', { name: safety.reasons.harassment })).toHaveFocus());
    expect(onReport).not.toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: safety.reasons.off_platform_payment }));
    await user.type(screen.getByRole('textbox', { name: safety.details }), 'too short');
    await user.click(screen.getByRole('button', { name: safety.send }));
    expect(onReport).not.toHaveBeenCalled();
    const details = screen.getByRole('textbox', { name: safety.details });
    await user.clear(details);
    await user.type(details, '  Asked me to pay outside TasksNearMe.  ');
    await user.click(screen.getByRole('button', { name: safety.send }));
    await waitFor(() => expect(onReport).toHaveBeenCalledExactlyOnceWith({ reason: 'off_platform_payment', details: 'Asked me to pay outside TasksNearMe.' }));
    expect(await screen.findByText(safety.submitted)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('disables report inputs while sending, prevents duplicate submission, and follows redirects', async () => {
    const user = userEvent.setup();
    let finish!: (result: ActionResult) => void;
    const onReport = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    mountDialog(onReport);
    await user.click(screen.getByRole('radio', { name: safety.reasons.other }));
    await user.type(screen.getByRole('textbox', { name: safety.details }), 'Please review this conversation.');
    await user.click(screen.getByRole('button', { name: safety.send }));
    expect(screen.getByRole('button', { name: safety.sending })).toBeDisabled();
    expect(screen.getByRole('button', { name: safety.sending })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.queryByRole('button', { name: messages.common.close })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: safety.cancel })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.submit(screen.getByRole('form'));
    expect(onReport).toHaveBeenCalledTimes(1);
    const redirectTo = routes.app.supportCase('report-case');
    await act(async () => finish({ ok: true, code: 'submitted', redirectTo }));
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(redirectTo);
  });

  it('focuses server errors and keeps retryable values after a rejection', async () => {
    const user = userEvent.setup();
    const onReport = vi.fn().mockResolvedValueOnce({ ok: false, code: 'validation_failed', fieldErrors: { details: ['invalid'] } }).mockRejectedValueOnce(new Error('offline'));
    mountDialog(onReport);
    await user.click(screen.getByRole('radio', { name: safety.reasons.harassment }));
    const details = screen.getByRole('textbox');
    await user.type(details, 'Please review this conversation.');
    await user.click(screen.getByRole('button', { name: safety.send }));
    expect(await screen.findByText(messages.forms.fieldErrors.invalid)).toBeInTheDocument();
    await waitFor(() => expect(details).toHaveFocus());
    await user.click(screen.getByRole('button', { name: safety.send }));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeInTheDocument();
    expect(details).toHaveValue('Please review this conversation.');
    expect(screen.getByRole('button', { name: safety.send })).toBeEnabled();
  });

  it('asks before blocking and refreshes only after success', async () => {
    const user = userEvent.setup();
    const handlers = mountMenu();
    const trigger = screen.getByRole('button', { name: 'Safety options for Jordan T.' });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: safety.block }));
    const confirmation = screen.getByRole('alertdialog');
    expect(within(confirmation).getByText(safety.blockDescription)).toBeInTheDocument();
    expect(handlers.onBlock).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole('button', { name: safety.block }));
    await waitFor(() => expect(handlers.onBlock).toHaveBeenCalledExactlyOnceWith({ blocked: true }));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Jordan T. is blocked.')).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('unblocks directly without a confirmation', async () => {
    const user = userEvent.setup();
    const handlers = mountMenu(true);
    await user.click(screen.getByRole('button', { name: 'Safety options for Jordan T.' }));
    await user.click(screen.getByRole('menuitem', { name: safety.unblock }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(handlers.onBlock).toHaveBeenCalledExactlyOnceWith({ blocked: false }));
    expect(await screen.findByText('Jordan T. is unblocked.')).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed block confirmation open and allows retry', async () => {
    const user = userEvent.setup();
    const onBlock = vi.fn().mockRejectedValue(new Error('offline'));
    mountMenu(false, { onBlock });
    await user.click(screen.getByRole('button', { name: 'Safety options for Jordan T.' }));
    await user.click(screen.getByRole('menuitem', { name: safety.block }));
    await user.click(screen.getByRole('button', { name: safety.block }));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: safety.block })).toBeEnabled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('opens the report from the menu and restores focus on close', async () => {
    const user = userEvent.setup();
    mountMenu();
    const trigger = screen.getByRole('button', { name: 'Safety options for Jordan T.' });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: safety.report }));
    expect(screen.getByRole('dialog', { name: 'Report Jordan T.' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it.each(ACTION_ERROR_CODES)('maps friendly report feedback for %s', (code) => {
    mountDialog(undefined, { ok: false, code });
    const text = code in messages.forms.actionErrors ? messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] : messages.feedback.error[code];
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('has copy for every report reason', () => {
    REPORT_REASONS.forEach((reason) => expect(safety.reasons[reason]).toEqual(expect.any(String)));
  });
});
