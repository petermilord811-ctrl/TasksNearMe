'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { counterInviteInputSchema, type ActionResult, type CounterInviteInput, type InviteView } from '@/contracts';
import { marketClockTime, marketDayKey, marketLocalToUtc } from '@/shared/format';
import { MoneyInput } from '@/ui/components/forms/money-input';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export function CounterInviteForm({ invite, headingLevel, pending, result, onSubmit, onClose }: {
  invite: InviteView;
  headingLevel: 3 | 4;
  pending: boolean;
  result?: ActionResult;
  onSubmit: (input: CounterInviteInput) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations('inviteCard.counter');
  const errors = useTranslations('forms.fieldErrors');
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const Heading = headingLevel === 4 ? 'h4' : 'h3';
  const form = useForm<CounterInviteInput>({ resolver: zodResolver(counterInviteInputSchema), defaultValues: { message: '' } });
  const { register, control, setValue, setError, setFocus, getFieldState, formState } = form;
  const pricing = useWatch({ control, name: 'pricing' });
  const start = useWatch({ control, name: 'start' });

  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (!result || result.ok || pending) return;
    const names: FieldPath<CounterInviteInput>[] = ['pricing', 'pricing.priceCents', 'pricing.rateCents', 'pricing.estimatedHours', 'pricing.hoursCap', 'start', 'message'];
    let first: FieldPath<CounterInviteInput> | undefined;
    for (const name of names) {
      const code = result.fieldErrors?.[name]?.[0] ?? result.fieldErrors?.[`counter.${name}`]?.[0];
      if (code) { setError(name, { type: 'server', message: code }); first ??= name; }
    }
    if (first) { const target = first; const timer = setTimeout(() => setFocus(target), 0); return () => clearTimeout(timer); }
  }, [result, pending, setError, setFocus]);

  function field(name: FieldPath<CounterInviteInput>, label: string, hint: string, renderInput: (fieldId: string, invalid: boolean) => ReactNode) {
    const fieldId = `${id}-${name.replaceAll('.', '-')}`;
    const error = getFieldState(name, formState).error;
    return <Field data-invalid={Boolean(error)} className="gap-2">
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      {renderInput(fieldId, Boolean(error))}
      <FieldDescription id={`${fieldId}-hint`}>{hint}</FieldDescription>
      <div id={`${fieldId}-error`} aria-live="polite">{error?.message && <FieldError>{errors.has(error.message) ? errors(error.message) : errors('invalid')}</FieldError>}</div>
    </Field>;
  }

  return <form noValidate onSubmit={(event) => { void form.handleSubmit(onSubmit)(event); }} aria-busy={pending} aria-labelledby={`${id}-title`} className="space-y-4 rounded-2xl border border-foreground/[0.08] bg-background/70 p-4 dark:border-white/[0.08]">
    <Heading id={`${id}-title`} ref={heading} tabIndex={-1} className="rounded-sm font-heading text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t('title')}</Heading>
    <p className="text-sm text-muted-foreground">{t('intro')}</p>
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      <legend className="sr-only">{t('title')}</legend>
      <Controller control={control} name="pricing" render={({ field: value }) => <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-input bg-card px-3.5 py-2 text-sm font-medium transition-[background-color,border-color] duration-200 ease-[var(--ease-out)] hover:border-foreground/40 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06]">
        <input ref={value.ref} type="checkbox" checked={pricing !== undefined} aria-invalid={Boolean(formState.errors.pricing)} aria-describedby={`${id}-change-error`} className="size-5 shrink-0 accent-primary" onBlur={value.onBlur} onChange={(event) => { setValue('pricing', event.target.checked ? invite.terms.pricing : undefined, { shouldDirty: true }); form.clearErrors('pricing'); }} />
        {t('changePrice')}
      </label>} />
      {pricing && <div className="space-y-4">
        {field(pricing.type === 'fixed' ? 'pricing.priceCents' : 'pricing.rateCents', t(pricing.type === 'fixed' ? 'price' : 'rate'), t(pricing.type === 'fixed' ? 'priceHint' : 'rateHint'), (fieldId, invalid) => <Controller name={pricing.type === 'fixed' ? 'pricing.priceCents' : 'pricing.rateCents'} control={control} render={({ field: value }) => <MoneyInput name={value.name} ref={value.ref} value={value.value ?? -1} onValueChange={value.onChange} onBlur={value.onBlur} id={fieldId} aria-invalid={invalid} aria-describedby={`${fieldId}-hint ${fieldId}-error`} />} />)}
        {pricing.type === 'hourly' && <div className="grid gap-4 sm:grid-cols-2">{(['estimatedHours', 'hoursCap'] as const).map((name) => <div key={name}>{field(`pricing.${name}`, t(name), t(`${name}Hint`), (fieldId, invalid) => <Input {...register(`pricing.${name}`, { setValueAs: (value: string) => value === '' ? -1 : Number(value) })} id={fieldId} type="number" min={0} step="any" inputMode="decimal" aria-invalid={invalid} aria-describedby={`${fieldId}-hint ${fieldId}-error`} />)}</div>)}</div>}
      </div>}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-input bg-card px-3.5 py-2 text-sm font-medium transition-[background-color,border-color] duration-200 ease-[var(--ease-out)] hover:border-foreground/40 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06]">
        <input type="checkbox" checked={start !== undefined} className="size-5 shrink-0 accent-primary" onChange={(event) => { setValue('start', event.target.checked ? invite.terms.start : undefined, { shouldDirty: true }); form.clearErrors('start'); form.clearErrors('pricing'); }} />
        {t('changeStart')}
      </label>
      {start !== undefined && field('start', t('start'), t('startHint'), (fieldId, invalid) => <Controller name="start" control={control} render={({ field: value }) => <Input name={value.name} ref={value.ref} onBlur={value.onBlur} id={fieldId} type="datetime-local" defaultValue={`${marketDayKey(invite.terms.start)}T${marketClockTime(invite.terms.start)}`} aria-invalid={invalid} aria-describedby={`${fieldId}-hint ${fieldId}-error`} onChange={(event) => {
        const [date, time] = event.target.value.split('T');
        try { value.onChange(date && time ? marketLocalToUtc(date, time) : ''); } catch { value.onChange(''); }
      }} />} />)}
      <div id={`${id}-change-error`} aria-live="polite">{formState.errors.pricing?.message && <FieldError>{pricing === undefined && start === undefined ? t('changeRequired') : errors.has(formState.errors.pricing.message) ? errors(formState.errors.pricing.message) : errors('invalid')}</FieldError>}</div>
      {field('message', t('message'), t('messageHint'), (fieldId, invalid) => <Textarea {...register('message')} id={fieldId} rows={4} maxLength={1000} aria-invalid={invalid} aria-describedby={`${fieldId}-hint ${fieldId}-error`} />)}
    </fieldset>
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'sending' : 'send')}</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t('close')}</Button>
    </div>
  </form>;
}
