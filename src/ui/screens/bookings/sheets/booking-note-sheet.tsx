'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bookingNoteInputSchema, type BookingNoteInput } from '@/contracts';
import { SheetText } from './sheet-fields';
import { BookingSheetFrame, SheetFeedback, SheetSubmit, useSheetMutation, type BookingSheetProps } from './sheet-shared';

const fields = ['note'] as const;

export function ReportNoShowSheet(props: BookingSheetProps) {
  return props.open ? <BookingNoteContent {...props} kind="noShow" /> : null;
}

export function CantAccessSheet(props: BookingSheetProps) {
  return props.open ? <BookingNoteContent {...props} kind="cantAccess" /> : null;
}

function BookingNoteContent(props: BookingSheetProps & { kind: 'noShow' | 'cantAccess' }) {
  const t = useTranslations('bookingSheets');
  const form = useForm<BookingNoteInput>({ resolver: zodResolver(bookingNoteInputSchema), defaultValues: { note: props.initialValues?.note ?? '' }, shouldFocusError: false });
  const note = useWatch({ control: form.control, name: 'note' });
  const mutation = useSheetMutation(props, form, fields, props.kind === 'noShow' ? props.handlers.onReportNoShow : props.handlers.onCantAccess);
  const formId = useId();
  return <BookingSheetFrame {...props} action={<SheetSubmit form={formId} label={t(`${props.kind}.submit`)} pending={mutation.pending} disabled={mutation.disabled} destructive={props.kind === 'noShow'} />} alert={props.kind === 'noShow' || props.confirm} title={t(`${props.kind}.title`)} description={t(`${props.kind}.intro`, { helper: props.data.helper.displayName, client: props.data.poster.displayName })} locked={mutation.pending}>
    <form id={formId} noValidate aria-label={t(`${props.kind}.title`)} aria-busy={mutation.pending} className="space-y-5" onSubmit={form.handleSubmit(mutation.submit, mutation.onInvalid)}>
      <p className="rounded-2xl border border-foreground/[0.06] bg-secondary p-4 text-pretty text-secondary-foreground">{t(`${props.kind}.terms`)}</p>
      <fieldset disabled={mutation.disabled} className="min-w-0"><legend className="sr-only">{t('note')}</legend><SheetText label={t('note')} hint={t('noteHint')} registration={form.register('note')} count={note.length} max={500} error={form.formState.errors.note?.message} /></fieldset>
      <SheetFeedback {...mutation} />
    </form>
  </BookingSheetFrame>;
}
