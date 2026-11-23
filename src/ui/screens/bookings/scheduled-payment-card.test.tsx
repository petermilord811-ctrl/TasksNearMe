/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingView, PaymentAttemptResult, ScheduledPaymentHandlers } from '@/contracts';
import {
  deskBookingPosterConfirmed, deskBookingPosterScheduled, YARD_VISIT_TIMES, yardVisitNoCardPoster, yardVisitPaymentDueHelper,
  yardVisitPaymentDuePoster, yardVisitScheduledHelper, yardVisitScheduledPoster,
} from '@/fixtures';
import { formatDateTime } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import { ScheduledPaymentCard } from './scheduled-payment-card';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const copy = messages.bookingHub.scheduledCard;
const booked: PaymentAttemptResult = { ok: true, code: 'booked' };
const visa = { kind: 'saved', methodId: 'pm_maya_visa' } as const;

function mount(data: BookingView, overrides: Partial<ScheduledPaymentHandlers> = {}, withHandlers = true) {
  const handlers: ScheduledPaymentHandlers = {
    onPayNow: vi.fn().mockResolvedValue(booked),
    onFinishPayVerification: vi.fn().mockResolvedValue(booked),
    ...overrides,
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><ScheduledPaymentCard data={data} handlers={withHandlers ? handlers : undefined} /></NextIntlClientProvider>) };
}

describe('ScheduledPaymentCard', () => {
  it('shows nothing for a booking that was paid at once', () => {
    const { container } = mount(deskBookingPosterConfirmed);
    expect(container).toBeEmptyDOMElement();
  });

  it('tells the client when their card is charged, and lets them pay now instead', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(yardVisitScheduledPoster);
    const card = screen.getByRole('region', { name: copy.title });
    expect(card).toHaveTextContent(`We'll charge Visa •••• 1881 $63.00 on ${formatDateTime(YARD_VISIT_TIMES.chargeAt)}.`);
    expect(within(card).getByText(copy.nothingYet)).toBeInTheDocument();
    // The form stays closed until asked for.
    expect(within(card).queryByRole('button', { name: 'Pay $63.00' })).not.toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Pay $63.00 now instead' }));
    await user.click(within(card).getByRole('button', { name: 'Pay $63.00' }));
    await waitFor(() => expect(handlers.onPayNow).toHaveBeenCalledExactlyOnceWith({ payment: visa }));
    expect(await within(card).findByText(copy.paid)).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it('says why a charge failed, until when the client can pay, and when it is tried again', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(yardVisitPaymentDuePoster, { onPayNow: vi.fn().mockResolvedValue({ ok: false, code: 'payment_declined' }) });
    const card = screen.getByRole('region', { name: copy.failedTitle });
    expect(within(card).getByText(copy.failure.payment_declined)).toBeInTheDocument();
    expect(within(card).getByText(`Pay by ${formatDateTime(YARD_VISIT_TIMES.payBy)} to keep this visit. Otherwise it's skipped, with no fees.`)).toBeInTheDocument();
    expect(within(card).getByText(`We'll try your card again on ${formatDateTime(YARD_VISIT_TIMES.retryAt)}.`)).toBeInTheDocument();
    // After a failure the form is open at once.
    await user.click(within(card).getByRole('button', { name: 'Pay $63.00' }));
    await waitFor(() => expect(handlers.onPayNow).toHaveBeenCalledOnce());
    expect(await within(card).findByRole('status')).toHaveTextContent(/declined/i);
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('runs the bank step and finishes the payment', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(yardVisitPaymentDuePoster, {
      onPayNow: vi.fn().mockResolvedValue({ ok: false, code: 'requires_bank_verification', verification: { paymentId: 'pay_visit', kind: 'dev' } }),
    });
    await user.click(screen.getByRole('button', { name: 'Pay $63.00' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: messages.payments.verification.approve }));
    await waitFor(() => expect(handlers.onFinishPayVerification).toHaveBeenCalledExactlyOnceWith({ paymentId: 'pay_visit', outcome: 'approved' }));
    expect(await screen.findByText(copy.paid)).toBeInTheDocument();
  });

  it('says a one-time booking would be canceled, and a missing card plainly', () => {
    mount(yardVisitNoCardPoster);
    expect(screen.getByText(copy.failure.no_card)).toBeInTheDocument();
    cleanup();
    mount({ ...deskBookingPosterScheduled, scheduledPayment: { ...deskBookingPosterScheduled.scheduledPayment!, failure: 'insufficient_funds' } });
    expect(screen.getByText(copy.failure.insufficient_funds)).toBeInTheDocument();
    expect(screen.getByText(/to keep this booking\. Otherwise it's canceled, with no fees\./)).toBeInTheDocument();
  });

  it('shows the helper when the client pays, never a payment form', () => {
    mount(yardVisitScheduledHelper);
    expect(screen.getByText(`Maya R.'s card is charged on ${formatDateTime(YARD_VISIT_TIMES.chargeAt)}. You'll see the address once it's paid.`)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    cleanup();
    mount(yardVisitPaymentDueHelper);
    expect(screen.getByText(`Waiting for Maya R. to pay, by ${formatDateTime(YARD_VISIT_TIMES.payBy)}. If it isn't paid by then, this visit is skipped.`)).toBeInTheDocument();
  });

  it('only says when it is charged without handlers', () => {
    mount(yardVisitScheduledPoster, {}, false);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
