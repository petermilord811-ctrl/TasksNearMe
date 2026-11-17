'use client';

import { useId, type ReactNode } from 'react';
import { useController, useFormContext, type FieldPath } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { REPEAT_CHOICES, type ProposeRebookPageData, type RebookProposalInput, type RepeatChoice } from '@/contracts';
import { marketLocalToUtc } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { PricingFields } from '@/ui/components/forms/pricing-fields';
import { draftSchedule, useScheduleWords } from '@/ui/components/series/schedule-words';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { cn } from '@/ui/lib/utils';
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

/** A cadence to choose: a soft card that lifts on hover; chosen, it takes the brand's ring (as the card picker). */
const choiceCard = 'flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-2xl border border-foreground/[0.09] bg-card px-3.5 py-2.5 transition-[border-color,box-shadow,background-color] duration-200 ease-[var(--ease-out)] hover:border-foreground/20 hover:shadow-card dark:border-white/[0.08]';
const choiceChosen = 'border-primary/60 bg-primary/[0.045] shadow-[0_0_0_1px_var(--primary)] hover:border-primary/60 hover:shadow-[0_0_0_1px_var(--primary)]';

/**
 * Regular visits (blueprint 03 §7): just once, or every week, every 2 weeks or monthly from the chosen start, with
 * the schedule in words and what it means for the client's card. Only where the task can repeat (`canRepeat`).
 */
function RepeatField({ clientName, disabled, timeZone }: { clientName: string; disabled: boolean; timeZone: string }) {
  const t = useTranslations('clients.form');
  const cadences = useTranslations('series.schedule.cadence');
  const scheduleWords = useScheduleWords();
  const id = useId();
  const { watch } = useFormContext<RebookProposalInput>();
  const { field } = useController<RebookProposalInput, 'repeat'>({ name: 'repeat' });
  const value: RepeatChoice = field.value ?? 'once';
  const schedule = value === 'once' ? null : draftSchedule(value, watch('date'), watch('startTime'), timeZone);
  return <fieldset className="min-w-0 space-y-3" disabled={disabled}>
    <legend id={`${id}-label`} className="font-medium">{t('repeat')}</legend>
    <RadioGroup aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} value={value} onValueChange={(next) => field.onChange(next as RepeatChoice)} className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {REPEAT_CHOICES.map((choice) => <label key={choice} htmlFor={`${id}-${choice}`} className={cn(choiceCard, value === choice && choiceChosen)}>
        <RadioGroupItem id={`${id}-${choice}`} value={choice} ref={value === choice ? field.ref : undefined} />
        <span className="min-w-0 text-sm font-medium">{cadences(choice)}</span>
      </label>)}
    </RadioGroup>
    <p id={`${id}-hint`} aria-live="polite" className="text-sm text-pretty text-muted-foreground">
      {value === 'once' ? t('repeatOnce') : schedule ? t('repeatHint', { schedule: scheduleWords(schedule), client: clientName }) : t('repeatPickDate')}
    </p>
  </fieldset>;
}

export function ProposeRebookFields({ data, disabled, earliest }: { data: ProposeRebookPageData; disabled: boolean; earliest: { date: string; time: string } }) {
  const { formatDate, zoneName } = useFormat(data.timeZone);
  const t = useTranslations('clients.form');
  const { register, watch } = useFormContext<RebookProposalInput>();
  const date = watch('date');
  const message = watch('message') ?? '';
  return <div className="space-y-5">
    <div className="grid gap-5 sm:grid-cols-2">
      <ProposalField name="date" label={t('date')} hint={t('dateHint', { first: formatDate(marketLocalToUtc(data.limits.firstDate, '12:00', data.timeZone)), last: formatDate(marketLocalToUtc(data.limits.lastDate, '12:00', data.timeZone)) })}>{(id, invalid) => <Input {...register('date')} id={id} type="date" min={data.limits.firstDate} max={data.limits.lastDate} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="scroll-mb-40 tabular-nums" />}</ProposalField>
      <ProposalField name="startTime" label={t('startTime')} hint={t('startTimeHint', { hours: data.limits.leadHours, zone: zoneName })}>{(id, invalid) => <Input {...register('startTime')} id={id} type="time" step={60} min={date === earliest.date ? earliest.time : undefined} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="scroll-mb-40 tabular-nums" />}</ProposalField>
    </div>
    {data.canRepeat && <RepeatField clientName={data.client.displayName} disabled={disabled} timeZone={data.timeZone} />}
    <PricingFields disabled={disabled} namespace="clients.form" />
    <ProposalField name="message" label={t('message')} hint={t('messageHint')}>{(id, invalid) => <>
      <Textarea {...register('message')} id={id} rows={4} maxLength={1000} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error ${id}-count`} className="scroll-mb-40" />
      <p id={`${id}-count`} className="text-right text-sm tabular-nums text-muted-foreground">{t('messageCount', { count: message.length, maximum: 1000 })}</p>
    </>}</ProposalField>
  </div>;
}
