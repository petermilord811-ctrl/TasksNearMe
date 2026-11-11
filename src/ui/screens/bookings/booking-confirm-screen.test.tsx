/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_ERROR_CODES,
  BOOKING_UNAVAILABLE_REASONS,
  routes,
  type BookingConfirmHandlers,
  type BookingConfirmPageData,
  type ConfirmBookingInput,
  type PaymentAttemptResult,
} from '@/contracts';
import {
  deskConfirmData,
  deskConfirmDeclinedData,
  deskConfirmInsufficientFundsData,
  deskConfirmNewCardData,
  deskConfirmUnavailableData,
  fakeHandler,
  movingConfirmHourlyData,
  remoteConfirmData,
} from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { BookingConfirmScreen } from './booking-confirm-screen';

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

const now = '2026-11-17T15:02:00.000Z';
const booked = { ok: true, code: 'booked', redirectTo: routes.app.booking('bkg_desk') } as const;
const verification = { ok: false, code: 'requires_bank_verification', verification: { paymentId: 'pay_desk_2', kind: 'dev' } } as const;

function mount(data: BookingConfirmPageData = deskConfirmData, overrides: Partial<BookingConfirmHandlers> = {}) {
  const handlers: BookingConfirmHandlers = {
    onConfirm: vi.fn(fakeHandler<ConfirmBookingInput>(booked, 0)),
    onFinishVerification: vi.fn(fakeHandler<Parameters<BookingConfirmHandlers['onFinishVerification']>[0]>(booked, 0)),
    ...overrides,
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><BookingConfirmScreen data={data} handlers={handlers} now={now} /></NextIntlClientProvider>) };
}

const terms = () => screen.getByRole('checkbox', { name: /I agree/ });
const submit = () => screen.getByRole('button', { name: /^Book and pay/ });

async function acceptAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(terms());
  await user.click(submit());
}

