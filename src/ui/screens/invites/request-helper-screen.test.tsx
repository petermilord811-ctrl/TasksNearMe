/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, routes, type PaymentAttemptResult, type RequestHelperHandlers, type RequestHelperInput, type RequestHelperPageData } from '@/contracts';
import { bookshelfBreakdown, fakeHandler, jordanYardSlot, movingFundedBreakdown, movingPublicTask, requestBookAgainData, requestBookAgainOnlyData, requestJordanData, requestJordanSlotData, requestJordanSlotTakenData, requestNoTasksData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { RequestHelperContent, RequestHelperScreen } from './request-helper-screen';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const now = '2026-12-08T16:00:00.000Z';
const sent = { ok: true, code: 'sent', redirectTo: routes.app.task('tsk_bookshelf') } as const;
const verification = { ok: false, code: 'requires_bank_verification', verification: { paymentId: 'pay_invite_bookshelf', kind: 'dev' } } as const;
const terms = () => screen.getByRole('checkbox', { name: /I agree/ });
const submit = () => screen.getByRole('button', { name: 'Send request' });
const start = () => screen.getByLabelText('Start time');
const price = () => screen.getByRole('textbox', { name: 'Task price ($)' });

function mount(data: RequestHelperPageData = requestJordanData, overrides: Partial<RequestHelperHandlers> = {}, initialResult?: PaymentAttemptResult) {
  const handlers: RequestHelperHandlers = {
    onQuote: vi.fn(async () => bookshelfBreakdown),
    onRequest: vi.fn(fakeHandler<RequestHelperInput>(sent, 0)),
    onFinishVerification: vi.fn(fakeHandler<Parameters<RequestHelperHandlers['onFinishVerification']>[0]>(sent, 0)),
    ...overrides,
  };
  const props = { data, handlers, now };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><TimeZoneProvider timeZone="America/Chicago">
    {initialResult ? <RequestHelperContent {...props} initialResult={initialResult} /> : <RequestHelperScreen {...props} />}
  </TimeZoneProvider></NextIntlClientProvider>) };
}

async function ready() {
  await waitFor(() => expect(submit()).toBeEnabled());
}

async function send(user: ReturnType<typeof userEvent.setup>) {
  await ready();
  await user.click(terms());
  await user.click(submit());
}

