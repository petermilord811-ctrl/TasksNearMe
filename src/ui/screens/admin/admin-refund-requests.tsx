'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { refundDecisionInputSchema, type AdminBookingHandlers, type AdminRefundRequestRow, type ISODateTime, type RefundDecisionInput } from '@/contracts';
import { formatDateTime, formatMoney, formatRelative } from '@/shared/format';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

type Decision = RefundDecisionInput['decision'];
const tones = { pending: 'warning', approved: 'success', declined: 'neutral' } as const;

/** One decision with its note; focus returns to the button that opened it. */
function DecisionDialog({ request, decision, onDecide, onClose, returnFocus }: {
  request: AdminRefundRequestRow; decision: Decision; onDecide: AdminBookingHandlers['onDecideRefund']; onClose: () => void; returnFocus: () => void;
}) {
  const t = useTranslations('adminBooking.requests');
  const id = useId();
  const router = useRouter();
  const form = useForm<RefundDecisionInput>({ resolver: zodResolver(refundDecisionInputSchema), defaultValues: { requestId: request.id, decision, note: '' } });
  const action = useFormAction(form, { onResult: (result) => { if (result.ok) { onClose(); router.refresh(); } } });
  const pending = action.pending || form.formState.isSubmitting;
  const noteError = form.formState.errors.note ? t('dialog.noteTooShort') : undefined;
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : undefined;
  const amount = formatMoney(request.amountCents);
  return <AlertDialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}>
      <AlertDialogHeader>
        <AlertDialogTitle>{t(decision === 'approve' ? 'dialog.approveTitle' : 'dialog.declineTitle', { amount })}</AlertDialogTitle>
        <AlertDialogDescription>{t('dialog.description')}</AlertDialogDescription>
      </AlertDialogHeader>
      <form noValidate aria-busy={pending} className="space-y-4" onSubmit={(event) => {
        if (pending) { event.preventDefault(); return; }
        void form.handleSubmit((input) => action.run(onDecide, input))(event);
      }}>
        <Field data-invalid={Boolean(noteError)} className="gap-2">
          <FieldLabel htmlFor={`${id}-note`}>{t('dialog.note')}</FieldLabel>
          <FieldDescription id={`${id}-hint`}>{t('dialog.noteHint')}</FieldDescription>
          <Textarea {...form.register('note')} id={`${id}-note`} rows={3} maxLength={1000} required disabled={pending} aria-invalid={Boolean(noteError)} aria-describedby={`${id}-hint${noteError ? ` ${id}-error` : ''}`} />
          {noteError && <FieldError id={`${id}-error`}>{noteError}</FieldError>}
        </Field>
        <FormFeedback result={feedback} errorMessage={feedback?.code === 'not_allowed' ? t('dialog.notAllowed') : undefined} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel type="button" disabled={pending}>{t('dialog.cancel')}</AlertDialogCancel>
          <Button type="submit" variant={decision === 'approve' ? 'default' : 'outline'} disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'dialog.pending' : decision === 'approve' ? 'dialog.confirmApprove' : 'dialog.confirmDecline')}</Button>
        </div>
      </form>
    </AlertDialogContent>
  </AlertDialog>;
}

/** Refunds asked for above someone's limit (blueprint 08), with Approve and Decline for those who may. */
export function AdminRefundRequests({ requests, onDecide, now, initialDecision }: {
  requests: AdminRefundRequestRow[]; onDecide: AdminBookingHandlers['onDecideRefund']; now: ISODateTime;
  /** Previews: a decision dialog that starts open. */
  initialDecision?: { requestId: string; decision: Decision };
}) {
  const t = useTranslations('adminBooking.requests');
  const reasons = useTranslations('adminBooking.refund.reasons');
  const [open, setOpen] = useState(initialDecision);
  const triggers = useRef(new Map<string, HTMLButtonElement | null>());
  if (requests.length === 0) return null;
  const openRequest = open ? requests.find((request) => request.id === open.requestId) : undefined;
  return <section aria-labelledby="refund-requests-title" className="space-y-4 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]">
    <div className="space-y-1"><h2 id="refund-requests-title" className="text-xl font-semibold">{t('title')}</h2><p className="text-sm text-muted-foreground">{t('hint')}</p></div>
    <ul className="divide-y">{requests.map((request) => {
      const amount = formatMoney(request.amountCents);
      return <li key={request.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold tabular-nums">{t('amount', { amount, reason: reasons(request.reason) })}</p>
          <StatusBadge tone={tones[request.status]} label={t(`statuses.${request.status}`)} />
        </div>
        <p className="break-words text-sm">{request.note}</p>
        <p className="text-sm text-muted-foreground"><time dateTime={request.requestedAt} title={formatRelative(request.requestedAt, now)}>{t('by', { name: request.requestedBy, time: formatDateTime(request.requestedAt) })}</time></p>
        {request.decidedBy && request.decidedAt && <p className="text-sm text-muted-foreground"><time dateTime={request.decidedAt}>{t('decided', { status: request.status, name: request.decidedBy, time: formatDateTime(request.decidedAt) })}</time></p>}
        {request.status === 'pending' && (request.canDecide
          ? <div className="flex flex-wrap gap-2">
            {(['approve', 'decline'] as const).map((decision) => <Button key={decision} ref={(node) => { triggers.current.set(`${request.id}:${decision}`, node); }} variant={decision === 'approve' ? 'default' : 'outline'} className="min-h-11" aria-label={t(decision === 'approve' ? 'approveLabel' : 'declineLabel', { amount })} onClick={() => setOpen({ requestId: request.id, decision })}>{t(decision)}</Button>)}
          </div>
          : <p className="text-sm text-muted-foreground">{t('waiting')}</p>)}
      </li>;
    })}</ul>
    {open && openRequest && <DecisionDialog key={`${open.requestId}:${open.decision}`} request={openRequest} decision={open.decision} onDecide={onDecide} onClose={() => setOpen(undefined)} returnFocus={() => triggers.current.get(`${open.requestId}:${open.decision}`)?.focus()} />}
  </section>;
}
