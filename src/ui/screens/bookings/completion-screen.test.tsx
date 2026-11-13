/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, COMPLETION_UNAVAILABLE_REASONS, routes, type ActionResult, type CompletionHandlers, type CompletionPageData, type PriceBreakdown } from '@/contracts';
import { completionUnavailableData, deskAllowanceCompletionPageData, deskBreakdown, deskCompletionPageData, deskCompletionView, deskWithExpensesCompletionView, movingCompletionPageData, movingFinalBreakdown, remoteCompletionPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { CompletionEarnings } from './completion-earnings';
import { CompletionContent, CompletionScreen } from './completion-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // The checklist's Radix checkboxes measure themselves.
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const now = '2026-11-21T17:40:00.000Z';
const success = { ok: true, code: 'submitted', redirectTo: routes.app.booking('bkg_desk') } as const;
const photo = deskCompletionView.photos[0]!;
const receipt = deskWithExpensesCompletionView.expenses[0]!.receipt;
const workInput = () => screen.getByLabelText(messages.bookingComplete.photos.label);
const send = () => screen.getByRole('button', { name: messages.bookingComplete.send });
/** The desk's checklist as sent when nothing is ticked: every item, unticked. */
const unticked = Object.fromEntries(deskCompletionPageData.rules.checklist.map((key) => [key, false]));
const deskItems = messages.completion.checklist.items['furniture-assembly'];

function mount(data: CompletionPageData = deskCompletionPageData, overrides: Partial<CompletionHandlers> = {}) {
  const handlers: CompletionHandlers = {
    onSubmit: vi.fn().mockResolvedValue(success),
    onUploadPhoto: vi.fn().mockResolvedValue({ ok: true, photo }),
    onQuoteFinal: vi.fn().mockResolvedValue(deskBreakdown),
    ...overrides,
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><CompletionScreen data={data} handlers={handlers} now={now} /></NextIntlClientProvider>) };
}

async function ready(handlers: CompletionHandlers) {
  await waitFor(() => expect(handlers.onQuoteFinal).toHaveBeenCalled());
  await waitFor(() => expect(send()).toBeEnabled());
}

async function uploadWork(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(workInput(), new File(['finished work'], 'desk.jpg', { type: 'image/jpeg' }));
  await waitFor(() => expect(screen.getByRole('img', { name: photo.alt })).toBeInTheDocument());
}