describe('RequestHelperScreen', () => {
  it('names a same-day window’s day once (Spanish pass, 2026-11-21)', async () => {
    mount();
    await ready();
    const line = screen.getByText((text) => text.includes('Dec 12') && text.includes('Central Time'));
    expect(line.textContent).toMatch(/^Sat, Dec 12 · 9:00\sam–3:00\spm · Central Time$/);
  });

  it('prefills the slot price and sends its id with a start inside both windows', async () => {
    const user = userEvent.setup();
    const data: RequestHelperPageData = { ...requestJordanSlotData, tasks: [{ ...requestJordanSlotData.tasks[0], windowStart: '2026-12-12T16:00:00.000Z' }] };
    const { handlers } = mount(data);
    expect(screen.getByRole('heading', { name: messages.invites.slotTitle })).toBeVisible();
    expect(start()).toHaveValue('2026-12-12T10:00');
    expect(start()).toHaveAttribute('min', '2026-12-12T10:00');
    expect(start()).toHaveAttribute('max', '2026-12-12T12:59');
    expect(screen.getByRole('textbox', { name: 'Hourly rate ($)' })).toHaveValue('30');
    expect(screen.getByRole('spinbutton', { name: 'Estimated hours' })).toHaveValue(3);
    expect(screen.getByRole('spinbutton', { name: 'Hours cap' })).toHaveValue(4);
    await send(user);
    await waitFor(() => expect(handlers.onRequest).toHaveBeenCalledWith(expect.objectContaining({
      slotId: jordanYardSlot.id, start: data.tasks[0].windowStart, pricing: jordanYardSlot.pricing,
    })));
  });

  it('uses the slot start when it is later, and updates the intersection on task selection', async () => {
    const user = userEvent.setup();
    const data: RequestHelperPageData = { ...requestJordanSlotData, tasks: [
      { ...requestJordanSlotData.tasks[0], windowStart: '2026-12-12T14:00:00.000Z' },
      { ...requestJordanSlotData.tasks[0], id: 'tsk_second', title: 'Bag the front-yard leaves', windowStart: '2026-12-12T17:00:00.000Z', windowEnd: '2026-12-12T18:00:00.000Z' },
    ] };
    const { handlers } = mount(data);
    expect(start()).toHaveValue('2026-12-12T09:00');
    await user.click(screen.getByRole('radio', { name: /Bag the front-yard leaves/ }));
    expect(start()).toHaveValue('2026-12-12T11:00');
    expect(start()).toHaveAttribute('max', '2026-12-12T12:00');
    await send(user);
    await waitFor(() => expect(handlers.onRequest).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'tsk_second', slotId: jordanYardSlot.id, start: data.tasks[1].windowStart, pricing: jordanYardSlot.pricing,
    })));
  });

  it.each(['2026-12-12T08:59', '2026-12-12T13:00'])('rejects a start outside the opening even when the task allows it: %s', async (value) => {
    const user = userEvent.setup();
    const { handlers } = mount({ ...requestJordanSlotData, tasks: [{ ...requestJordanSlotData.tasks[0], windowStart: '2026-12-12T14:00:00.000Z' }] });
    fireEvent.change(start(), { target: { value } });
    await send(user);
    expect(await screen.findByText(messages.forms.fieldErrors.out_of_range)).toBeVisible();
    await waitFor(() => expect(start()).toHaveFocus());
    expect(handlers.onRequest).not.toHaveBeenCalled();
  });

  it('shows the unavailable notice and submits a regular request without a slot id', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(requestJordanSlotTakenData);
    expect(screen.getByText(messages.invites.slotUnavailable)).toBeVisible();
    expect(screen.queryByRole('heading', { name: messages.invites.slotTitle })).not.toBeInTheDocument();
    expect(price()).toHaveValue('45');
    expect(start()).toHaveAttribute('max', '2026-12-12T15:00');
    await send(user);
    await waitFor(() => expect(handlers.onRequest).toHaveBeenCalledOnce());
    expect(vi.mocked(handlers.onRequest).mock.calls[0][0]).not.toHaveProperty('slotId');
  });

  it('offers a regular request route when the slot request becomes unavailable during submission', async () => {
    const user = userEvent.setup();
    mount(requestJordanSlotData, { onRequest: fakeHandler({ ok: false, code: 'not_allowed' }, 0) });
    await send(user);
    expect(await screen.findByText(messages.invites.slotRequestUnavailable)).toBeVisible();
    expect(screen.getByRole('link', { name: messages.invites.regularRequest })).toHaveAttribute('href', routes.app.requestHelper(requestJordanSlotData.helper.handle));
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('sends cents, an Austin-to-ISO start, trimmed message and card choice; shows only the server total', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    expect(price()).toHaveValue('45');
    expect(start()).toHaveValue('2026-12-12T09:00');
    expect(terms()).not.toBeChecked();
    fireEvent.change(price(), { target: { value: '$50.00' } });
    fireEvent.change(start(), { target: { value: '2026-12-12T10:00' } });
    await user.type(screen.getByRole('textbox', { name: 'Message (optional)' }), '  Please bring your drill.  ');
    await ready();
    // The quote names the chosen task, so its expense allowance is in the total the hold covers.
    expect(handlers.onQuote).toHaveBeenLastCalledWith({ pricing: { type: 'fixed', priceCents: 5000 }, taskId: 'tsk_bookshelf' });
    expect(screen.getByText(/We'll place a hold of \$47\.25/)).toBeVisible();
    // $50.00 plus a 5% hold fee worked out on the screen: never shown, only the server's total is.
    expect(screen.queryByText('$52.50')).not.toBeInTheDocument();
    await user.click(terms());
    await user.click(submit());
    await waitFor(() => expect(handlers.onRequest).toHaveBeenCalledExactlyOnceWith({
      taskId: 'tsk_bookshelf', start: '2026-12-12T16:00:00.000Z', pricing: { type: 'fixed', priceCents: 5000 },
      message: 'Please bring your drill.', payment: { kind: 'saved', methodId: 'pm_maya_visa' }, acceptTerms: true,
    }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(sent.redirectTo));
    expect(await screen.findByText(messages.invites.sent)).toBeVisible();
    expect(submit()).toBeDisabled();
  });

  it('omits an empty optional message and uses listed pricing when no suggestion is present', async () => {
    const user = userEvent.setup();
    const { handlers } = mount({ ...requestJordanData, suggestion: undefined });
    expect(price()).toHaveValue('40');
    await send(user);
    await waitFor(() => expect(handlers.onRequest).toHaveBeenCalledWith(expect.objectContaining({
      pricing: requestJordanData.listedPricing['furniture-assembly'], message: undefined,
    })));
  });

  it('changes to the selected task window and hourly listed price, resetting consent', async () => {
    const user = userEvent.setup();
    const movingTask = { id: movingPublicTask.id, title: movingPublicTask.title, categorySlug: movingPublicTask.categorySlug, windowStart: movingPublicTask.schedule.windowStart, windowEnd: movingPublicTask.schedule.windowEnd };
    const data: RequestHelperPageData = {
      ...requestJordanData,
      tasks: [...requestJordanData.tasks, movingTask],
      listedPricing: { ...requestJordanData.listedPricing, 'moving-help': movingPublicTask.budget },
    };
    const { handlers } = mount(data, { onQuote: vi.fn(async () => movingFundedBreakdown) });
    await user.click(terms());
    await user.click(screen.getByRole('radio', { name: /Help loading a moving truck/ }));
    expect(terms()).not.toBeChecked();
    expect(start()).toHaveValue('2026-11-22T09:00');
    expect(screen.getByRole('textbox', { name: 'Hourly rate ($)' })).toHaveValue('35');
    expect(screen.getByRole('spinbutton', { name: 'Estimated hours' })).toHaveValue(3.5);
    expect(screen.getByRole('spinbutton', { name: 'Hours cap' })).toHaveValue(4);
    await send(user);
    await waitFor(() => expect(handlers.onRequest).toHaveBeenCalledExactlyOnceWith({
      taskId: movingPublicTask.id, start: movingTask.windowStart, pricing: movingPublicTask.budget,
      message: undefined, payment: { kind: 'saved', methodId: 'pm_maya_visa' }, acceptTerms: true,
    }));
    expect(screen.getByText(/We'll place a hold of \$147\.00/)).toBeVisible();
  });

  it('requires consent and focuses the terms checkbox', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await ready();
    await user.click(submit());
    expect(await screen.findByText(messages.forms.fieldErrors.must_accept)).toBeVisible();
    await waitFor(() => expect(terms()).toHaveFocus());
    expect(handlers.onRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Terms of service' })).toHaveAttribute('href', routes.legal('terms'));
    expect(screen.getByRole('link', { name: 'Cancellation policy' })).toHaveAttribute('href', routes.legal('cancellation-policy'));
  });

  it.each(['2026-12-12T08:59', '2026-12-12T15:01'])('rejects a start outside the supplied task window: %s', async (value) => {
    const user = userEvent.setup();
    const { handlers } = mount();
    expect(start()).toHaveAttribute('min', '2026-12-12T09:00');
    expect(start()).toHaveAttribute('max', '2026-12-12T15:00');
    fireEvent.change(start(), { target: { value } });
    await send(user);
    expect(await screen.findByText(messages.forms.fieldErrors.out_of_range)).toBeVisible();
    await waitFor(() => expect(start()).toHaveFocus());
    expect(handlers.onRequest).not.toHaveBeenCalled();
  });

  it('blocks submission until the latest quote resolves, including programmatic submits', async () => {
    vi.useFakeTimers();
    let finish!: (value: typeof bookshelfBreakdown) => void;
    const onQuote = vi.fn(() => new Promise<typeof bookshelfBreakdown>((resolve) => { finish = resolve; }));
    const { handlers, container } = mount(requestJordanData, { onQuote });
    expect(submit()).toBeDisabled();
    fireEvent.click(terms());
    fireEvent.submit(container.querySelector('form')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(screen.getByText(messages.invites.quotePending)).toBeVisible();
    expect(handlers.onRequest).not.toHaveBeenCalled();
    await act(async () => finish(bookshelfBreakdown));
    expect(submit()).toBeEnabled();
    fireEvent.change(price(), { target: { value: '50' } });
    expect(submit()).toBeDisabled();
    expect(screen.queryByText(/We'll place a hold/)).not.toBeInTheDocument();
    fireEvent.submit(container.querySelector('form')!);
    expect(handlers.onRequest).not.toHaveBeenCalled();
  });

  it('shows a failed quote and requires a successful retry before sending', async () => {
    const user = userEvent.setup();
    const onQuote = vi.fn<RequestHelperHandlers['onQuote']>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(bookshelfBreakdown);
    const { handlers, container } = mount(requestJordanData, { onQuote });
    expect(await screen.findByText(messages.invites.quoteError)).toBeVisible();
    expect(submit()).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(handlers.onRequest).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Update total' }));
    await ready();
    expect(onQuote).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/We'll place a hold of \$47\.25/)).toBeVisible();
  });

  it('locks pending controls and prevents duplicate requests through successful navigation', async () => {
    const user = userEvent.setup();
    let finish!: (result: PaymentAttemptResult) => void;
    const onRequest = vi.fn(() => new Promise<PaymentAttemptResult>((resolve) => { finish = resolve; }));
    const { container } = mount(requestJordanData, { onRequest });
    await ready();
    await user.click(terms());
    fireEvent.submit(container.querySelector('form')!);
    fireEvent.submit(container.querySelector('form')!);
    const pending = await screen.findByRole('button', { name: /Sending request/ });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('form')).toHaveAttribute('aria-busy', 'true');
    expect(price()).toBeDisabled();
    expect(start()).toBeDisabled();
    expect(terms()).toBeDisabled();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(onRequest).toHaveBeenCalledTimes(1);
    await act(async () => finish(sent));
    fireEvent.submit(container.querySelector('form')!);
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(submit()).toBeDisabled();
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(sent.redirectTo);
  });

  it('opens bank verification, locks verification controls, then sends the outcome and redirects', async () => {
    const user = userEvent.setup();
    let finish!: (result: PaymentAttemptResult) => void;
    const onFinishVerification = vi.fn(() => new Promise<PaymentAttemptResult>((resolve) => { finish = resolve; }));
    const onRequest = vi.fn<RequestHelperHandlers['onRequest']>().mockResolvedValue(verification);
    mount(requestJordanData, { onRequest, onFinishVerification });
    await user.click(screen.getByRole('radio', { name: 'Use a new card' }));
    await user.click(screen.getByRole('radio', { name: 'Bank verification' }));
    await send(user);
    const dialog = await screen.findByRole('dialog', { name: messages.payments.verification.title });
    expect(navigation.push).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(within(dialog).getByRole('button', { name: 'Fail' })).toBeDisabled();
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    await user.keyboard('{Escape}');
    expect(onFinishVerification).toHaveBeenCalledExactlyOnceWith({ paymentId: verification.verification.paymentId, outcome: 'approved' });
    expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({ payment: { kind: 'dev_card', card: 'requires_verification', save: false } }));
    await act(async () => finish(sent));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(sent.redirectTo);
  });

  it('shows a failed bank result, retains the entered request and permits retry', async () => {
    const user = userEvent.setup();
    const onFinishVerification = vi.fn(fakeHandler<Parameters<RequestHelperHandlers['onFinishVerification']>[0]>({ ok: false, code: 'payment_declined' }, 0));
    mount(requestJordanData, { onRequest: vi.fn<RequestHelperHandlers['onRequest']>().mockResolvedValue(verification), onFinishVerification });
    await send(user);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Fail' }));
    expect(await screen.findByText(messages.feedback.error.payment_declined)).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onFinishVerification).toHaveBeenCalledExactlyOnceWith({ paymentId: verification.verification.paymentId, outcome: 'failed' });
    expect(price()).toHaveValue('45');
    expect(terms()).toBeChecked();
    expect(submit()).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each(['pricing.priceCents', 'payment.methodId'] as const)('shows and focuses server field errors for %s', async (field) => {
    const user = userEvent.setup();
    mount(requestJordanData, { onRequest: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { [field]: ['invalid'] } }, 0) });
    await send(user);
    expect(await screen.findByText(messages.forms.fieldErrors.invalid)).toBeVisible();
    if (field === 'pricing.priceCents') await waitFor(() => expect(price()).toHaveFocus());
    else await waitFor(() => expect(document.activeElement).toHaveAttribute('role', 'radio'));
    expect(screen.getByText(messages.feedback.error.validation_failed)).toBeVisible();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each(ACTION_ERROR_CODES)('has friendly inline feedback for %s', (code) => {
    mount(requestJordanData, {}, { ok: false, code });
    const copy = code in messages.forms.actionErrors ? messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] : messages.feedback.error[code];
    expect(screen.getByText(copy)).toBeVisible();
    expect(screen.getByText(copy).closest('[aria-live]')).not.toBeNull();
  });

  it('shows the posting link and never requests a quote when no eligible task exists', () => {
    const { handlers, container } = mount(requestNoTasksData);
    expect(screen.getByRole('heading', { name: 'Post a task first' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', routes.app.newTask());
    expect(container.querySelector('form')).not.toBeInTheDocument();
    expect(handlers.onQuote).not.toHaveBeenCalled();
    expect(handlers.onRequest).not.toHaveBeenCalled();
  });
});

describe('Book again (journeys on a phone, J-C7)', () => {
  const choices = () => within(screen.getByRole('radiogroup', { name: 'Choose your task' }));
  const description = () => screen.getByRole('textbox', { name: 'What needs doing' });

  it('offers the past task first, its description to edit and Book again’s start, and sends the booking, not a task', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(requestBookAgainData);
    expect(choices().getAllByRole('radio')).toHaveLength(2);
    expect(choices().getAllByRole('radio')[0]).toBeChecked();
    expect(screen.getByText('From your booking on Sat, Nov 21')).toBeVisible();
    expect(screen.getByText(/^Only Jordan T\. sees this request\./)).toBeVisible();
    expect(description()).toHaveValue(requestBookAgainData.fromBooking!.description);
    expect(price()).toHaveValue('60');
    expect(start()).toHaveValue('2026-12-08T12:00');
    await user.clear(description());
    await user.type(description(), 'Two desks this time, the same model. About 80 parts in all.');
    fireEvent.change(start(), { target: { value: '2026-12-10T10:00' } });
    await send(user);
    await waitFor(() => expect(handlers.onRequest).toHaveBeenCalledExactlyOnceWith({
      fromBookingId: 'bkg_desk', description: 'Two desks this time, the same model. About 80 parts in all.', start: '2026-12-10T16:00:00.000Z',
      pricing: { type: 'fixed', priceCents: 6000 }, payment: { kind: 'saved', methodId: 'pm_maya_visa' }, acceptTerms: true,
    }));
    expect(vi.mocked(handlers.onRequest).mock.calls[0]![0]).not.toHaveProperty('taskId', expect.anything());
  });

  it('sends an open task instead when one is chosen, without the description', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(requestBookAgainData);
    await user.click(choices().getByRole('radio', { name: /Assemble a bookshelf/ }));
    expect(screen.queryByRole('textbox', { name: 'What needs doing' })).not.toBeInTheDocument();
    await send(user);
    await waitFor(() => expect(handlers.onRequest).toHaveBeenCalledOnce());
    const input = vi.mocked(handlers.onRequest).mock.calls[0]![0];
    expect(input).toMatchObject({ taskId: 'tsk_bookshelf' });
    expect(input.fromBookingId).toBeUndefined();
    expect(input.description).toBeUndefined();
  });

  it('needs a description of the task this time', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(requestBookAgainData);
    await user.clear(description());
    await send(user);
    await waitFor(() => expect(description()).toHaveAttribute('aria-invalid', 'true'));
    expect(handlers.onRequest).not.toHaveBeenCalled();
  });

  it('keeps the form without an open task, and says a request for this booking is already waiting', () => {
    const { container } = mount(requestBookAgainOnlyData);
    expect(screen.queryByRole('heading', { name: 'Post a task first' })).not.toBeInTheDocument();
    expect(container.querySelector('form')).toBeInTheDocument();
    expect(choices().getAllByRole('radio')).toHaveLength(1);
    cleanup();
    mount(requestBookAgainData, {}, { ok: false, code: 'validation_failed', fieldErrors: { taskId: ['in_use'] } });
    expect(screen.getByText("You already sent Jordan T. this request. It's waiting in My tasks.")).toBeVisible();
  });
});
