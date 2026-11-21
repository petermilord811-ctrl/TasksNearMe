/** @vitest-environment jsdom */
import { useEffect, useRef, useState } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Controller, useForm } from 'react-hook-form';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_BRANDS, DEV_TEST_CARDS, type ActionResult, type CardRemovalHandlers, type ConfirmBookingInput, type PaymentPanelData } from '@/contracts';
import { mayaPaymentPanel, noSavedCardsPaymentPanel, unusableCardPaymentPanel } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import payments from '../../../../messages/en/ui/payments.json';
import { BankVerificationDialog, getDefaultPaymentChoice, PaymentMethodLabel, PaymentMethodPicker } from './index';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function PickerExample({ panel = mayaPaymentPanel, disabled = false, onSubmit = vi.fn(), onRemoveCard }: {
  panel?: PaymentPanelData;
  disabled?: boolean;
  onSubmit?: (input: ConfirmBookingInput) => void;
  onRemoveCard?: CardRemovalHandlers['onRemoveCard'];
}) {
  const form = useForm<ConfirmBookingInput>({ defaultValues: { offerRevision: 1, acceptTerms: false, payment: getDefaultPaymentChoice(panel) } });
  return <NextIntlClientProvider locale="en" messages={{ ...uiMessages, payments }}>
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Controller control={form.control} name="payment" render={({ field }) => <PaymentMethodPicker panel={panel} field={field} disabled={disabled} onRemoveCard={onRemoveCard} />} />
      <button type="submit">Submit test form</button>
    </form>
  </NextIntlClientProvider>;
}

describe('Payment methods', () => {
  it('has copy for every card brand, wallet, and test outcome', () => {
    for (const brand of [...CARD_BRANDS, 'apple_pay', 'google_pay'] as const) expect(payments.brands[brand]).toBeTruthy();
    for (const card of DEV_TEST_CARDS) expect(payments.testCards[card]).toBeTruthy();
    render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, payments }}>
      <PaymentMethodLabel method={{ brand: 'visa', last4: '1881' }} />
      <PaymentMethodLabel method={{ brand: 'mastercard', last4: '4444' }} />
      <PaymentMethodLabel method={{ brand: 'apple_pay' }} />
      <PaymentMethodLabel method={{ brand: 'google_pay' }} />
    </NextIntlClientProvider>);
    expect(screen.getByText('Visa •••• 1881')).toBeInTheDocument();
    expect(screen.getByText('Mastercard •••• 4444')).toBeInTheDocument();
    expect(screen.getByText('Apple Pay')).toBeInTheDocument();
    expect(screen.getByText('Google Pay')).toBeInTheDocument();
  });

  it('selects the supplied default and formats expiry without exposing card entry fields', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PickerExample onSubmit={onSubmit} />);
    expect(screen.getByRole('radio', { name: /Visa.*1881.*Expires 08\/28.*Default/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Mastercard.*4444.*Expires 03\/27/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Mastercard/ }));
    await user.click(screen.getByRole('button', { name: 'Submit test form' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ payment: { kind: 'saved', methodId: 'pm_maya_mc' } }), expect.anything());
  });

  it('selects new cards when none are saved and submits the chosen outcome and save setting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PickerExample panel={noSavedCardsPaymentPanel} onSubmit={onSubmit} />);
    expect(screen.getByRole('radio', { name: 'Use a new card' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Test card (development): no real charge')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Approved' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'Bank verification' }));
    await user.click(screen.getByRole('checkbox', { name: 'Save this card for next time' }));
    await user.click(screen.getByRole('button', { name: 'Submit test form' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ payment: { kind: 'dev_card', card: 'requires_verification', save: true } }), expect.anything());
  });

  it('keeps the new card choice when switching to a saved card and back', async () => {
    const user = userEvent.setup();
    render(<PickerExample />);
    await user.click(screen.getByRole('radio', { name: 'Use a new card' }));
    await user.click(screen.getByRole('radio', { name: 'Declined' }));
    await user.click(screen.getByRole('checkbox', { name: 'Save this card for next time' }));
    await user.click(screen.getByRole('radio', { name: /Mastercard/ }));
    await user.click(screen.getByRole('radio', { name: 'Use a new card' }));
    expect(screen.getByRole('radio', { name: 'Declined' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: 'Save this card for next time' })).toBeChecked();
  });

  it('locks every choice while disabled', () => {
    render(<PickerExample panel={noSavedCardsPaymentPanel} disabled />);
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('uses the default flag even when it is not first, and the first saved card when no default exists', () => {
    expect(getDefaultPaymentChoice({ ...mayaPaymentPanel, methods: [...mayaPaymentPanel.methods].reverse() })).toEqual({ kind: 'saved', methodId: 'pm_maya_visa' });
    expect(getDefaultPaymentChoice({ ...mayaPaymentPanel, methods: mayaPaymentPanel.methods.map((method) => ({ ...method, isDefault: false })) })).toEqual({ kind: 'saved', methodId: 'pm_maya_visa' });
  });
});

