'use client';

import { useId } from 'react';
import { Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SAFETY_REPORT_KINDS, safetyReportInputSchema, type SafetyReportInput } from '@/contracts';
import { SheetChoice, SheetText } from './sheet-fields';
import { BookingSheetFrame, SheetFeedback, SheetSubmit, useSheetMutation, type BookingSheetProps } from './sheet-shared';

const fields = ['kind', 'description'] as const;

export function SafetyReportSheet(props: BookingSheetProps) {
  return props.open ? <SafetyReportContent {...props} /> : null;
}

function SafetyReportContent(props: BookingSheetProps) {
  const t = useTranslations('bookingSheets');
  const form = useForm<SafetyReportInput>({ resolver: zodResolver(safetyReportInputSchema), defaultValues: { kind: props.initialValues?.kind, description: props.initialValues?.description ?? '' }, shouldFocusError: false });
  const description = useWatch({ control: form.control, name: 'description' });
  const mutation = useSheetMutation(props, form, fields, props.handlers.onSafetyReport, t('safety.sent'));
  const formId = useId();
  return <BookingSheetFrame {...props} action={!mutation.result?.ok ? <SheetSubmit form={formId} label={t('safety.submit')} pending={mutation.pending} disabled={mutation.disabled} /> : undefined} alert={props.confirm} title={t('safety.title')} description={t('safety.intro')} locked={mutation.pending} emergency={
    <div className="shrink-0 border-b border-foreground/[0.07] p-4 sm:px-6">
      {/* The explicit emergency URI is required by UI-012 and never part of a disabled fieldset. */}
      <a href="tel:911" className="flex min-h-16 items-center gap-3 rounded-2xl border border-destructive/40 bg-badge-danger p-4 font-heading text-2xl/8 font-bold tracking-[-0.02em] text-badge-danger-foreground transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] hover:shadow-[0_10px_24px_-16px_rgb(180_30_30/0.55)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.99] motion-reduce:transition-none"><Phone aria-hidden="true" className="size-6 shrink-0" />{t('safety.emergency')}</a>
    </div>
  }>
    <form id={formId} noValidate aria-label={t('safety.title')} aria-busy={mutation.pending} className="space-y-5" onSubmit={form.handleSubmit(mutation.submit, mutation.onInvalid)}>
      {!mutation.result?.ok && <fieldset disabled={mutation.disabled} className="min-w-0 space-y-5">
        <legend className="sr-only">{t('safety.title')}</legend>
        <Controller control={form.control} name="kind" render={({ field, fieldState }) => <SheetChoice label={t('safety.kind')} name={field.name} value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} inputRef={field.ref} options={SAFETY_REPORT_KINDS.map((kind) => ({ value: kind, label: t(`safety.kinds.${kind}`) }))} disabled={mutation.disabled} error={fieldState.error?.message} />} />
        <SheetText label={t('safety.description')} hint={t('safety.descriptionHint')} registration={form.register('description')} count={description.length} max={2000} error={form.formState.errors.description?.message} required />
      </fieldset>}
      <SheetFeedback {...mutation} successMessage={t('safety.sent')} />
    </form>
  </BookingSheetFrame>;
}
