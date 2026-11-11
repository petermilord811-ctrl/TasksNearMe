/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, PROBLEM_REASONS, PROBLEM_UNAVAILABLE_REASONS, routes, type ActionResult, type ReportProblemHandlers, type ReportProblemPageData } from '@/contracts';
import { deskCompletionView, deskReportProblemPageData, reportProblemUnavailableData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { ReportProblemContent, ReportProblemScreen } from './report-problem-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const now = '2026-11-21T18:10:00.000Z';
const description = "One drawer is misaligned and doesn't close.";
const success = { ok: true, code: 'submitted', redirectTo: routes.app.booking('bkg_desk') } as const;

function mount(data: ReportProblemPageData = deskReportProblemPageData, overrides: Partial<ReportProblemHandlers> = {}) {
  const handlers: ReportProblemHandlers = {
    onSubmit: vi.fn().mockResolvedValue(success),
    onUploadPhoto: vi.fn().mockResolvedValue({ ok: true, photo: deskCompletionView.photos[0] }),
    ...overrides,
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><ReportProblemScreen data={data} handlers={handlers} now={now} /></NextIntlClientProvider>) };
}

async function fillReport(user: ReturnType<typeof userEvent.setup>, text = description) {
  await user.click(screen.getByRole('radio', { name: messages.reportProblem.reasons.not_as_agreed }));
  fireEvent.change(screen.getByRole('textbox', { name: messages.reportProblem.description }), { target: { value: text } });
}

describe('ReportProblemScreen', () => {
  it('shows the submitted work, deadline in Central time, and one page heading', () => {
    mount();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(/Report before Tue, Nov 24 at 11:48 am/)).toBeVisible();
    expect(screen.getByText(deskCompletionView.note!)).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(PROBLEM_REASONS.length);
    expect(screen.getByRole('link', { name: messages.reportProblem.backToBooking })).toHaveAttribute('href', routes.app.booking(deskReportProblemPageData.booking.id));
  });

  it('validates and focuses the first invalid field before opening confirmation', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(screen.getByRole('button', { name: messages.reportProblem.submit }));
    await waitFor(() => expect(screen.getAllByRole('radio')[0]).toHaveFocus());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await fillReport(user, 'Drawer stuck.');
    await user.click(screen.getByRole('button', { name: messages.reportProblem.submit }));
    expect(await screen.findByText(messages.forms.fieldErrors.too_short)).toBeVisible();
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('allows editing after cancel, then sends only after confirmation and follows redirectTo', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await fillReport(user);
    await user.click(screen.getByRole('button', { name: messages.reportProblem.submit }));
    let dialog = await screen.findByRole('alertdialog');
    expect(handlers.onSubmit).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: messages.reportProblem.cancel }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox')).toHaveValue(description);
    expect(screen.getByRole('button', { name: messages.reportProblem.submit })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: messages.reportProblem.submit }));
    dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: messages.reportProblem.confirmSubmit }));
    await waitFor(() => expect(handlers.onSubmit).toHaveBeenCalledExactlyOnceWith({ reason: 'not_as_agreed', description, photoIds: [] }));
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(success.redirectTo);
  });

  it('locks the form and confirmation during submission, then retains input and focuses server errors', async () => {
    const user = userEvent.setup();
    let resolve!: (result: ActionResult) => void;
    const onSubmit = vi.fn(() => new Promise<ActionResult>((done) => { resolve = done; }));
    mount(undefined, { onSubmit });
    await fillReport(user);
    await user.click(screen.getByRole('button', { name: messages.reportProblem.submit }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: messages.reportProblem.confirmSubmit }));
    expect(screen.getByRole('textbox', { hidden: true })).toBeDisabled();
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: messages.reportProblem.submitting })).toBeDisabled();
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: messages.reportProblem.cancel })).toBeDisabled();
    await act(async () => { resolve({ ok: false, code: 'validation_failed', fieldErrors: { description: ['too_short'] } }); });
    expect(await screen.findByText(messages.forms.fieldErrors.too_short)).toBeVisible();
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
    expect(screen.getByRole('textbox')).toHaveValue(description);
    expect(screen.getByRole('radio', { name: messages.reportProblem.reasons.not_as_agreed })).toBeChecked();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('includes uploaded photo ids and locks the form while a photo uploads', async () => {
    const user = userEvent.setup();
    let resolve!: (result: Awaited<ReturnType<ReportProblemHandlers['onUploadPhoto']>>) => void;
    const onUploadPhoto = vi.fn<ReportProblemHandlers['onUploadPhoto']>(() => new Promise<Awaited<ReturnType<ReportProblemHandlers['onUploadPhoto']>>>((done) => { resolve = done; }));
    const { handlers } = mount(undefined, { onUploadPhoto });
    await fillReport(user);
    const file = new File(['photo'], 'drawer.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText(messages.reportProblem.photos), file);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: messages.reportProblem.submit })).toBeDisabled();
    expect(onUploadPhoto.mock.calls[0]?.[0]).toBeInstanceOf(FormData);
    await act(async () => { resolve({ ok: true, photo: deskCompletionView.photos[0]! }); });
    await user.click(screen.getByRole('button', { name: messages.reportProblem.submit }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: messages.reportProblem.confirmSubmit }));
    await waitFor(() => expect(handlers.onSubmit).toHaveBeenCalledExactlyOnceWith({ reason: 'not_as_agreed', description, photoIds: [deskCompletionView.photos[0]!.id] }));
  });

  it.each(ACTION_ERROR_CODES)('renders friendly feedback for action error %s', (code) => {
    const handlers: ReportProblemHandlers = { onSubmit: vi.fn(), onUploadPhoto: vi.fn() };
    render(<NextIntlClientProvider locale="en" messages={messages}><ReportProblemContent data={deskReportProblemPageData} handlers={handlers} now={now} initialResult={{ ok: false, code }} /></NextIntlClientProvider>);
    const expected = code === 'expired' || code === 'not_allowed' ? messages.reportProblem.errors[code]
      : code in messages.forms.actionErrors ? messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] : messages.feedback.error[code];
    expect(screen.getByText(expected)).toBeVisible();
  });

  it('offers reload after a booking change and support after the approval window ends', async () => {
    const user = userEvent.setup();
    const handlers: ReportProblemHandlers = { onSubmit: vi.fn(), onUploadPhoto: vi.fn() };
    const { rerender } = render(<NextIntlClientProvider locale="en" messages={messages}><ReportProblemContent key="changed" data={deskReportProblemPageData} handlers={handlers} now={now} initialResult={{ ok: false, code: 'not_allowed' }} /></NextIntlClientProvider>);
    await user.click(screen.getByRole('button', { name: messages.reportProblem.reload }));
    expect(navigation.refresh).toHaveBeenCalledOnce();
    rerender(<NextIntlClientProvider locale="en" messages={messages}><ReportProblemContent key="expired" data={deskReportProblemPageData} handlers={handlers} now={now} initialResult={{ ok: false, code: 'expired' }} /></NextIntlClientProvider>);
    expect(screen.getByRole('link', { name: messages.reportProblem.getHelp })).toHaveAttribute('href', routes.help());
  });

  it.each(PROBLEM_UNAVAILABLE_REASONS)('shows copy and no form when unavailable: %s', (reason) => {
    mount(reportProblemUnavailableData[reason]);
    expect(screen.getByText(messages.reportProblem.unavailable[reason])).toBeVisible();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    if (reason === 'window_passed') expect(screen.getByRole('link', { name: messages.reportProblem.getHelp })).toHaveAttribute('href', routes.help());
  });
});
