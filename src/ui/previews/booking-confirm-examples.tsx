'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import type { ActionResult, ConfirmBookingInput, PaymentPanelData } from '@/contracts';
import { deskConfirmData, fakeHandler } from '@/fixtures';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { BankVerificationDialog, getDefaultPaymentChoice, PaymentMethodPicker } from '@/ui/components/payments';
import { Button } from '@/ui/primitives/button';

export function PaymentMethodPickerPreview({ panel }: { panel: PaymentPanelData }) {
  const form = useForm<ConfirmBookingInput>({ defaultValues: {
    offerRevision: deskConfirmData.offer.revision,
    payment: getDefaultPaymentChoice(panel),
    acceptTerms: false,
  } });

  return <div className="mx-auto max-w-reading rounded-xl border bg-card p-card shadow-card">
    <Controller name="payment" control={form.control} render={({ field }) => <PaymentMethodPicker panel={panel} field={field} />} />
  </div>;
}

export function BankVerificationDialogPreview() {
  const t = useTranslations('bookingConfirm');
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult>();

  async function finish(outcome: 'approved' | 'failed') {
    if (pending) return;
    setPending(true);
    setResult(await fakeHandler(outcome === 'approved' ? { ok: true, code: 'booked' } : { ok: false, code: 'payment_declined' })(undefined));
    setPending(false);
    setOpen(false);
  }

  return <div className="mx-auto max-w-reading space-y-4">
    <Button onClick={() => { setResult(undefined); setOpen(true); }}>{t('previews.bank-dialog')}</Button>
    <FormFeedback result={result} />
    {open && <BankVerificationDialog verification={{ kind: 'dev', paymentId: 'pay_desk_2' }} onDone={finish} pending={pending} />}
  </div>;
}
