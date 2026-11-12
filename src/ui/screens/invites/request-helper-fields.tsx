'use client';

import { useId, type ReactNode } from 'react';
import { Controller, useFormContext, type FieldPath } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { InvitableTask, PricingInput, RequestHelperInput, RequestHelperPageData } from '@/contracts';
import { formatDateTime, marketClockTime, marketDayKey, marketLocalToUtc } from '@/shared/format';
import { PricingFields } from '@/ui/components/forms/pricing-fields';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { Textarea } from '@/ui/primitives/textarea';
import { cn } from '@/ui/lib/utils';

export function suggestedPricing(data: RequestHelperPageData, task: InvitableTask): PricingInput {
  if (data.slot && !data.slotUnavailable) return data.slot.pricing;
  return data.suggestion && (!data.suggestion.taskId || data.suggestion.taskId === task.id)
    ? data.suggestion.pricing : data.listedPricing[task.categorySlug] ?? { type: 'fixed', priceCents: 0 };
}

export function requestStartWindow(data: RequestHelperPageData, task: InvitableTask) {
  const slot = data.slotUnavailable ? undefined : data.slot;
  return {
    start: slot && Date.parse(slot.start) > Date.parse(task.windowStart) ? slot.start : task.windowStart,
    // Starts use minute precision and must be before the slot's closing time.
    end: slot && Date.parse(slot.end) <= Date.parse(task.windowEnd) ? new Date(Date.parse(slot.end) - 60_000).toISOString() : task.windowEnd,
  };
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
  const selected = data.tasks.find((task) => task.id === taskId);
  const window = selected ? requestStartWindow(data, selected) : undefined;
  const hasSlot = !!data.slot && !data.slotUnavailable;
  return <div className="space-y-6">
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <h2 className="font-heading text-xl/7 font-semibold">{t('task')}</h2>
      <RequestField name="taskId" label={t('task')} hint={t(hasSlot ? 'slotTaskHint' : 'taskHint', { helper: data.helper.displayName })}>{(id, invalid) => <Controller name="taskId" control={control} render={({ field }) => <RadioGroup id={id} name={field.name} value={field.value} onBlur={field.onBlur} disabled={disabled} aria-label={t('task')} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} onValueChange={(value) => {
        const task = data.tasks.find((candidate) => candidate.id === value);
        if (!task) return;
        field.onChange(value); setValue('start', requestStartWindow(data, task).start); setValue('pricing', suggestedPricing(data, task)); setValue('acceptTerms', false); clearErrors();
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
      <RequestField name="start" label={t('start')} hint={t(hasSlot ? 'slotStartHint' : 'startHint')}>{(id, invalid) => <Controller name="start" control={control} render={({ field }) => <Input id={id} name={field.name} ref={field.ref} onBlur={field.onBlur} type="datetime-local" value={localStart(field.value)} min={window ? localStart(window.start) : undefined} max={window ? localStart(window.end) : undefined} step={60} onChange={(event) => {
        const [date, time] = event.target.value.split('T');
        field.onChange(date && time ? marketLocalToUtc(date, time) : '');
      }} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="max-w-sm scroll-mb-40 tabular-nums" />} />}</RequestField>
      <PricingFields disabled={disabled} />
      <RequestField name="message" label={t('message')} hint={t('messageHint')}>{(id, invalid) => <Textarea {...register('message')} id={id} rows={4} maxLength={1000} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="scroll-mb-40" />}</RequestField>
    </section>
  </div>;
}
