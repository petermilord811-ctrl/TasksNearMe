'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { routes, WAITLIST_INTERESTS, waitlistInputSchema, type WaitlistHandlers, type WaitlistInput, type WaitlistPageData } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/ui/primitives/field';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { Spinner } from '@/ui/primitives/spinner';

export interface WaitlistScreenProps {
  data: WaitlistPageData;
  handlers: WaitlistHandlers;
}

export function WaitlistConfirmation({ email, zip }: Pick<WaitlistInput, 'email' | 'zip'>) {
  const t = useTranslations('waitlist');
  return <div className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
    <CheckCircle2 aria-hidden="true" className="size-8 text-success" />
    <h2 className="font-display text-xl font-semibold leading-7 tracking-[-0.015em] lg:text-[22px] lg:leading-[30px]">{t('joinedTitle')}</h2>
    <p className="break-words text-muted-foreground">{t('joinedDescription', { email, zip })}</p>
  </div>;
}

export function WaitlistScreen({ data, handlers }: WaitlistScreenProps) {
  const t = useTranslations('waitlist');
  const forms = useTranslations('forms');
  const id = useId();
  const confirmationRef = useRef<HTMLDivElement>(null);
  const [joined, setJoined] = useState<WaitlistInput>();
  const form = useForm<WaitlistInput>({
    resolver: zodResolver(waitlistInputSchema),
    defaultValues: { email: '', zip: '' },
  });
  const action = useFormAction(form);
  const pending = action.pending || form.formState.isSubmitting;

  useEffect(() => {
    if (joined) confirmationRef.current?.focus();
  }, [joined]);

  return <section aria-labelledby={`${id}-title`} className="mx-auto max-w-reading space-y-6 py-4 sm:py-8">
    <header className="space-y-3">
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary size-12"><MapPin className="size-6" /></span>
      <h1 id={`${id}-title`} className="font-display text-2xl font-semibold leading-8 tracking-[-0.025em] lg:text-3xl lg:leading-[38px]">{t('title')}</h1>
      <p className="text-muted-foreground">{t('description')}</p>
    </header>

    <div aria-live="polite" aria-atomic="true" ref={confirmationRef} tabIndex={joined ? -1 : undefined} className={joined ? undefined : 'sr-only'}>
      {joined && <WaitlistConfirmation email={joined.email} zip={joined.zip} />}
    </div>

    {!joined && <form noValidate aria-busy={pending} className="space-y-6 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]" onSubmit={form.handleSubmit(async (values) => {
      const result = await action.run(handlers.onJoin, values);
      if (result?.ok && result.code === 'submitted') setJoined(values);
    })}>
      <FieldGroup>
        <TextFormField control={form.control} name="email" label={forms('fields.email.label')} hint={forms('fields.email.hint')} type="email" autoComplete="email" required disabled={pending} />
        <TextFormField control={form.control} name="zip" label={forms('fields.zip.label')} hint={forms('fields.zip.hint')} autoComplete="postal-code" inputMode="numeric" maxLength={5} required disabled={pending} />
        <Controller control={form.control} name="interest" render={({ field, fieldState }) => <FieldSet data-invalid={fieldState.invalid} className="gap-3">
          <FieldLegend id={`${id}-interest-label`} className="mb-0">{forms('fields.interest.label')}</FieldLegend>
          <FieldDescription id={`${id}-interest-hint`}>{forms('fields.interest.hint')}</FieldDescription>
          <RadioGroup
            name={field.name}
            value={field.value ?? ''}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            disabled={pending}
            required
            aria-labelledby={`${id}-interest-label`}
            aria-describedby={`${id}-interest-hint${fieldState.error ? ` ${id}-interest-error` : ''}`}
            aria-invalid={fieldState.invalid}
            className="gap-2"
          >
            {WAITLIST_INTERESTS.map((interest, index) => <Field key={interest} orientation="horizontal" className="gap-3 rounded-2xl border border-foreground/[0.1] px-3 transition-[background-color,border-color] duration-200 hover:border-foreground/25 has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-brand-soft dark:border-white/[0.1]">
              <RadioGroupItem id={`${id}-${interest}`} value={interest} ref={index === 0 ? field.ref : undefined} />
              <FieldLabel htmlFor={`${id}-${interest}`} className="min-h-11 flex-1 py-3 text-base font-normal">{t(`interests.${interest}`)}</FieldLabel>
            </Field>)}
          </RadioGroup>
          {fieldState.error && <FieldError id={`${id}-interest-error`} role="status" aria-live="polite">{forms(`fieldErrors.${fieldState.error.message ?? 'required'}`)}</FieldError>}
        </FieldSet>} />
      </FieldGroup>
      <FormFeedback result={action.result} />
      <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
        {pending && <Spinner aria-hidden="true" />}
        {t('join')}
      </Button>
    </form>}

    {data.markets.length > 0 && <section aria-labelledby={`${id}-markets`} className="space-y-2 rounded-[1.375rem] bg-secondary p-4 text-secondary-foreground sm:p-6">
      <h2 id={`${id}-markets`} className="text-[17px] font-semibold leading-6 lg:text-lg">{t('marketsTitle')}</h2>
      <ul>
        {data.markets.map((market) => <li key={market.slug}><Link href={routes.market(market.slug)} className="inline-flex min-h-11 items-center py-2 underline underline-offset-4">{t('marketLink', { market: market.name })}</Link></li>)}
      </ul>
    </section>}
  </section>;
}
