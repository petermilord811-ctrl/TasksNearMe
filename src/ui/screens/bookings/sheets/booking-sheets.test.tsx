/** @vitest-environment jsdom */
import { StrictMode, type ComponentType, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_ERROR_CODES, HELPER_CANCEL_REASONS, POSTER_CANCEL_REASONS, SAFETY_REPORT_KINDS, routes,
  type ActionResult, type BookingSheetHandlers, type CancellationPreview,
} from '@/contracts';
import {
  deskBookingPosterWithSheets, deskCancelPreviewHelperEarly, deskCancelPreviewHelperLate,
  deskCancelPreviewPosterEarly, deskCancelPreviewPosterLate, deskCancelPreviewScheduled, fakeBookingSheetHandlers,
  movingBookingPosterConfirmed,
} from '@/fixtures';
import { formatDateTime, formatMoney } from '@/shared/format';
import messages from '../../../../../messages/en/ui';
import { CancelBookingSheet, CantAccessSheet, ReportNoShowSheet, RunningLateSheet, SafetyReportSheet, type BookingSheetProps } from './index';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const notify = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
vi.mock('sonner', () => ({ toast: notify }));

const copy = messages.bookingSheets;
const t = createTranslator({ locale: 'en', messages: copy });

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

function provider(children: ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider>;
}

function mount(Sheet: ComponentType<BookingSheetProps>, overrides: Partial<BookingSheetProps> = {}) {
  const onOpenChange = vi.fn();
  const props: BookingSheetProps = { data: deskBookingPosterWithSheets, handlers: fakeBookingSheetHandlers, open: true, onOpenChange, ...overrides };
  return { onOpenChange, ...render(provider(<Sheet {...props} />)) };
}

function sheetHandlers(overrides: Partial<BookingSheetHandlers> = {}): BookingSheetHandlers {
  return { ...fakeBookingSheetHandlers, ...overrides };
}

function emergencyLink() {
  const link = screen.getByRole('link', { name: copy.safety.emergency });
  expect(link).toHaveAttribute('href', 'tel:911');
  expect(link).not.toHaveAttribute('aria-disabled', 'true');
  expect(link.closest('fieldset[disabled]')).toBeNull();
  expect(link.tabIndex).toBe(0);
  return link;
}

