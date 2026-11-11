'use client';

import { useId, type ReactNode } from 'react';
import { Controller, useFormContext, type FieldPath } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { InvitableTask, PricingInput, RequestHelperInput, RequestHelperPageData } from '@/contracts';
import { formatDateTime, marketClockTime, marketDayKey, marketLocalToUtc } from '@/shared/format';
import { MoneyInput } from '@/ui/components/forms/money-input';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { Textarea } from '@/ui/primitives/textarea';
import { cn } from '@/ui/lib/utils';

export function suggestedPricing(data: RequestHelperPageData, task: InvitableTask): PricingInput {
  return data.suggestion && (!data.suggestion.taskId || data.suggestion.taskId === task.id)
    ? data.suggestion.pricing : data.listedPricing[task.categorySlug] ?? { type: 'fixed', priceCents: 0 };
}

function localStart(value: string) {
  return value && Number.isFinite(new Date(value).getTime()) ? `${marketDayKey(value)}T${marketClockTime(value)}` : '';
}

function RequestField({ name, label, hint, children }: { name: FieldPath<RequestHelperInput>; label: string; hint: string; children: (id: string, invalid: boolean) => ReactNode }) {
  const id = useId();
  const { getFieldState, formState } = useFormContext<RequestHelperInput>();
  const { error } = getFieldState(name, formState);
  const t = useTranslations('forms.fieldErrors');
  return <Field data-invalid={!!error} className="gap-2">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    {children(id, !!error)}
    <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
    <div id={`${id}-error`} aria-live="polite">{error?.message && <FieldError>{t(t.has(error.message) ? error.message : 'invalid')}</FieldError>}</div>
  </Field>;
}

export function RequestHelperFields({ data, disabled }: { data: RequestHelperPageData; disabled: boolean }) {
  const t = useTranslations('invites');
  const categories = useTranslations('helperCard.categories');
  const { control, register, watch, setValue, clearErrors } = useFormContext<RequestHelperInput>();
  const taskId = watch('taskId');
  const pricing = watch('pricing');
  const selected = data.tasks.find((task) => task.id === taskId);
  const priceName = pricing.type === 'fixed' ? 'pricing.priceCents' : 'pricing.rateCents';
  return <div className="space-y-6">
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <h2 className="font-heading text-xl/7 font-semibold">{t('task')}</h2>
      <RequestField name="taskId" label={t('task')} hint={t('taskHint', { helper: data.helper.displayName })}>{(id, invalid) => <Controller name="taskId" control={control} render={({ field }) => <RadioGroup id={id} name={field.name} value={field.value} onBlur={field.onBlur} disabled={disabled} aria-label={t('task')} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} onValueChange={(value) => {
        const task = data.tasks.find((candidate) => candidate.id === value);
        if (!task) return;
        field.onChange(value); setValue('start', task.windowStart); setValue('pricing', suggestedPricing(data, task)); setValue('acceptTerms', false); clearErrors();
      }}>
        {data.tasks.map((task, index) => <label key={task.id} htmlFor={`${id}-${index}`} className={cn('flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border p-4', task.id === field.value && 'border-primary bg-secondary/40', disabled && 'cursor-not-allowed opacity-60')}>
          <RadioGroupItem ref={task.id === field.value ? field.ref : undefined} id={`${id}-${index}`} value={task.id} className="mt-1 shrink-0 scroll-mb-40" />
          <span className="min-w-0 space-y-1">
            <span className="block font-medium break-words">{task.title}</span>
            <span className="block text-sm text-muted-foreground">{categories(task.categorySlug)}</span>
            <span className="block text-sm tabular-nums text-muted-foreground">{t('window', { start: formatDateTime(task.windowStart), end: formatDateTime(task.windowEnd) })}</span>
          </span>
        </label>)}
      </RadioGroup>} />}</RequestField>
    </section>
    <section className="space-y-5 rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <h2 className="font-heading text-xl/7 font-semibold">{t('details')}</h2>
      <RequestField name="start" label={t('start')} hint={t('startHint')}>{(id, invalid) => <Controller name="start" control={control} render={({ field }) => <Input id={id} name={field.name} ref={field.ref} onBlur={field.onBlur} type="datetime-local" value={localStart(field.value)} min={selected ? localStart(selected.windowStart) : undefined} max={selected ? localStart(selected.windowEnd) : undefined} step={60} onChange={(event) => {
        const [date, time] = event.target.value.split('T');
        field.onChange(date && time ? marketLocalToUtc(date, time) : '');
      }} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="max-w-sm scroll-mb-40 tabular-nums" />} />}</RequestField>
      <RequestField name="pricing.type" label={t('pricingType')} hint={t('pricingTypeHint')}>{(id, invalid) => <Controller control={control} name="pricing.type" render={({ field }) => <select id={id} name={field.name} ref={field.ref} value={field.value} onBlur={field.onBlur} onChange={(event) => {
        setValue('pricing', event.target.value === 'hourly' ? { type: 'hourly', rateCents: 0, estimatedHours: 1, hoursCap: 1 } : { type: 'fixed', priceCents: 0 }); clearErrors('pricing');
      }} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="min-h-11 w-full max-w-sm scroll-mb-40 rounded-[10px] border border-input bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <option value="fixed">{t('fixed')}</option><option value="hourly">{t('hourly')}</option>
      </select>} />}</RequestField>
      <RequestField name={priceName} label={t(pricing.type === 'fixed' ? 'price' : 'rate')} hint={t(pricing.type === 'fixed' ? 'priceHint' : 'rateHint')}>{(id, invalid) => <Controller key={priceName} control={control} name={priceName} render={({ field }) => <MoneyInput id={id} name={field.name} ref={field.ref} onBlur={field.onBlur} value={field.value} onValueChange={field.onChange} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="max-w-sm scroll-mb-40" />} />}</RequestField>
      {pricing.type === 'hourly' && <div className="grid gap-5 sm:grid-cols-2">{(['estimatedHours', 'hoursCap'] as const).map((key) => <RequestField key={key} name={`pricing.${key}`} label={t(key)} hint={t(`${key}Hint`)}>{(id, invalid) => <Input {...register(`pricing.${key}`, { setValueAs: (value: string) => value === '' ? -1 : Number(value) })} id={id} type="number" inputMode="decimal" min={0} max={key === 'hoursCap' ? 24 : undefined} step="any" aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="scroll-mb-40 tabular-nums" />}</RequestField>)}</div>}
      <RequestField name="message" label={t('message')} hint={t('messageHint')}>{(id, invalid) => <Textarea {...register('message')} id={id} rows={4} maxLength={1000} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="scroll-mb-40" />}</RequestField>
    </section>
  </div>;
}
