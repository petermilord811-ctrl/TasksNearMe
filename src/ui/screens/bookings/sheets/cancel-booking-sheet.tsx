'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert } from 'lucide-react';
import { HELPER_CANCEL_REASONS, POSTER_CANCEL_REASONS, cancelBookingInputSchema, routes, type CancelBookingInput, type CancellationPreview } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { Money } from '@/ui/components/money/money';
import { Button } from '@/ui/primitives/button';
import { Skeleton } from '@/ui/primitives/skeleton';
import { Spinner } from '@/ui/primitives/spinner';
import { SheetChoice, SheetText } from './sheet-fields';
import { BookingSheetFrame, SheetFeedback, SheetSubmit, useSheetMutation, type BookingSheetProps } from './sheet-shared';

export interface CancelBookingSheetProps extends BookingSheetProps {
  initialPreview?: CancellationPreview;
  initialPreviewState?: 'loading' | 'error';
}

const fields = ['reason', 'note'] as const;

export function CancelBookingSheet(props: CancelBookingSheetProps) {
  return props.open ? <CancelBookingContent {...props} /> : null;
}

function CancelBookingContent(props: CancelBookingSheetProps) {
  const { formatDateTime } = useFormat();
  const t = useTranslations('bookingSheets');
  const [preview, setPreview] = useState(props.initialPreview);
  const [loadError, setLoadError] = useState(props.initialPreviewState === 'error');
  const [attempt, setAttempt] = useState(0);
  const request = useRef<Promise<CancellationPreview> | undefined>(undefined);
  const form = useForm<CancelBookingInput>({ resolver: zodResolver(cancelBookingInputSchema), defaultValues: { reason: props.initialValues?.reason ?? '', note: props.initialValues?.note ?? '' }, shouldFocusError: false });
  const note = useWatch({ control: form.control, name: 'note' });
  const mutation = useSheetMutation(props, form, fields, props.handlers.onCancel);
  const formId = useId();

  useEffect(() => {
    if (attempt === 0 && (props.initialPreview || props.initialPreviewState)) return;
    let active = true;
    // Reuse the same request during Strict Mode's effect replay: once per opening or explicit retry.
    request.current ??= Promise.resolve().then(() => props.handlers.onPreviewCancel({}));
    void request.current.then((value) => { if (active) { setPreview(value); setLoadError(false); } }, () => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [attempt, props.handlers, props.initialPreview, props.initialPreviewState]);

  const reasonOptions = preview?.by === 'helper' ? HELPER_CANCEL_REASONS : POSTER_CANCEL_REASONS;
  return <BookingSheetFrame {...props} action={preview ? <SheetSubmit form={formId} label={t('cancel.submit')} pending={mutation.pending} disabled={mutation.disabled} destructive /> : undefined} alert title={t('cancel.title')} description={t('cancel.intro')} locked={mutation.pending}>
    {!preview ? <div aria-live="polite" className="space-y-4 py-4">
      {loadError ? <><p className="flex items-start gap-2"><CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />{t('cancel.loadError')}</p><Button type="button" variant="outline" onClick={() => { request.current = undefined; setLoadError(false); setAttempt((value) => value + 1); }}>{t('cancel.retry')}</Button></> : <><p role="status" className="flex items-center gap-2"><Spinner aria-hidden="true" />{t('cancel.loading')}</p><Skeleton aria-hidden="true" className="h-28 rounded-2xl" /></>}
    </div> : <form id={formId} noValidate aria-label={t('cancel.title')} aria-busy={mutation.pending} className="space-y-5" onSubmit={form.handleSubmit(mutation.submit, mutation.onInvalid)}>
      <div className="space-y-3 rounded-2xl border border-foreground/[0.06] bg-secondary p-4 text-secondary-foreground">
        {preview.paidDirectly ? <>
          {/* Paid directly (2026-11-23): no money moved here, so no refund or fee lines. */}
          <p className="font-heading text-xl/7 font-semibold tracking-[-0.015em]">{t('cancel.directTitle')}</p>
          <p>{preview.by === 'poster' ? t('cancel.directPoster', { helper: props.data.helper.displayName }) : t('cancel.directHelper', { client: props.data.poster.displayName })}</p>
        </> : preview.nothingCharged ? <>
          <p className="font-heading text-xl/7 font-semibold tracking-[-0.015em]">{t('cancel.nothingChargedTitle')}</p>
          <p>{t(preview.by === 'poster' ? 'cancel.nothingCharged' : 'cancel.nothingChargedHelper', { client: props.data.poster.displayName })}</p>
        </> : preview.by === 'poster' ? <>
          <p className="font-heading text-xl/7 font-semibold tracking-[-0.015em] tabular-nums">{t.rich('cancel.posterRefund', { amount: () => <Money cents={preview.posterRefundCents} size="lg" /> })}</p>
          {preview.late && <p className="text-sm tabular-nums">{t('cancel.posterLate', { fee: formatMoney(preview.helperCompensationCents), helper: props.data.helper.displayName, refund: formatMoney(preview.posterRefundCents) })}</p>}
        </> : <><p className="font-heading text-xl/7 font-semibold tracking-[-0.015em] tabular-nums">{t('cancel.helperRefund', { client: props.data.poster.displayName })}</p><p>{t.rich('cancel.refundAmount', { client: props.data.poster.displayName, amount: () => <Money cents={preview.posterRefundCents} /> })}</p></>}
        {preview.late && <p className="text-sm tabular-nums"><time dateTime={preview.freeUntil}>{t('cancel.freeEnded', { at: formatDateTime(preview.freeUntil) })}</time></p>}
      </div>
      {preview.helperStrike && <p className="flex items-start gap-2 rounded-2xl border border-warning/35 bg-badge-warning px-3.5 py-3 text-sm text-badge-warning-foreground"><CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />{t('cancel.strike')}</p>}
      <Link href={routes.legal('cancellation-policy')} aria-disabled={mutation.pending || undefined} tabIndex={mutation.pending ? -1 : undefined} onClick={(event) => { if (mutation.pending) event.preventDefault(); }} className="inline-flex min-h-11 items-center rounded-md text-sm text-primary underline underline-offset-4 aria-disabled:pointer-events-none aria-disabled:opacity-50">{t('cancel.policy')}</Link>
      <fieldset disabled={mutation.disabled} className="min-w-0 space-y-5">
        <legend className="sr-only">{t('cancel.reason')}</legend>
        <Controller control={form.control} name="reason" render={({ field, fieldState }) => <SheetChoice label={t('cancel.reason')} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} inputRef={field.ref} options={reasonOptions.map((reason) => ({ value: reason, label: t(`cancel.reasons.${reason}`) }))} disabled={mutation.disabled} error={fieldState.error?.message} />} />
        <SheetText label={t('note')} hint={t('noteHint')} registration={form.register('note')} count={note.length} max={500} error={form.formState.errors.note?.message} />
      </fieldset>
      <SheetFeedback {...mutation} />
    </form>}
  </BookingSheetFrame>;
}