describe('CancelBookingSheet', () => {
  it('loads once per opening, including Strict Mode replay, and shows the supplied money', async () => {
    const pending = deferred<CancellationPreview>();
    const onPreviewCancel = vi.fn(() => pending.promise);
    const handlers = sheetHandlers({ onPreviewCancel });
    const onOpenChange = vi.fn();
    const view = (open: boolean) => provider(<StrictMode><CancelBookingSheet data={movingBookingPosterConfirmed} handlers={handlers} open={open} onOpenChange={onOpenChange} /></StrictMode>);
    const mounted = render(view(false));
    expect(onPreviewCancel).not.toHaveBeenCalled();
    mounted.rerender(view(true));
    expect(screen.getByText(copy.cancel.loading)).toBeVisible();
    expect(screen.queryByRole('button', { name: copy.cancel.submit })).not.toBeInTheDocument();
    await waitFor(() => expect(onPreviewCancel).toHaveBeenCalledExactlyOnceWith({}));
    await act(async () => pending.resolve(deskCancelPreviewPosterLate));
    const dialog = screen.getByRole('alertdialog', { name: copy.cancel.title });
    expect(dialog).toHaveTextContent(formatMoney(deskCancelPreviewPosterLate.posterRefundCents));
    expect(dialog).toHaveTextContent(formatMoney(deskCancelPreviewPosterLate.helperCompensationCents));
    expect(dialog).not.toHaveTextContent('$154.00');
    expect(screen.getByRole('link', { name: copy.cancel.policy })).toHaveAttribute('href', routes.legal('cancellation-policy'));
    mounted.rerender(view(false));
    mounted.rerender(view(true));
    await waitFor(() => expect(onPreviewCancel).toHaveBeenCalledTimes(2));
  });

  it.each([
    ['client early', deskCancelPreviewPosterEarly], ['client late', deskCancelPreviewPosterLate],
    ['helper early', deskCancelPreviewHelperEarly], ['helper late', deskCancelPreviewHelperLate],
  ] as const)('uses preview.by for %s reasons and supplied policy consequences', async (_label, preview) => {
    mount(CancelBookingSheet, { handlers: sheetHandlers({ onPreviewCancel: vi.fn(async () => preview) }) });
    const expectedReasons = preview.by === 'poster' ? POSTER_CANCEL_REASONS : HELPER_CANCEL_REASONS;
    await screen.findByRole('radiogroup', { name: copy.cancel.reason });
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([...expectedReasons]);
    for (const reason of expectedReasons) expect(screen.getByRole('radio', { name: copy.cancel.reasons[reason] })).toBeVisible();
    expect(screen.getByText(formatMoney(preview.posterRefundCents))).toBeVisible();
    if (preview.helperStrike) expect(screen.getByText(copy.cancel.strike)).toBeVisible();
    else expect(screen.queryByText(copy.cancel.strike)).not.toBeInTheDocument();
    if (preview.late) expect(screen.getByText(t('cancel.freeEnded', { at: formatDateTime(preview.freeUntil) }))).toBeVisible();
    if (preview.by === 'helper') expect(screen.getByText(t('cancel.helperRefund', { client: deskBookingPosterWithSheets.poster.displayName }))).toBeVisible();
  });

  it('says nothing was charged for a booking paid later, instead of a refund', async () => {
    mount(CancelBookingSheet, { handlers: sheetHandlers({ onPreviewCancel: vi.fn(async () => deskCancelPreviewScheduled) }) });
    expect(await screen.findByText(copy.cancel.nothingChargedTitle)).toBeVisible();
    expect(screen.getByText(copy.cancel.nothingCharged)).toBeVisible();
    expect(screen.queryByText(formatMoney(0))).not.toBeInTheDocument();
    expect(screen.queryByText(copy.cancel.strike)).not.toBeInTheDocument();
  });

  it('keeps the main button in the fixed footer above Back, outside the scrolling fields, so a phone never scrolls to it (J-C10)', async () => {
    mount(CancelBookingSheet, { handlers: sheetHandlers({ onPreviewCancel: async () => deskCancelPreviewPosterLate }) });
    const submit = await screen.findByRole('button', { name: copy.cancel.submit });
    const form = screen.getByRole('form', { name: copy.cancel.title });
    expect(form).not.toContainElement(submit);
    expect(submit).toHaveAttribute('form', form.id);
    expect(submit.closest('.overflow-y-auto')).toBeNull();
    const back = screen.getByRole('button', { name: copy.back });
    expect(submit.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(submit.parentElement).toBe(back.parentElement);
  });

  it('sends the chosen reason and trimmed note, locks during cancellation, then closes and refreshes', async () => {
    const user = userEvent.setup();
    const pending = deferred<ActionResult>();
    const onCancel = vi.fn(() => pending.promise);
    const { onOpenChange } = mount(CancelBookingSheet, { handlers: sheetHandlers({ onPreviewCancel: async () => deskCancelPreviewPosterLate, onCancel }) });
    await user.click(await screen.findByRole('radio', { name: copy.cancel.reasons.plans_changed }));
    const note = screen.getByRole('textbox', { name: copy.note });
    fireEvent.change(note, { target: { value: '  My plans changed.  ' } });
    const submit = screen.getByRole('button', { name: copy.cancel.submit });
    expect(submit).toHaveAttribute('data-variant', 'destructive');
    await user.click(submit);
    expect(onCancel).toHaveBeenCalledExactlyOnceWith({ reason: 'plans_changed', note: 'My plans changed.' });
    expect(screen.getByRole('form', { name: copy.cancel.title })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: copy.sending })).toBeDisabled();
    expect(note).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.back })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
    const redirectTo = routes.app.booking(deskBookingPosterWithSheets.id);
    await act(async () => pending.resolve({ ok: true, code: 'canceled', redirectTo }));
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(redirectTo);
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(notify.success).toHaveBeenCalledWith(messages.feedback.success.canceled);
  });

  it('allows cancellation-preview failures to be retried without submitting', async () => {
    const user = userEvent.setup();
    const onPreviewCancel = vi.fn().mockRejectedValueOnce(new Error('private network detail')).mockResolvedValue(deskCancelPreviewPosterEarly);
    const onCancel = vi.fn();
    mount(CancelBookingSheet, { handlers: sheetHandlers({ onPreviewCancel, onCancel }) });
    expect(await screen.findByText(copy.cancel.loadError)).toBeVisible();
    expect(screen.queryByText('private network detail')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.cancel.retry }));
    expect(await screen.findByRole('radiogroup', { name: copy.cancel.reason })).toBeVisible();
    expect(onPreviewCancel).toHaveBeenCalledTimes(2);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('keeps the reason and note after field errors and focuses the first invalid field', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'validation_failed', fieldErrors: { reason: ['invalid'], note: ['too_long'] } }));
    const { onOpenChange } = mount(CancelBookingSheet, { handlers: sheetHandlers({ onPreviewCancel: async () => deskCancelPreviewPosterEarly, onCancel }) });
    const reason = await screen.findByRole('radio', { name: copy.cancel.reasons.plans_changed });
    await user.click(reason);
    const note = screen.getByRole('textbox', { name: copy.note });
    fireEvent.change(note, { target: { value: 'Keep my draft.' } });
    await user.click(screen.getByRole('button', { name: copy.cancel.submit }));
    expect(await screen.findByText(messages.forms.fieldErrors.invalid)).toBeVisible();
    expect(screen.getByText(messages.forms.fieldErrors.too_long)).toBeVisible();
    await waitFor(() => expect(reason).toHaveFocus());
    expect(reason).toHaveAttribute('aria-checked', 'true');
    expect(note).toHaveValue('Keep my draft.');
    expect(note).toHaveAccessibleDescription(expect.stringContaining(messages.forms.fieldErrors.too_long));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });
});