async function addReceipt(user: ReturnType<typeof userEvent.setup>, amount = '8.00') {
  await user.click(screen.getByRole('button', { name: messages.bookingComplete.expenses.add }));
  fireEvent.change(screen.getByRole('textbox', { name: messages.bookingComplete.expenses.description }), { target: { value: 'Wall anchors' } });
  fireEvent.change(screen.getByRole('textbox', { name: messages.bookingComplete.expenses.amount }), { target: { value: amount } });
  await user.upload(screen.getByLabelText(messages.bookingComplete.expenses.photo), new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' }));
}

describe('CompletionScreen', () => {
  it.each([
    ['fixed', deskCompletionPageData, false, false, false],
    ['allowance', deskAllowanceCompletionPageData, false, true, false],
    ['hourly', movingCompletionPageData, true, false, false],
    ['remote', remoteCompletionPageData, false, false, true],
  ] as const)('shows only the fields supplied by %s rules', (_name, data, hours, expenses, noteRequired) => {
    mount(data);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(!!screen.queryByRole('spinbutton', { name: messages.bookingComplete.hours })).toBe(hours);
    expect(!!screen.queryByRole('button', { name: messages.bookingComplete.expenses.add })).toBe(expenses);
    expect(screen.getByRole('textbox', { name: noteRequired ? messages.bookingComplete.note : messages.bookingComplete.noteOptional })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.bookingComplete.back })).toHaveAttribute('href', routes.app.booking(data.booking.id));
  });

  it('requires a photo and focuses the upload field before calling onSubmit', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await ready(handlers);
    await user.click(send());
    expect(await screen.findByText('Add at least 1 photo of the finished work.')).toBeVisible();
    await waitFor(() => expect(workInput()).toHaveFocus());
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('submits an uploaded photo id with the empty optional fields and follows redirectTo', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await ready(handlers);
    await uploadWork(user);
    await user.click(send());
    await waitFor(() => expect(handlers.onSubmit).toHaveBeenCalledExactlyOnceWith({ photoIds: [photo.id], note: '', expenses: [], checklist: unticked }));
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(success.redirectTo);
    const body = vi.mocked(handlers.onUploadPhoto).mock.calls[0]?.[0];
    expect(body).toBeInstanceOf(FormData);
    expect(body?.get('file')).toBeInstanceOf(File);
  });

  it('checks file size before uploading and permits another attempt', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await ready(handlers);
    const oversized = new File(['photo'], 'large.jpg', { type: 'image/jpeg' });
    Object.defineProperty(oversized, 'size', { value: 11 * 1024 * 1024 });
    await user.upload(workInput(), oversized);
    expect(await screen.findByText('This photo is too large. Choose one under 10 MB.')).toBeVisible();
    expect(handlers.onUploadPhoto).not.toHaveBeenCalled();
    await uploadWork(user);
    expect(handlers.onUploadPhoto).toHaveBeenCalledOnce();
  });

  it('requires the remote note and preserves it after a server failure', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(remoteCompletionPageData, { onSubmit: vi.fn().mockResolvedValue({ ok: false, code: 'unknown' }) });
    await ready(handlers);
    await user.click(send());
    expect(await screen.findByText(messages.forms.fieldErrors.required)).toBeVisible();
    const note = screen.getByRole('textbox', { name: messages.bookingComplete.note });
    await waitFor(() => expect(note).toHaveFocus());
    fireEvent.change(note, { target: { value: 'Helped set up the printer and tested a page.' } });
    await user.click(send());
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(note).toHaveValue('Helped set up the printer and tested a page.');
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each([
    ['4.5', 'out_of_range'],
    ['3.25', 'invalid'],
  ] as const)('refuses invalid hourly input %s before submission', async (hours, code) => {
    const user = userEvent.setup();
    const { handlers } = mount(movingCompletionPageData);
    await ready(handlers);
    const input = screen.getByRole('spinbutton', { name: messages.bookingComplete.hours });
    fireEvent.change(input, { target: { value: hours } });
    await user.click(send());
    expect(await screen.findByText(messages.forms.fieldErrors[code])).toBeVisible();
    await waitFor(() => expect(input).toHaveFocus());
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('refuses receipts over the supplied allowance before submission', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(deskAllowanceCompletionPageData);
    await ready(handlers);
    await uploadWork(user);
    await addReceipt(user, '20.01');
    await user.click(send());
    expect(await screen.findByText('The receipts exceed the $20.00 allowance. Check the amounts before sending.')).toBeVisible();
    expect(screen.getByText('$20.01 of $20.00 allowance')).toBeVisible();
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('sends receipt amounts as integer cents and asks for the supplied final breakdown', async () => {
    const user = userEvent.setup();
    const onUploadPhoto = vi.fn<CompletionHandlers['onUploadPhoto']>().mockResolvedValueOnce({ ok: true, photo }).mockResolvedValue({ ok: true, photo: receipt });
    const { handlers } = mount(deskAllowanceCompletionPageData, { onUploadPhoto });
    await ready(handlers);
    await uploadWork(user);
    await addReceipt(user);
    await waitFor(() => expect(handlers.onQuoteFinal).toHaveBeenLastCalledWith({ expensesCents: 800 }));
    await waitFor(() => expect(send()).toBeEnabled());
    expect(screen.getByText('$8.00 of $20.00 allowance')).toBeVisible();
    await user.click(send());
    await waitFor(() => expect(handlers.onSubmit).toHaveBeenCalledExactlyOnceWith({
      photoIds: [photo.id], note: '', expenses: [{ description: 'Wall anchors', amountCents: 800, receiptPhotoId: receipt.id }], checklist: unticked,
    }));
  });

  it('sends the optional checklist ticks with the work', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await ready(handlers);
    const checklist = screen.getByRole('group', { name: messages.bookingComplete.checklist.title });
    expect(checklist).toHaveAccessibleDescription(messages.bookingComplete.checklist.hint);
    expect(screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false']);
    await uploadWork(user);
    await user.click(screen.getByRole('checkbox', { name: deskItems.level_and_stable }));
    await user.click(screen.getByText(deskItems.packaging_cleared));
    expect(screen.getByRole('checkbox', { name: deskItems.packaging_cleared })).toBeChecked();
    await user.click(send());
    await waitFor(() => expect(handlers.onSubmit).toHaveBeenCalledExactlyOnceWith({
      photoIds: [photo.id], note: '', expenses: [], checklist: { ...unticked, level_and_stable: true, packaging_cleared: true },
    }));
  });

  it('shows no checklist when the category has none', () => {
    mount({ ...deskCompletionPageData, rules: { ...deskCompletionPageData.rules, checklist: [] } });
    expect(screen.queryByRole('group', { name: messages.bookingComplete.checklist.title })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('focuses a dotted server receipt error and retains the receipt fields', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(deskAllowanceCompletionPageData, { onSubmit: vi.fn().mockResolvedValue({ ok: false, code: 'validation_failed', fieldErrors: { 'expenses.0.amountCents': ['out_of_range'] } }) });
    await ready(handlers);
    await uploadWork(user);
    await addReceipt(user);
    await waitFor(() => expect(handlers.onQuoteFinal).toHaveBeenLastCalledWith({ expensesCents: 800 }));
    await waitFor(() => expect(send()).toBeEnabled());
    await user.click(send());
    expect(await screen.findByText(messages.forms.fieldErrors.out_of_range)).toBeVisible();
    const amount = screen.getByRole('textbox', { name: messages.bookingComplete.expenses.amount });
    await waitFor(() => expect(amount).toHaveFocus());
    expect(amount).toHaveValue('8.00');
    expect(screen.getByRole('textbox', { name: messages.bookingComplete.expenses.description })).toHaveValue('Wall anchors');
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('focuses a rejected receipt photo even when the receipt already has one upload', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(deskAllowanceCompletionPageData, { onSubmit: vi.fn().mockResolvedValue({ ok: false, code: 'validation_failed', fieldErrors: { 'expenses.0.receiptPhotoId': ['invalid'] } }) });
    await ready(handlers);
    await uploadWork(user);
    await addReceipt(user);
    await waitFor(() => expect(handlers.onQuoteFinal).toHaveBeenLastCalledWith({ expensesCents: 800 }));
    await waitFor(() => expect(send()).toBeEnabled());
    await user.click(send());
    expect(await screen.findByText(messages.forms.fieldErrors.invalid)).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText(messages.bookingComplete.expenses.photo)).toHaveFocus());
    expect(screen.getByRole('textbox', { name: messages.bookingComplete.expenses.amount })).toHaveValue('8.00');
  });

  it('locks form controls during submission and restores them after an error', async () => {
    const user = userEvent.setup();
    let resolve!: (result: ActionResult) => void;
    const onSubmit = vi.fn(() => new Promise<ActionResult>((done) => { resolve = done; }));
    const { handlers } = mount(undefined, { onSubmit });
    await ready(handlers);
    await uploadWork(user);
    await user.click(send());
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true');
    expect(workInput()).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: messages.bookingComplete.sending })).toBeDisabled();
    await act(async () => { resolve({ ok: false, code: 'rate_limited' }); });
    expect(await screen.findByText(messages.forms.actionErrors.rate_limited)).toBeVisible();
    expect(workInput()).toBeEnabled();
    expect(screen.getByRole('img', { name: photo.alt })).toBeInTheDocument();
  });

  it('retries a failed earnings request and locks the form while the request is pending', async () => {
    const user = userEvent.setup();
    let resolve!: (result: PriceBreakdown) => void;
    const onQuoteFinal = vi.fn<CompletionHandlers['onQuoteFinal']>().mockRejectedValueOnce(new Error('unavailable')).mockImplementation(() => new Promise((done) => { resolve = done; }));
    mount(undefined, { onQuoteFinal });
    expect(await screen.findByText(messages.bookingComplete.earningsError)).toBeVisible();
    await user.click(screen.getByRole('button', { name: messages.bookingComplete.retryEarnings }));
    await waitFor(() => expect(onQuoteFinal).toHaveBeenCalledTimes(2));
    expect(send()).toBeDisabled();
    expect(workInput()).toBeDisabled();
    await act(async () => { resolve(deskBreakdown); });
    expect(await screen.findByText('$54.00')).toBeVisible();
    expect(send()).toBeEnabled();
  });

  it.each(ACTION_ERROR_CODES)('has friendly feedback for %s', (code) => {
    const handlers: CompletionHandlers = { onSubmit: vi.fn(), onUploadPhoto: vi.fn(), onQuoteFinal: vi.fn() };
    render(<NextIntlClientProvider locale="en" messages={messages}><CompletionContent data={deskCompletionPageData} handlers={handlers} now={now} initialResult={{ ok: false, code }} /></NextIntlClientProvider>);
    const expected = code === 'not_allowed' ? messages.bookingComplete.changed
      : code in messages.forms.actionErrors ? messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] : messages.feedback.error[code];
    expect(screen.getByText(expected)).toBeVisible();
  });

  it.each(COMPLETION_UNAVAILABLE_REASONS)('has explanatory copy and no form when unavailable: %s', (reason) => {
    mount(completionUnavailableData[reason]);
    expect(screen.getByText(messages.bookingComplete.unavailable[reason])).toBeVisible();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
});

describe('CompletionEarnings', () => {
  it('ignores an older response after the quote inputs change', async () => {
    let oldResolve!: (result: PriceBreakdown) => void;
    let newResolve!: (result: PriceBreakdown) => void;
    const onQuote = vi.fn<CompletionHandlers['onQuoteFinal']>()
      .mockImplementationOnce(() => new Promise((done) => { oldResolve = done; }))
      .mockImplementationOnce(() => new Promise((done) => { newResolve = done; }));
    const onBusyChange = vi.fn();
    const view = (hoursWorked: number) => <NextIntlClientProvider locale="en" messages={messages}><CompletionEarnings hoursWorked={hoursWorked} expensesCents={0} valid onQuote={onQuote} onBusyChange={onBusyChange} /></NextIntlClientProvider>;
    const { rerender } = render(view(3));
    await waitFor(() => expect(onQuote).toHaveBeenCalledWith({ hoursWorked: 3, expensesCents: 0 }));
    rerender(view(3.5));
    await waitFor(() => expect(onQuote).toHaveBeenLastCalledWith({ hoursWorked: 3.5, expensesCents: 0 }));
    await act(async () => { newResolve(movingFinalBreakdown); });
    expect(await screen.findByText('$110.25')).toBeVisible();
    await act(async () => { oldResolve(deskBreakdown); });
    expect(screen.getByText('$110.25')).toBeVisible();
    expect(screen.queryByText('$54.00')).not.toBeInTheDocument();
  });
});