describe('A saved card that can\'t be used here (abuse rehearsal J-AB4)', () => {
  const why = "This card can't be used here. Contact support if you think that's wrong.";

  it('shows it disabled with the neutral line, never chooses it, and keeps "Use a new card"', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PickerExample panel={unusableCardPaymentPanel} onSubmit={onSubmit} onRemoveCard={async () => ({ ok: true, code: 'updated' })} />);
    const refused = screen.getByRole('radio', { name: 'Visa •••• 1881' });
    expect(refused).toBeDisabled();
    expect(refused).toHaveAttribute('aria-checked', 'false');
    expect(refused).toHaveAccessibleDescription(why);
    // Maya's default is the refused Visa: the Mastercard is chosen instead.
    expect(screen.getByRole('radio', { name: /Mastercard/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Use a new card' })).toBeEnabled();
    // Pressing the refused card changes nothing.
    await user.click(screen.getByText('Visa •••• 1881'));
    await user.click(screen.getByText(why));
    await user.click(screen.getByRole('button', { name: 'Submit test form' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ payment: { kind: 'saved', methodId: 'pm_maya_mc' } }), expect.anything());
  });

  it('removes it only when asked, then moves focus to the chosen card', async () => {
    const user = userEvent.setup();
    const asked: { methodId: string }[] = [];
    render(<PickerExample panel={unusableCardPaymentPanel} onRemoveCard={async (input) => { asked.push(input); return { ok: true, code: 'updated' }; }} />);
    expect(asked).toEqual([]);
    const remove = screen.getByRole('button', { name: 'Remove' });
    expect(remove).toHaveAccessibleDescription('Visa •••• 1881');
    await user.click(remove);
    expect(asked).toEqual([{ methodId: 'pm_maya_visa' }]);
    await waitFor(() => expect(screen.queryByText('Visa •••• 1881')).not.toBeInTheDocument());
    expect(screen.queryByText(why)).not.toBeInTheDocument();
    expect(screen.getByText('Card removed.')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('radio', { name: /Mastercard/ })).toHaveFocus();
  });

  it('keeps the card and says why when it can\'t be removed yet, and counts one already gone as removed', async () => {
    const user = userEvent.setup();
    let answer: ActionResult = { ok: false, code: 'not_allowed' };
    render(<PickerExample panel={unusableCardPaymentPanel} onRemoveCard={async () => answer} />);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const busy = 'This card pays for a booking in progress. Try again after the booking is finished.';
    expect(await screen.findByText(busy, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(busy, { selector: 'p' })).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('radio', { name: 'Visa •••• 1881' })).toBeDisabled();
    answer = { ok: false, code: 'not_found' };
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByText('Visa •••• 1881')).not.toBeInTheDocument());
  });

  it('has no Remove button when the form has no remove action', () => {
    render(<PickerExample panel={unusableCardPaymentPanel} />);
    expect(screen.getByRole('radio', { name: 'Visa •••• 1881' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('falls back to a new card when no saved card can be used', () => {
    const allRefused = { ...unusableCardPaymentPanel, methods: unusableCardPaymentPanel.methods.map((method) => ({ ...method, unusable: true as const })) };
    expect(getDefaultPaymentChoice(allRefused)).toEqual({ kind: 'dev_card', card: 'success', save: false });
  });
});

function renderBank(onDone = vi.fn(), pending = false) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, payments }}>
    <BankVerificationDialog verification={{ kind: 'dev', paymentId: 'pay_desk_2' }} onDone={onDone} pending={pending} />
  </NextIntlClientProvider>);
}

function LaunchedBank({ focusFeedback = false }: { focusFeedback?: boolean }) {
  const [open, setOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (finished && focusFeedback) feedback.current?.focus(); }, [finished, focusFeedback]);
  return <NextIntlClientProvider locale="en" messages={{ ...uiMessages, payments }}>
    <button type="button" onClick={() => setOpen(true)}>Open bank verification</button>
    <p ref={feedback} tabIndex={-1}>Payment result</p>
    {open && <BankVerificationDialog verification={{ kind: 'dev', paymentId: 'pay_desk_2' }} pending={false} onDone={() => { setOpen(false); setFinished(true); }} />}
  </NextIntlClientProvider>;
}

describe('Bank verification', () => {
  it('returns focus to the opener when the dialog closes without a DialogTrigger', async () => {
    const user = userEvent.setup();
    render(<LaunchedBank />);
    const opener = screen.getByRole('button', { name: 'Open bank verification' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Fail' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('preserves focus when the parent has already focused payment feedback', async () => {
    const user = userEvent.setup();
    render(<LaunchedBank focusFeedback />);
    await user.click(screen.getByRole('button', { name: 'Open bank verification' }));
    await user.click(screen.getByRole('button', { name: 'Fail' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    await waitFor(() => expect(screen.getByText('Payment result')).toHaveFocus());
  });

  it('traps keyboard focus and treats Escape as failed verification', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderBank(onDone);
    const dialog = screen.getByRole('dialog', { name: payments.verification.title });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toHaveFocus());
    await user.tab();
    expect(screen.getByRole('button', { name: 'Fail' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveFocus();
    expect(dialog).toHaveTextContent('development stand-in');
    await user.keyboard('{Escape}');
    expect(onDone).toHaveBeenCalledExactlyOnceWith('failed');
  });

  it.each([['Approve', 'approved'], ['Fail', 'failed']] as const)('returns %s as %s', async (label, outcome) => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderBank(onDone);
    await user.click(screen.getByRole('button', { name: label }));
    expect(onDone).toHaveBeenCalledExactlyOnceWith(outcome);
  });

  it('locks both decisions and ignores Escape while a verification request runs', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderBank(onDone, true);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fail' })).toBeDisabled();
    expect(screen.getByText('Verifying…')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onDone).not.toHaveBeenCalled();
  });
});