describe('booking update sheets', () => {
  it('sends the selected late minutes and refreshes on success', async () => {
    const user = userEvent.setup();
    const onRunningLate = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    const { onOpenChange } = mount(RunningLateSheet, { handlers: sheetHandlers({ onRunningLate }) });
    await user.click(screen.getByRole('radio', { name: t('late.minutes', { minutes: 30 }) }));
    await user.click(screen.getByRole('button', { name: copy.late.submit }));
    expect(onRunningLate).toHaveBeenCalledExactlyOnceWith({ minutes: 30 });
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it.each([
    [ReportNoShowSheet, 'onReportNoShow', copy.noShow, 'canceled'],
    [CantAccessSheet, 'onCantAccess', copy.cantAccess, 'updated'],
  ] as const)('sends the optional note through %s', async (Sheet, handlerName, sheetCopy, successCode) => {
    const user = userEvent.setup();
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: successCode }));
    const { onOpenChange } = mount(Sheet, { handlers: sheetHandlers({ [handlerName]: handler }) });
    expect(screen.getByText(sheetCopy.terms)).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: copy.note }), { target: { value: '  I am waiting outside.  ' } });
    await user.click(screen.getByRole('button', { name: sheetCopy.submit }));
    expect(handler).toHaveBeenCalledExactlyOnceWith({ note: 'I am waiting outside.' });
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it('handles thrown mutations as unknown errors without losing the selected input', async () => {
    const user = userEvent.setup();
    const onRunningLate = vi.fn(async () => { throw new Error('private handler error'); });
    const { onOpenChange } = mount(RunningLateSheet, { handlers: sheetHandlers({ onRunningLate }) });
    const option = screen.getByRole('radio', { name: t('late.minutes', { minutes: 20 }) });
    await user.click(option);
    await user.click(screen.getByRole('button', { name: copy.late.submit }));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(screen.queryByText('private handler error')).not.toBeInTheDocument();
    expect(option).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: copy.late.submit })).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it.each(ACTION_ERROR_CODES)('provides friendly inline feedback for %s', async (code) => {
    mount(RunningLateSheet, { initialResult: { ok: false, code } });
    const expected = code === 'not_allowed' || code === 'version_conflict' ? copy.changed : messages.feedback.error[code];
    expect(await screen.findByText(expected)).toBeVisible();
  });

  it('offers an explicit reload when the booking changed', async () => {
    const user = userEvent.setup();
    const onRunningLate = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'not_allowed' }));
    const { onOpenChange } = mount(RunningLateSheet, { handlers: sheetHandlers({ onRunningLate }) });
    await user.click(screen.getByRole('radio', { name: t('late.minutes', { minutes: 10 }) }));
    await user.click(screen.getByRole('button', { name: copy.late.submit }));
    expect(await screen.findByText(copy.changed)).toBeVisible();
    expect(navigation.refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: copy.reload }));
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('SafetyReportSheet', () => {
  it.each([
    ['default', {}],
    ['sending', { initialPending: true }],
    ['sent', { initialResult: { ok: true, code: 'submitted' } }],
    ['validation failed', { initialResult: { ok: false, code: 'validation_failed', fieldErrors: { description: ['too_short'] } } }],
  ] satisfies Array<[string, Partial<BookingSheetProps>]>)('keeps 911 first and available in the %s state', (_state, props: Partial<BookingSheetProps>) => {
    mount(SafetyReportSheet, props);
    const link = emergencyLink();
    const dialog = screen.getByRole('dialog', { name: copy.safety.title });
    const firstFocusable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href],button,input,textarea,[tabindex]')).find((element) => element.tabIndex >= 0 && !element.matches(':disabled'));
    expect(firstFocusable).toBe(link);
    link.focus();
    expect(link).toHaveFocus();
    if (props.initialResult?.ok) expect(screen.getByText(copy.safety.sent)).toBeVisible();
    else for (const kind of SAFETY_REPORT_KINDS) expect(screen.getByRole('radio', { name: copy.safety.kinds[kind] })).toBeInTheDocument();
  });

  it('validates required kind and minimum description before calling the handler', async () => {
    const user = userEvent.setup();
    const onSafetyReport = vi.fn();
    mount(SafetyReportSheet, { handlers: sheetHandlers({ onSafetyReport }) });
    await user.click(screen.getByRole('button', { name: copy.safety.submit }));
    expect(await screen.findByText(messages.forms.fieldErrors.required)).toBeVisible();
    await waitFor(() => expect(screen.getByRole('radio', { name: copy.safety.kinds.unsafe_now })).toHaveFocus());
    await user.click(screen.getByRole('radio', { name: copy.safety.kinds.threat }));
    fireEvent.change(screen.getByRole('textbox', { name: copy.safety.description }), { target: { value: 'Short' } });
    await user.click(screen.getByRole('button', { name: copy.safety.submit }));
    expect(await screen.findByText(messages.forms.fieldErrors.too_short)).toBeVisible();
    expect(onSafetyReport).not.toHaveBeenCalled();
    emergencyLink();
  });

  it('keeps 911 active while sending, then confirms support contact and closes', async () => {
    const user = userEvent.setup();
    const pending = deferred<ActionResult>();
    const onSafetyReport = vi.fn(() => pending.promise);
    const { onOpenChange } = mount(SafetyReportSheet, { handlers: sheetHandlers({ onSafetyReport }) });
    await user.click(screen.getByRole('radio', { name: copy.safety.kinds.harassment }));
    const description = screen.getByRole('textbox', { name: copy.safety.description });
    fireEvent.change(description, { target: { value: '  Please contact me about harassment.  ' } });
    await user.click(screen.getByRole('button', { name: copy.safety.submit }));
    expect(onSafetyReport).toHaveBeenCalledExactlyOnceWith({ kind: 'harassment', description: 'Please contact me about harassment.' });
    expect(description).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.sending })).toHaveAttribute('aria-busy', 'true');
    const emergency = emergencyLink();
    emergency.focus();
    expect(emergency).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ ok: true, code: 'submitted' }));
    expect(screen.getByText(copy.safety.sent)).toBeVisible();
    expect(notify.success).toHaveBeenCalledWith(copy.safety.sent);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(navigation.refresh).toHaveBeenCalledOnce();
    emergencyLink();
  });

  it('retains safety inputs after a server error and focuses the invalid description', async () => {
    const user = userEvent.setup();
    const onSafetyReport = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'validation_failed', fieldErrors: { description: ['too_short'] } }));
    const { onOpenChange } = mount(SafetyReportSheet, { handlers: sheetHandlers({ onSafetyReport }) });
    const kind = screen.getByRole('radio', { name: copy.safety.kinds.property_damage });
    await user.click(kind);
    const description = screen.getByRole('textbox', { name: copy.safety.description });
    fireEvent.change(description, { target: { value: 'The property was damaged.' } });
    await user.click(screen.getByRole('button', { name: copy.safety.submit }));
    expect(await screen.findByText(messages.forms.fieldErrors.too_short)).toBeVisible();
    await waitFor(() => expect(description).toHaveFocus());
    expect(description).toHaveValue('The property was damaged.');
    expect(description).toHaveAccessibleDescription(expect.stringContaining(messages.forms.fieldErrors.too_short));
    expect(kind).toHaveAttribute('aria-checked', 'true');
    expect(within(screen.getByRole('form', { name: copy.safety.title })).getByText(messages.feedback.error.validation_failed)).toBeVisible();
    expect(onOpenChange).not.toHaveBeenCalled();
    emergencyLink();
  });
});
