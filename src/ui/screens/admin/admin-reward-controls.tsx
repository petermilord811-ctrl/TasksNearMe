'use client';

import { createContext, useContext, useId, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { rewardDecisionInputSchema, type ActionResult, type AdminRewardRow, type AdminRewardsHandlers, type RewardDecisionInput, type StaffRewardActionId } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export interface AdminRewardDecisionState { initialNote?: string; initialPending?: boolean; initialResult?: ActionResult }
export interface AdminRewardsPreviewState {
  initialDialog?: { grantId: string; action: StaffRewardActionId };
  decisionState?: AdminRewardDecisionState;
}

const RewardControlsContext = createContext<{ busy: boolean; open: (row: AdminRewardRow, action: StaffRewardActionId, trigger: HTMLButtonElement) => void } | null>(null);

export function AdminRewardActionButtons({ row }: { row: AdminRewardRow }) {
  const t = useTranslations('adminRewards');
  const controls = useContext(RewardControlsContext);
  if (!controls) return null;
  if (row.actions.length === 0) return <p className="text-sm text-muted-foreground">{t('noActions')}</p>;
  return <div role="group" aria-label={t('actionsLabel', { name: row.helper.displayName })} className="flex flex-wrap gap-2">
    {row.actions.map((action) => <Button key={action} type="button" variant={action === 'approve_review' || action === 'reissue' ? 'default' : 'outline'} disabled={controls.busy} className="h-auto min-h-11 whitespace-normal" onClick={(event) => controls.open(row, action, event.currentTarget)}>{t(`actions.${action}`)}</Button>)}
  </div>;
}

function RewardDecisionForm({ row, actionId, handlers, onBusy, onSuccess, onCancel, initialNote = '', initialPending = false, initialResult }: {
  row: AdminRewardRow; actionId: StaffRewardActionId; handlers: AdminRewardsHandlers;
  onBusy: (busy: boolean) => void; onSuccess: (result: ActionResult) => void; onCancel: () => void;
} & AdminRewardDecisionState) {
  const t = useTranslations('adminRewards');
  const fields = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const form = useForm<RewardDecisionInput>({ resolver: zodResolver(rewardDecisionInputSchema), defaultValues: { grantId: row.id, action: actionId, note: initialNote } });
  const action = useFormAction(form, { initialResult, onResult: (result) => { if (result.ok) { onSuccess(result); router.refresh(); } } });
  const pending = action.pending || form.formState.isSubmitting || initialPending;
  const errorCode = form.formState.errors.note?.message;
  const error = errorCode === 'too_short' || errorCode === 'required' ? t('decision.tooShort') : errorCode === 'too_long' ? t('decision.tooLong') : errorCode ? fields(fields.has(errorCode) ? errorCode : 'invalid') : undefined;
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : action.result;
  return <form noValidate aria-label={t(`decision.titles.${actionId}`)} aria-busy={pending} className="space-y-4" onSubmit={(event) => {
    if (pending) { event.preventDefault(); return; }
    void form.handleSubmit(async (input) => { onBusy(true); try { await action.run(handlers.onDecide, input); } finally { onBusy(false); } })(event);
  }}>
    <Field data-invalid={Boolean(error)} className="gap-2">
      <FieldLabel htmlFor={id}>{t('decision.note')}</FieldLabel>
      <FieldDescription id={`${id}-hint`}>{t('decision.noteHint')}</FieldDescription>
      <Textarea {...form.register('note')} id={id} required rows={4} maxLength={1000} disabled={pending} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
    <FormFeedback result={feedback} successMessage={t('decision.updated')} errorMessage={feedback && !feedback.ok && feedback.code === 'not_allowed' ? t('decision.notAllowed') : undefined} />
    {feedback && !feedback.ok && feedback.code === 'not_allowed' && <Button type="button" variant="outline" onClick={() => router.refresh()}>{t('decision.refresh')}</Button>}
    <div className="flex flex-wrap justify-end gap-2">
      <AlertDialogCancel disabled={pending} onClick={onCancel} className="h-auto min-h-11 whitespace-normal">{t('decision.cancel')}</AlertDialogCancel>
      <Button type="submit" variant={actionId === 'reject_review' || actionId === 'void' ? 'destructive' : 'default'} disabled={pending} aria-busy={pending} className="h-auto min-h-11 whitespace-normal">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'decision.working' : `actions.${actionId}`)}</Button>
    </div>
  </form>;
}

/** One dialog serves both responsive lists, keeping focus and result handling in one place. */
export function AdminRewardControls({ rows, handlers, children, initialDialog, decisionState }: { rows: AdminRewardRow[]; handlers: AdminRewardsHandlers; children: ReactNode } & AdminRewardsPreviewState) {
  const t = useTranslations('adminRewards');
  const [dialog, setDialog] = useState(initialDialog);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | undefined>(decisionState?.initialResult?.ok ? decisionState.initialResult : undefined);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const selected = rows.find((row) => row.id === dialog?.grantId);
  const allowed = selected && dialog && selected.actions.includes(dialog.action);
  const pending = busy || Boolean(dialog && decisionState?.initialPending);
  return <RewardControlsContext value={{ busy: pending, open: (row, action, button) => { if (pending) return; trigger.current = button; setResult(undefined); setDialog({ grantId: row.id, action }); } }}>
    <div className="space-y-3">
      <div ref={confirmation} tabIndex={-1} className="rounded-lg outline-offset-4"><FormFeedback result={result} successMessage={t('decision.updated')} /></div>
      {children}
    </div>
    <AlertDialog open={Boolean(allowed)} onOpenChange={(open) => { if (!open && !pending) setDialog(undefined); }}>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); if (result?.ok) confirmation.current?.focus(); else trigger.current?.focus(); }} className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        {allowed && <>
          <AlertDialogHeader><AlertDialogTitle>{t(`decision.titles.${dialog.action}`)}</AlertDialogTitle><AlertDialogDescription>{t(`decision.descriptions.${dialog.action}`)}</AlertDialogDescription></AlertDialogHeader>
          <p className="rounded-xl bg-foreground/[0.04] p-3 text-sm dark:bg-white/[0.05] font-medium tabular-nums [overflow-wrap:anywhere]">{t('decision.context', { program: t(`programs.${selected.program}`), amount: formatMoney(selected.amountCents), name: selected.helper.displayName })}</p>
          <RewardDecisionForm key={`${selected.id}-${dialog.action}`} row={selected} actionId={dialog.action} handlers={handlers} onBusy={setBusy} onCancel={() => setDialog(undefined)} onSuccess={(next) => { setResult(next); setDialog(undefined); }} {...decisionState} />
        </>}
      </AlertDialogContent>
    </AlertDialog>
  </RewardControlsContext>;
}
