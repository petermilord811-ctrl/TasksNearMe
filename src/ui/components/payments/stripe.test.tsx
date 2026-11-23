/** @vitest-environment jsdom */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ConfirmBookingInput, PaymentChoice, PaymentPanelData } from '@/contracts';
import messages from '../../../../messages/en/ui';
import { BankVerificationDialog } from './bank-verification-dialog';
import { getDefaultPaymentChoice, PaymentMethodPicker } from './payment-method-picker';

/** A fake Stripe.js: the card field's change events are ours to fire. */
const stripe = vi.hoisted(() => {
  const state: { change?: (event: { complete: boolean; empty: boolean; error?: { message?: string } }) => void } = {};
  const element = { mount: vi.fn(), unmount: vi.fn(), destroy: vi.fn(), focus: vi.fn(), update: vi.fn(), on: vi.fn((name: string, handler: never) => { if (name === 'change') state.change = handler; }) };
  const instance = {
    elements: () => ({ create: () => element }),
    createPaymentMethod: vi.fn(async () => ({ paymentMethod: { id: 'pm_card_visa' } })),
    handleNextAction: vi.fn(async () => ({ paymentIntent: { status: 'succeeded' } })),
  };
  return { state, element, instance };
});
vi.mock('./stripe-js', () => ({ loadStripe: vi.fn(async () => stripe.instance) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const panel: PaymentPanelData = { methods: [], newCard: { kind: 'stripe', publishableKey: 'pk_test_123' } };

function Picker({ onValue }: { onValue: (choice: PaymentChoice) => void }) {
  const [value, setValue] = useState<PaymentChoice>(getDefaultPaymentChoice(panel));
  const field = { name: 'payment' as const, value, onChange: (next: NonNullable<ConfirmBookingInput['payment']>) => { setValue(next); onValue(next); }, onBlur: () => {}, ref: () => {} };
  return <NextIntlClientProvider locale="en" messages={messages}><PaymentMethodPicker panel={panel} field={field as never} /></NextIntlClientProvider>;
}

describe('Stripe cards', () => {
  it('starts on Stripe’s card field, and pays with the PaymentMethod once the card is complete', async () => {
    const seen: PaymentChoice[] = [];
    render(<Picker onValue={(choice) => seen.push(choice)} />);
    expect(getDefaultPaymentChoice(panel)).toEqual({ kind: 'stripe_card', paymentMethodId: '', save: false });
    await waitFor(() => expect(stripe.element.mount).toHaveBeenCalled());
    expect(screen.getByText(messages.payments.picker.cardLabel)).toBeInTheDocument();
    expect(screen.getByText(messages.payments.picker.stripeHint)).toBeInTheDocument();

    await act(async () => stripe.state.change!({ complete: false, empty: false, error: { message: 'Your card number is incomplete.' } }));
    expect(screen.getByText('Your card number is incomplete.')).toBeInTheDocument();
    await act(async () => stripe.state.change!({ complete: true, empty: false }));
    await waitFor(() => expect(seen.at(-1)).toEqual({ kind: 'stripe_card', paymentMethodId: 'pm_card_visa', save: false }));

    // Saving keeps the card; editing it again clears it until it's complete.
    await userEvent.setup().click(screen.getByRole('checkbox', { name: messages.payments.picker.save }));
    expect(seen.at(-1)).toEqual({ kind: 'stripe_card', paymentMethodId: 'pm_card_visa', save: true });
    await act(async () => stripe.state.change!({ complete: false, empty: false }));
    expect(seen.at(-1)).toEqual({ kind: 'stripe_card', paymentMethodId: '', save: true });
  });

  it('drops an answer for a card that changed while it was being checked', async () => {
    const seen: PaymentChoice[] = [];
    let resolve: (value: { paymentMethod: { id: string } }) => void = () => {};
    stripe.instance.createPaymentMethod.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(<Picker onValue={(choice) => seen.push(choice)} />);
    await waitFor(() => expect(stripe.element.mount).toHaveBeenCalled());
    await act(async () => stripe.state.change!({ complete: true, empty: false }));
    await act(async () => stripe.state.change!({ complete: false, empty: false }));
    await act(async () => resolve({ paymentMethod: { id: 'pm_old' } }));
    expect(seen.some((choice) => choice.kind === 'stripe_card' && choice.paymentMethodId === 'pm_old')).toBe(false);
  });

  it('runs the bank’s own step with Stripe.js, then lets the server read the outcome', async () => {
    const onDone = vi.fn();
    render(<NextIntlClientProvider locale="en" messages={messages}><BankVerificationDialog verification={{ paymentId: 'pay_1', kind: 'stripe', clientSecret: 'pi_1_secret_x', publishableKey: 'pk_test_123' }} pending={false} onDone={onDone} /></NextIntlClientProvider>);
    expect(screen.getByText(messages.payments.verification.stripeDescription)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: messages.payments.verification.approve })).not.toBeInTheDocument();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('approved'));
    expect(stripe.instance.handleNextAction).toHaveBeenCalledWith({ clientSecret: 'pi_1_secret_x' });

    stripe.instance.handleNextAction.mockResolvedValueOnce({ error: { message: 'Authentication failed.' } } as never);
    const failed = vi.fn();
    cleanup();
    render(<NextIntlClientProvider locale="en" messages={messages}><BankVerificationDialog verification={{ paymentId: 'pay_2', kind: 'stripe', clientSecret: 'pi_2_secret_y', publishableKey: 'pk_test_123' }} pending={false} onDone={failed} /></NextIntlClientProvider>);
    await waitFor(() => expect(failed).toHaveBeenCalledWith('failed'));
  });
});
