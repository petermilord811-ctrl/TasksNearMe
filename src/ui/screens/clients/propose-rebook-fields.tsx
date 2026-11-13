'use client';

import { useId, type ReactNode } from 'react';
import { useFormContext, type FieldPath } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { ProposeRebookPageData, RebookProposalInput } from '@/contracts';
import { marketLocalToUtc } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { PricingFields } from '@/ui/components/forms/pricing-fields';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Textarea } from '@/ui/primitives/textarea';

function ProposalField({ name, label, hint, children }: { name: FieldPath<RebookProposalInput>; label: string; hint: string; children: (id: string, invalid: boolean) => ReactNode }) {
  const id = useId();
  const { getFieldState, formState } = useFormContext<RebookProposalInput>();
  const { error } = getFieldState(name, formState);
  const t = useTranslations('forms.fieldErrors');
  return <Field data-invalid={!!error} className="gap-2">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    {children(id, !!error)}
    <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
    <div id={`${id}-error`} aria-live="polite">{error?.message && <FieldError>{t(t.has(error.message) ? error.message : 'invalid')}</FieldError>}</div>
  </Field>;
}

export function ProposeRebookFields({ data, disabled, earliest }: { data: ProposeRebookPageData; disabled: boolean; earliest: { date: string; time: string } }) {
  const { formatDate } = useFormat();
  const t = useTranslations('clients.form');
  const { register, watch } = useFormContext<RebookProposalInput>();
  const date = watch('date');
  const message = watch('message') ?? '';
  return <div className="space-y-5">
    <div className="grid gap-5 sm:grid-cols-2">
      <ProposalField name="date" label={t('date')} hint={t('dateHint', { first: formatDate(marketLocalToUtc(data.limits.firstDate, '12:00')), last: formatDate(marketLocalToUtc(data.limits.lastDate, '12:00')) })}>{(id, invalid) => <Input {...register('date')} id={id} type="date" min={data.limits.firstDate} max={data.limits.lastDate} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="scroll-mb-40 tabular-nums" />}</ProposalField>
      <ProposalField name="startTime" label={t('startTime')} hint={t('startTimeHint', { hours: data.limits.leadHours })}>{(id, invalid) => <Input {...register('startTime')} id={id} type="time" step={60} min={date === earliest.date ? earliest.time : undefined} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="scroll-mb-40 tabular-nums" />}</ProposalField>
    </div>
    <PricingFields disabled={disabled} namespace="clients.form" />
    <ProposalField name="message" label={t('message')} hint={t('messageHint')}>{(id, invalid) => <>
      <Textarea {...register('message')} id={id} rows={4} maxLength={1000} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error ${id}-count`} className="scroll-mb-40" />
      <p id={`${id}-count`} className="text-right text-sm tabular-nums text-muted-foreground">{t('messageCount', { count: message.length, maximum: 1000 })}</p>
    </>}</ProposalField>
  </div>;
}
