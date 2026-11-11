'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { LATE_BY_MINUTES, type LateByMinutes } from '@/contracts';
import { SheetChoice } from './sheet-fields';
import { BookingSheetFrame, SheetFeedback, SheetSubmit, useSheetMutation, type BookingSheetProps } from './sheet-shared';

// The contract supplies the choices and handler type, but has no running-late schema.
const runningLateSchema = z.object({ minutes: z.union(LATE_BY_MINUTES.map((minutes) => z.literal(minutes)), { error: 'required' }) });
const fields = ['minutes'] as const;

export function RunningLateSheet(props: BookingSheetProps) {
  return props.open ? <RunningLateContent {...props} /> : null;
}

function RunningLateContent(props: BookingSheetProps) {
  const t = useTranslations('bookingSheets');
  const form = useForm<{ minutes: LateByMinutes }>({ resolver: zodResolver(runningLateSchema), defaultValues: { minutes: props.initialValues?.minutes }, shouldFocusError: false });
  const mutation = useSheetMutation(props, form, fields, props.handlers.onRunningLate);
  return <BookingSheetFrame {...props} alert={props.confirm} title={t('late.title')} description={t('late.intro', { client: props.data.poster.displayName })} locked={mutation.pending}>
    <form noValidate aria-label={t('late.title')} aria-busy={mutation.pending} className="space-y-5" onSubmit={form.handleSubmit(mutation.submit, mutation.onInvalid)}>
      <Controller control={form.control} name="minutes" render={({ field, fieldState }) => <SheetChoice label={t('late.label')} name={field.name} value={field.value === undefined ? '' : String(field.value)} onChange={(value) => field.onChange(Number(value))} onBlur={field.onBlur} inputRef={field.ref} options={LATE_BY_MINUTES.map((minutes) => ({ value: String(minutes), label: t('late.minutes', { minutes }) }))} disabled={mutation.disabled} error={fieldState.error?.message} />} />
      <SheetFeedback {...mutation} />
      <SheetSubmit label={t('late.submit')} pending={mutation.pending} disabled={mutation.disabled} />
    </form>
  </BookingSheetFrame>;
}
