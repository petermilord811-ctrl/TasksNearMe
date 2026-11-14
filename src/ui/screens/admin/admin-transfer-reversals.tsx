'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transferReversalInputSchema, type ActionHandler, type AdminBookingReversals, type TransferReversalInput } from '@/contracts';
import { formatMoney, formatMoneyInput, parseMoneyInput } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormat } from '@/ui/lib/format';
import { useFormAction } from '@/ui/lib/use-form-action';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { adminSelect } from './admin-ui';

/**
 * A booking's transfers to the helper and their reversals (completion plan 5.13). Finance takes part or all of
 * one back, naming the booking's case and why; the dialog confirms before any money moves.
 */
export function AdminTransferReversals({ data, onReverseTransfer, initialOpen = false }: { data: AdminBookingReversals; onReverseTransfer?: ActionHandler<TransferReversalInput>; initialOpen?: boolean }) {
  const t = useTranslations('adminBooking.reversals');
  const { formatDateTime } = useFormat();
  const reversible = data.transfers.filter((row) => row.reversibleCents > 0);
  const canAct = data.canReverse && onReverseTransfer !== undefined && reversible.length > 0;
  return <section aria-labelledby="booking-reversals" className="space-y-4 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]">
    <div className="space-y-1">
      <h2 id="booking-reversals" className="font-display text-xl leading-7 font-semibold tracking-[-0.02em]">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
    </div>
    {data.transfers.length === 0 ? <p className="text-sm text-muted-foreground">{t('none')}</p> : <ul aria-label={t('title')} className="divide-y divide-foreground/[0.07] dark:divide-white/[0.07]">
      {data.transfers.map((row) => <li key={row.earningsId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm">
        <span className="font-medium">{t(`kinds.${row.kind}`)}{row.transferredAt && <span className="font-normal text-muted-foreground"> · {formatDateTime(row.transferredAt)}</span>}</span>
        <span className="tabular-nums">{t('amounts', { transferred: formatMoney(row.transferredCents), reversed: formatMoney(row.reversedCents) })}</span>
      </li>)}
    </ul>}
    {data.history.length > 0 && <div className="space-y-2">
      <h3 className="font-semibold">{t('historyTitle')}</h3>
      <ul className="space-y-2 text-sm">{data.history.map((row) => <li key={row.id} className="rounded-xl bg-muted p-3">
        <p className="font-medium tabular-nums">{t(row.status === 'succeeded' ? 'historyDone' : 'historyFailed', { amount: formatMoney(row.amountCents), name: row.byDisplayName, date: formatDateTime(row.at) })}</p>
        <p className="text-muted-foreground">{t('historyCase', { case: row.caseId })} · {row.reason}</p>
      </li>)}</ul>
    </div>}
    {data.canReverse && data.cases.length === 0 && reversible.length > 0 && <p className="text-sm text-muted-foreground">{t('needsCase')}</p>}
    {canAct && data.cases.length > 0 && <ReversalDialog data={{ ...data, transfers: reversible }} onReverseTransfer={onReverseTransfer!} initialOpen={initialOpen} />}
  </section>;
}

function ReversalDialog({ data, onReverseTransfer, initialOpen }: { data: AdminBookingReversals; onReverseTransfer: ActionHandler<TransferReversalInput>; initialOpen: boolean }) {
  const t = useTranslations('adminBooking.reversals');
  const router = useRouter();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(initialOpen);
  const first = data.transfers[0]!;
  const defaults: TransferReversalInput = { earningsId: first.earningsId, amountCents: first.reversibleCents, caseId: data.cases[0]!.id, reason: '' };
  const form = useForm<TransferReversalInput>({ resolver: zodResolver(transferReversalInputSchema), defaultValues: defaults });
  const action = useFormAction(form, { onResult: (result) => { if (result.ok) { setOpen(false); router.refresh(); } } });
  const pending = action.pending || form.formState.isSubmitting;
  const chosenId = useWatch({ control: form.control, name: 'earningsId' });
  const chosen = data.transfers.find((row) => row.earningsId === chosenId) ?? first;
  const errors = form.formState.errors;
  const amountError = errors.amountCents ? (errors.amountCents.message === 'out_of_range' ? t('amountTooHigh', { amount: formatMoney(chosen.reversibleCents) }) : t('amountInvalid')) : undefined;
  const reasonError = errors.reason ? (errors.reason.message === 'too_long' ? t('reasonTooLong') : t('reasonRequired')) : undefined;
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : undefined;
  const failure = feedback?.code === 'insufficient_funds' ? t('insufficient') : feedback?.code === 'not_allowed' ? t('notAllowed') : undefined;

  return <>
    <Button ref={trigger} type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}>{t('open')}</Button>
    <AlertDialog open={open} onOpenChange={(next) => { if (pending) return; setOpen(next); if (!next) form.reset(defaults); }}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('dialogTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('dialogDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <form noValidate aria-label={t('dialogTitle')} aria-busy={pending} className="space-y-4" onSubmit={(event) => {
          if (pending) { event.preventDefault(); return; }
          void form.handleSubmit((input) => {
            if (input.amountCents > chosen.reversibleCents) { form.setError('amountCents', { type: 'max', message: 'out_of_range' }, { shouldFocus: true }); return; }
            return action.run(onReverseTransfer, input);
          })(event);
        }}>
          <Field className="gap-2">
            <FieldLabel htmlFor={`${id}-transfer`}>{t('transfer')}</FieldLabel>
            <select {...form.register('earningsId')} id={`${id}-transfer`} className={adminSelect} disabled={pending}>
              {data.transfers.map((row) => <option key={row.earningsId} value={row.earningsId}>{t('transferOption', { kind: t(`kinds.${row.kind}`), amount: formatMoney(row.reversibleCents) })}</option>)}
            </select>
          </Field>
          <Field data-invalid={Boolean(amountError)} className="gap-2">
            <FieldLabel htmlFor={`${id}-amount`}>{t('amount')}</FieldLabel>
            <FieldDescription id={`${id}-amount-hint`}>{t('amountHint', { amount: formatMoney(chosen.reversibleCents) })}</FieldDescription>
            <Controller control={form.control} name="amountCents" render={({ field }) => <Input
              id={`${id}-amount`}
              inputMode="decimal"
              defaultValue={formatMoneyInput(field.value)}
              onChange={(event) => field.onChange(parseMoneyInput(event.target.value) ?? 0)}
              onBlur={field.onBlur}
              disabled={pending}
              aria-invalid={Boolean(amountError)}
              aria-describedby={`${id}-amount-hint${amountError ? ` ${id}-amount-error` : ''}`}
            />} />
            {amountError && <FieldError id={`${id}-amount-error`}>{amountError}</FieldError>}
          </Field>
          <Field className="gap-2">
            <FieldLabel htmlFor={`${id}-case`}>{t('case')}</FieldLabel>
            <select {...form.register('caseId')} id={`${id}-case`} className={adminSelect} disabled={pending}>
              {data.cases.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </Field>
          <Field data-invalid={Boolean(reasonError)} className="gap-2">
            <FieldLabel htmlFor={`${id}-reason`}>{t('reason')}</FieldLabel>
            <FieldDescription id={`${id}-reason-hint`}>{t('reasonHint')}</FieldDescription>
            <Textarea {...form.register('reason')} id={`${id}-reason`} rows={3} maxLength={1000} disabled={pending} aria-invalid={Boolean(reasonError)} aria-describedby={`${id}-reason-hint${reasonError ? ` ${id}-reason-error` : ''}`} />
            {reasonError && <FieldError id={`${id}-reason-error`}>{reasonError}</FieldError>}
          </Field>
          <FormFeedback result={feedback} errorMessage={failure} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel type="button" disabled={pending}>{t('cancel')}</AlertDialogCancel>
            <Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'pending' : 'submit')}</Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