describe('BookingConfirmScreen', () => {
  it('books the default saved card with the unchanged offer revision and follows redirectTo', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('radio', { name: /Visa.*1881/ })).toBeChecked();
    expect(terms()).not.toBeChecked();
    expect(submit()).toHaveAccessibleName('Book and pay $66.00');
    await acceptAndSubmit(user);
    await waitFor(() => expect(handlers.onConfirm).toHaveBeenCalledExactlyOnceWith({
      offerRevision: 1,
      payment: { kind: 'saved', methodId: 'pm_maya_visa' },
      acceptTerms: true,
    }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(booked.redirectTo));
  });

  it('requires consent before calling the handler and focuses the checkbox', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(submit());
    expect(await screen.findByText(messages.forms.fieldErrors.must_accept)).toBeVisible();
    await waitFor(() => expect(terms()).toHaveFocus());
    expect(terms()).toHaveAttribute('aria-invalid', 'true');
    expect(handlers.onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', routes.legal('terms'));
    expect(screen.getAllByRole('link', { name: /Cancellation policy/i }).every((link) => link.getAttribute('href') === routes.legal('cancellation-policy'))).toBe(true);
  });

  it('keeps consent and payment choices after a decline and books after switching cards', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn<BookingConfirmHandlers['onConfirm']>()
      .mockResolvedValueOnce({ ok: false, code: 'payment_declined' })
      .mockResolvedValueOnce(booked);
    mount(deskConfirmData, { onConfirm });
    await user.click(screen.getByRole('radio', { name: 'Use a new card' }));
    await user.click(screen.getByRole('radio', { name: 'Declined' }));
    await user.click(screen.getByRole('checkbox', { name: 'Save this card for next time' }));
    await acceptAndSubmit(user);
    await waitFor(() => expect(onConfirm).toHaveBeenNthCalledWith(1, {
      offerRevision: 1,
      payment: { kind: 'dev_card', card: 'declined', save: true },
      acceptTerms: true,
    }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Payment' })).toHaveFocus());
    expect(terms()).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Declined' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Save this card for next time' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Mastercard.*4444/ }));
    await user.click(submit());
    await waitFor(() => expect(onConfirm).toHaveBeenNthCalledWith(2, {
      offerRevision: 1,
      payment: { kind: 'saved', methodId: 'pm_maya_mc' },
      acceptTerms: true,
    }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(booked.redirectTo));
  });

  it('opens bank verification and submits the approved outcome before navigating', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn<BookingConfirmHandlers['onConfirm']>().mockResolvedValue(verification);
    const { handlers } = mount(deskConfirmNewCardData, { onConfirm });
    await user.click(screen.getByRole('radio', { name: 'Bank verification' }));
    await acceptAndSubmit(user);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName(/Your bank wants to confirm/);
    expect(navigation.push).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(handlers.onFinishVerification).toHaveBeenCalledExactlyOnceWith({ paymentId: 'pay_desk_2', outcome: 'approved' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(booked.redirectTo));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
      offerRevision: 1,
      payment: { kind: 'dev_card', card: 'requires_verification', save: false },
      acceptTerms: true,
    });
  });

  it.each(['Fail', 'Escape'] as const)('treats bank %s as failed verification and permits retry', async (choice) => {
    const user = userEvent.setup();
    const onFinishVerification = vi.fn(fakeHandler<Parameters<BookingConfirmHandlers['onFinishVerification']>[0]>({ ok: false, code: 'payment_declined' }, 0));
    mount(deskConfirmNewCardData, {
      onConfirm: vi.fn<BookingConfirmHandlers['onConfirm']>().mockResolvedValue(verification),
      onFinishVerification,
    });
    await user.click(screen.getByRole('radio', { name: 'Bank verification' }));
    await acceptAndSubmit(user);
    const dialog = await screen.findByRole('dialog');
    if (choice === 'Escape') await user.keyboard('{Escape}');
    else await user.click(within(dialog).getByRole('button', { name: 'Fail' }));
    await waitFor(() => expect(onFinishVerification).toHaveBeenCalledExactlyOnceWith({ paymentId: 'pay_desk_2', outcome: 'failed' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('region', { name: 'Payment' })).toHaveFocus());
    expect(submit()).toBeEnabled();
    expect(terms()).toBeChecked();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each(['version_conflict', 'not_allowed', 'expired'] as const)('offers a working reload for %s', async (code) => {
    const user = userEvent.setup();
    mount(deskConfirmData, { onConfirm: fakeHandler({ ok: false, code }, 0) });
    await acceptAndSubmit(user);
    await user.click(await screen.findByRole('button', { name: /Reload/i }));
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    expect(terms()).toBeChecked();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each(['unknown', 'version_conflict'] as const)('focuses inline %s feedback after the bank dialog closes', async (code) => {
    const user = userEvent.setup();
    const onFinishVerification = vi.fn(fakeHandler<Parameters<BookingConfirmHandlers['onFinishVerification']>[0]>({ ok: false, code }, 0));
    mount(deskConfirmNewCardData, {
      onConfirm: vi.fn<BookingConfirmHandlers['onConfirm']>().mockResolvedValue(verification),
      onFinishVerification,
    });
    await acceptAndSubmit(user);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    const copy = code === 'unknown'
      ? messages.feedback.error.unknown
      : messages.bookingConfirm.errors.version_conflict.replace('{helper}', deskConfirmData.offer.helper.displayName);
    const feedback = await screen.findByText(copy);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(feedback.closest('[tabindex="-1"]')).toHaveFocus());
    expect(document.body).not.toHaveFocus();
    expect(onFinishVerification).toHaveBeenCalledExactlyOnceWith({ paymentId: 'pay_desk_2', outcome: 'approved' });
    expect(submit()).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('keeps a successful booking locked while navigation is pending', async () => {
    const user = userEvent.setup();
    const { handlers, container } = mount();
    await acceptAndSubmit(user);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(booked.redirectTo));
    expect(submit()).toBeDisabled();
    expect(terms()).toBeDisabled();
    await user.click(submit());
    fireEvent.submit(container.querySelector('form')!);
    expect(handlers.onConfirm).toHaveBeenCalledTimes(1);
    expect(navigation.push).toHaveBeenCalledTimes(1);
  });

  it('locks the entire form and sends one request for duplicate submits', async () => {
    const user = userEvent.setup();
    let finish!: (result: PaymentAttemptResult) => void;
    const onConfirm = vi.fn(() => new Promise<PaymentAttemptResult>((resolve) => { finish = resolve; }));
    const { container } = mount(deskConfirmNewCardData, { onConfirm });
    await user.click(terms());
    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    const pending = await screen.findByRole('button', { name: /Booking/ });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(terms()).toBeDisabled();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Save this card for next time' })).toBeDisabled();
    await user.click(pending);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => finish(booked));
    expect(navigation.push).toHaveBeenCalledWith(booked.redirectTo);
  });

  it('locks verification controls until the result returns', async () => {
    const user = userEvent.setup();
    let finish!: (result: PaymentAttemptResult) => void;
    const onFinishVerification = vi.fn(() => new Promise<PaymentAttemptResult>((resolve) => { finish = resolve; }));
    mount(deskConfirmNewCardData, {
      onConfirm: vi.fn<BookingConfirmHandlers['onConfirm']>().mockResolvedValue(verification),
      onFinishVerification,
    });
    await acceptAndSubmit(user);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(within(dialog).getByRole('button', { name: 'Fail' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onFinishVerification).toHaveBeenCalledTimes(1);
    await act(async () => finish(booked));
    expect(navigation.push).toHaveBeenCalledWith(booked.redirectTo);
  });

  it.each(BOOKING_UNAVAILABLE_REASONS)('keeps the summary but removes the form for %s', (reason) => {
    const { container, handlers } = mount(deskConfirmUnavailableData[reason]);
    expect(screen.getByText(deskConfirmData.task.title)).toBeVisible();
    expect(container.querySelector('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Book and pay/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /I agree/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to (the )?task/ })).toHaveAttribute('href', routes.app.task(deskConfirmData.task.id));
    expect(screen.getByText(messages.bookingConfirm.unavailable[reason].replace('{helper}', deskConfirmData.offer.helper.displayName))).toBeVisible();
    expect(handlers.onConfirm).not.toHaveBeenCalled();
  });

  it.each(ACTION_ERROR_CODES)('announces friendly feedback for the %s result', async (code) => {
    const user = userEvent.setup();
    mount(deskConfirmData, { onConfirm: fakeHandler({ ok: false, code }, 0) });
    await acceptAndSubmit(user);
    const copy = code in messages.bookingConfirm.errors
      ? messages.bookingConfirm.errors[code as keyof typeof messages.bookingConfirm.errors].replace('{helper}', deskConfirmData.offer.helper.displayName)
      : code in messages.forms.actionErrors
        ? messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors]
        : messages.feedback.error[code];
    const feedback = await screen.findByText(copy);
    expect(feedback).toBeVisible();
    expect(feedback.closest('[aria-live]')).not.toBeNull();
    expect(submit()).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('displays the retry deadline in market time', async () => {
    const user = userEvent.setup();
    mount(deskConfirmData, { onConfirm: fakeHandler({ ok: false, code: 'rate_limited', retryAt: '2026-11-17T15:40:00.000Z' }, 0) });
    await acceptAndSubmit(user);
    expect(await screen.findByText(/Try again after.*9:40 am/)).toBeVisible();
  });

  it.each(['acceptTerms', 'payment.methodId', 'payment.card'] as const)('shows and focuses the server error for %s', async (field) => {
    const user = userEvent.setup();
    const data = field === 'payment.card' ? deskConfirmNewCardData : deskConfirmData;
    mount(data, { onConfirm: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { [field]: ['invalid'] } }, 0) });
    await acceptAndSubmit(user);
    expect(await screen.findByText(messages.forms.fieldErrors.invalid)).toBeVisible();
    if (field === 'acceptTerms') await waitFor(() => expect(terms()).toHaveFocus());
    else {
      await waitFor(() => {
        const focus = document.activeElement;
        expect(focus?.getAttribute('role') === 'radio' || focus?.getAttribute('role') === 'radiogroup').toBe(true);
      });
    }
    expect(terms()).toBeChecked();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('falls back to friendly unknown feedback if a handler rejects', async () => {
    const user = userEvent.setup();
    mount(deskConfirmData, { onConfirm: vi.fn().mockRejectedValue(new Error('offline')) });
    await acceptAndSubmit(user);
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(terms()).toBeChecked();
    expect(submit()).toBeEnabled();
  });

  it.each([
    ['declined', deskConfirmDeclinedData],
    ['insufficient funds', deskConfirmInsufficientFundsData],
  ] as const)('describes the prior %s payment and hold without making a request', (failure, data) => {
    const { container, handlers } = mount(data);
    expect(container.textContent).toMatch(/Visa.*1881.*9:01 am/);
    expect(container.textContent).toContain(failure);
    expect(container.textContent).toMatch(/hold.*9:31 am/);
    expect(container.textContent).toMatch(/in 29 minutes/);
    expect(handlers.onConfirm).not.toHaveBeenCalled();
  });

  it('uses the hourly cap amount and sends its supplied revision unchanged', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(movingConfirmHourlyData);
    expect(submit()).toHaveAccessibleName('Book and pay $154.00');
    expect(screen.getByText(/You pay for up to 4 hours now/)).toBeVisible();
    await acceptAndSubmit(user);
    await waitFor(() => expect(handlers.onConfirm).toHaveBeenCalledWith({
      offerRevision: 2,
      payment: { kind: 'dev_card', card: 'success', save: false },
      acceptTerms: true,
    }));
  });

  it('shows the remote address notice without an exact address', () => {
    const { container } = mount(remoteConfirmData);
    expect(screen.getByText(/No address needed.*meeting link in chat/)).toBeVisible();
    expect(container.textContent).not.toContain('Example Lane');
    expect(submit()).toHaveAccessibleName('Book and pay $44.00');
  });
});
