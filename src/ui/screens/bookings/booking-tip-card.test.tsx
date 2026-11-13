/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingTipHandlers, BookingView, PaymentAttemptResult } from '@/contracts';
import { deskBookingHelperCompleted, deskBookingHelperTipped, deskBookingPosterTipAvailable, deskBookingPosterTipped, deskTipAvailable } from '@/fixtures';
import { formatDate } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import { BookingTipCard } from './booking-tip-card';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const copy = messages.bookingHub.tipCard;
const paid: PaymentAttemptResult = { ok: true, code: 'paid' };
const visa = { kind: 'saved', methodId: 'pm_maya_visa' } as const;
const thanks = 'Thank you. Jordan T. gets all of your tip.';

function mount(data: BookingView = deskBookingPosterTipAvailable, overrides: Partial<BookingTipHandlers> = {}) {
  const handlers: BookingTipHandlers = {
    onTip: vi.fn().mockResolvedValue(paid),
    onFinishTipVerification: vi.fn().mockResolvedValue(paid),
    ...overrides,
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><BookingTipCard data={data} handlers={handlers} /></NextIntlClientProvider>) };
}

describe('BookingTipCard', () => {
  it('offers the supplied presets, then the card, with the amount on the button', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    const card = screen.getByRole('region', { name: 'Add a tip for Jordan T.' });
    expect(within(card).getByText(copy.until.replace('{date}', formatDate(deskTipAvailable.availableUntil)))).toBeInTheDocument();
    const amounts = within(card).getByRole('radiogroup', { name: copy.amount });
    expect(within(amounts).getAllByRole('radio').map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false']);
    expect(within(amounts).getByRole('radio', { name: '$6.00 10%' })).toBeInTheDocument();
    expect(within(amounts).getByRole('radio', { name: '$12.00 20%' })).toBeInTheDocument();
    // Nothing to pay until an amount is chosen.
    expect(within(card).queryByRole('button', { name: /Add a/ })).not.toBeInTheDocument();
    await user.click(within(amounts).getByRole('radio', { name: '$9.00 15%' }));
    expect(within(card).getByRole('radiogroup', { name: messages.payments.picker.label })).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Add a $9.00 tip' }));
    await waitFor(() => expect(handlers.onTip).toHaveBeenCalledExactlyOnceWith({ amountCents: 900, payment: visa }));
    expect(await screen.findByText(thanks)).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it('checks a custom amount against the range before sending', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(screen.getByRole('radio', { name: copy.custom }));
    const input = screen.getByRole('textbox', { name: copy.customLabel });
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAccessibleDescription('Between $1.00 and $200.00.');
    await user.type(input, '250');
    await user.click(screen.getByRole('button', { name: copy.sendAny }));
    expect(screen.getByText('Enter an amount between $1.00 and $200.00.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(handlers.onTip).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '12.50');
    await user.click(screen.getByRole('button', { name: 'Add a $12.50 tip' }));
    await waitFor(() => expect(handlers.onTip).toHaveBeenCalledExactlyOnceWith({ amountCents: 1250, payment: visa }));
  });

  it('keeps the amount after a declined card so the client can try another', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(undefined, { onTip: vi.fn().mockResolvedValue({ ok: false, code: 'payment_declined' }) });
    await user.click(screen.getByRole('radio', { name: '$12.00 20%' }));
    await user.click(screen.getByRole('button', { name: 'Add a $12.00 tip' }));
    await waitFor(() => expect(handlers.onTip).toHaveBeenCalledOnce());
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '$12.00 20%' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Add a $12.00 tip' })).toBeEnabled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("runs the bank step and finishes the tip with the bank's answer", async () => {
    const user = userEvent.setup();
    const { handlers } = mount(undefined, {
      onTip: vi.fn().mockResolvedValue({ ok: false, code: 'requires_bank_verification', verification: { paymentId: 'pay_tip', kind: 'dev' } }),
    });
    await user.click(screen.getByRole('radio', { name: '$9.00 15%' }));
    await user.click(screen.getByRole('button', { name: 'Add a $9.00 tip' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: messages.payments.verification.approve }));
    await waitFor(() => expect(handlers.onFinishTipVerification).toHaveBeenCalledExactlyOnceWith({ paymentId: 'pay_tip', outcome: 'approved' }));
    expect(await screen.findByText(thanks)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks to reload when a tip is no longer possible', async () => {
    const user = userEvent.setup();
    mount(undefined, { onTip: vi.fn().mockResolvedValue({ ok: false, code: 'not_allowed' }) });
    await user.click(screen.getByRole('radio', { name: '$6.00 10%' }));
    await user.click(screen.getByRole('button', { name: 'Add a $6.00 tip' }));
    expect(await screen.findByText(copy.changed)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: messages.bookingHub.reload }));
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("shows the tip once given, on the client's side and the helper's", () => {
    mount(deskBookingPosterTipped);
    const given = screen.getByRole('region', { name: copy.tippedTitle });
    expect(within(given).getByText('You tipped $9.00')).toBeInTheDocument();
    expect(within(given).getByText('Jordan T. got all of it.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    cleanup();
    mount(deskBookingHelperTipped);
    const received = screen.getByRole('region', { name: 'Tip from Maya R.' });
    expect(within(received).getByText('Tip: $9.00')).toBeInTheDocument();
    expect(within(received).getByText(copy.receivedBody)).toBeInTheDocument();
  });

  it('offers nothing to the helper, without handlers, or without a tip', () => {
    mount({ ...deskBookingHelperCompleted, tip: deskTipAvailable });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    cleanup();
    render(<NextIntlClientProvider locale="en" messages={messages}><BookingTipCard data={deskBookingPosterTipAvailable} /></NextIntlClientProvider>);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    cleanup();
    mount({ ...deskBookingPosterTipAvailable, tip: undefined });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
