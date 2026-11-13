'use client';

import { useId } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addCardInputSchema, type ActionResult, type AddCardInput, type NewCardCollection, type PaymentMethodHandlers } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { StripeCardField } from '@/ui/components/payments/stripe-card-field';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { Checkbox } from '@/ui/primitives/checkbox';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { Spinner } from '@/ui/primitives/spinner';

export function AddCardForm({ collection, onAddCard, initialResult, initialPending = false }: {
  collection: NewCardCollection;
  onAddCard: PaymentMethodHandlers['onAddCard'];
  initialResult?: ActionResult;
  initialPending?: boolean;
}) {
  const t = useTranslations('paymentsPage');
  const payments = useTranslations('payments');
  const fields = useTranslations('forms.fieldErrors');
  const id = useId();
  const router = useRouter();
  const form = useForm<AddCardInput>({ resolver: zodResolver(addCardInputSchema), defaultValues: collection.kind === 'stripe' ? { paymentMethodId: '', makeDefault: false } : { card: collection.testCards[0], makeDefault: false } });
  const { result, pending, run } = useFormAction(form, {
    initialResult,
    onResult: (next) => { if (next.ok) router.refresh(); },
  });
  const busy = initialPending || pending;
  // The summary remains visible even if a server returns an unfamiliar field name.
  const feedback = result && !result.ok ? { ...result, fieldErrors: undefined } : result;
  return <form aria-label={t('addTitle')} aria-busy={busy} noValidate className="space-y-4" onSubmit={(event) => {
    if (busy) { event.preventDefault(); return; }
    void form.handleSubmit((input) => run(onAddCard, input))(event);
  }}>
    <div className={collection.kind === 'stripe' ? 'space-y-4 rounded-lg border bg-muted/30 p-4' : 'space-y-4 rounded-lg border border-dashed bg-muted/40 p-4'}>
      {collection.kind === 'stripe' ? <Controller control={form.control} name="paymentMethodId" render={({ field, fieldState }) => <div className="space-y-2">
        <StripeCardField publishableKey={collection.publishableKey} disabled={busy} describedBy={`${id}-hint${fieldState.error ? ` ${id}-pm-error` : ''}`} onChange={(paymentMethodId) => { form.clearErrors('paymentMethodId'); field.onChange(paymentMethodId); }} />
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">{payments('picker.stripeHint')}</p>
        <div id={`${id}-pm-error`} aria-live="polite">{fieldState.error && <p className="text-sm text-destructive">{fields.has(fieldState.error.message ?? 'invalid') ? fields(fieldState.error.message ?? 'invalid') : fields('invalid')}</p>}</div>
      </div>} /> : <>
      <div><p id={`${id}-dev`} className="font-medium">{t('development')}</p><p id={`${id}-hint`} className="mt-1 text-sm text-muted-foreground">{t('developmentHint')}</p></div>
      <Controller control={form.control} name="card" render={({ field, fieldState }) => <div>
        <RadioGroup id={`${id}-card`} name={field.name} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} disabled={busy} aria-label={payments('picker.outcome')} aria-describedby={`${id}-dev ${id}-hint${fieldState.error ? ` ${id}-card-error` : ''}`} aria-invalid={!!fieldState.error} className="gap-1 sm:grid-cols-2">
          {(collection.kind === 'dev' ? collection.testCards : []).map((card, index) => <label key={card} htmlFor={`${id}-${card}`} className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
            <RadioGroupItem id={`${id}-${card}`} value={card} ref={card === field.value || (!field.value && index === 0) ? field.ref : undefined} />
            <span className="text-sm">{payments(`testCards.${card}`)}</span>
          </label>)}
        </RadioGroup>
        <div id={`${id}-card-error`} aria-live="polite">{fieldState.error && <p className="text-sm text-destructive">{fields.has(fieldState.error.message ?? 'invalid') ? fields(fieldState.error.message ?? 'invalid') : fields('invalid')}</p>}</div>
      </div>} />
      </>}
      <Controller control={form.control} name="makeDefault" render={({ field, fieldState }) => <div>
        <label htmlFor={`${id}-default`} className="flex min-h-11 cursor-pointer items-center gap-3">
          <Checkbox id={`${id}-default`} ref={field.ref} name={field.name} checked={field.value} onCheckedChange={(value) => field.onChange(value === true)} onBlur={field.onBlur} disabled={busy} aria-invalid={!!fieldState.error} aria-describedby={`${id}-hint${fieldState.error ? ` ${id}-default-error` : ''}`} />
          <span className="text-sm">{t('makeThisDefault')}</span>
        </label>
        <div id={`${id}-default-error`} aria-live="polite">{fieldState.error && <p className="text-sm text-destructive">{fields.has(fieldState.error.message ?? 'invalid') ? fields(fieldState.error.message ?? 'invalid') : fields('invalid')}</p>}</div>
      </div>} />
    </div>
    <FormFeedback result={feedback} successMessage={t('saved')} errorMessage={result && !result.ok && result.code === 'payment_declined' ? t('declined') : undefined} />
    <Button type="submit" disabled={busy} aria-busy={busy}>{busy && <Spinner aria-hidden="true" />}{t(busy ? 'adding' : 'add')}</Button>
  </form>;
}
