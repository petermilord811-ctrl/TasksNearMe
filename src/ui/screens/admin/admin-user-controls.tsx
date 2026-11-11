'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { helperSuspensionInputSchema, type ActionResult, type AdminUserActionId, type AdminUserHandlers, type AdminUserPageData, type HelperSuspensionInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export interface AdminSuspensionState { initialReason?: string; initialResult?: ActionResult; initialPending?: boolean }
export interface AdminUserPreviewState { initialDialog?: AdminUserActionId; suspensionState?: AdminSuspensionState }

function SuspensionForm({ actionId, handlers, onBusy, onCancel, onSuccess, initialReason = '', initialResult, initialPending = false }: {
  actionId: AdminUserActionId; handlers: AdminUserHandlers; onBusy: (busy: boolean) => void; onCancel: () => void; onSuccess: (result: ActionResult) => void;
} & AdminSuspensionState) {
  const t = useTranslations('adminUser');
  const fields = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const form = useForm<HelperSuspensionInput>({ resolver: zodResolver(helperSuspensionInputSchema), defaultValues: { suspend: actionId === 'suspend_helper', reason: initialReason } });
  const action = useFormAction(form, { initialResult, onResult: (result) => { if (result.ok) { onSuccess(result); router.refresh(); } } });
  const pending = action.pending || form.formState.isSubmitting || initialPending;
  const code = form.formState.errors.reason?.message;
  const error = code === 'required' || code === 'too_short' ? t('dialog.required') : code === 'too_long' ? t('dialog.tooLong') : code ? fields(fields.has(code) ? code : 'invalid') : undefined;
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : undefined;
  return <form noValidate aria-label={t(`actions.${actionId}`)} aria-busy={pending} className="space-y-4" onSubmit={(event) => {
    if (pending) { event.preventDefault(); return; }
    void form.handleSubmit(async (input) => { onBusy(true); try { await action.run(handlers.onSuspension, input); } finally { onBusy(false); } })(event);
  }}>
    <Field data-invalid={Boolean(error)} className="gap-2">
      <FieldLabel htmlFor={`${id}-reason`}>{t('dialog.reason')}</FieldLabel>
      <FieldDescription id={`${id}-hint`}>{t('dialog.hint')}</FieldDescription>
      <Textarea {...form.register('reason')} id={`${id}-reason`} required maxLength={1000} rows={4} disabled={pending} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
    <FormFeedback result={feedback} errorMessage={feedback?.code === 'not_allowed' ? t('dialog.notAllowed') : undefined} />
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><AlertDialogCancel type="button" disabled={pending} onClick={onCancel}>{t('dialog.cancel')}</AlertDialogCancel><Button type="submit" variant={actionId === 'suspend_helper' ? 'destructive' : 'default'} disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'dialog.pending' : `actions.${actionId}`)}</Button></div>
  </form>;
}

export function AdminUserControls({ data, handlers, initialDialog, suspensionState }: { data: AdminUserPageData; handlers: AdminUserHandlers } & AdminUserPreviewState) {
  const t = useTranslations('adminUser');
  const [dialog, setDialog] = useState<AdminUserActionId | undefined>(initialDialog);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | undefined>(suspensionState?.initialResult?.ok ? suspensionState.initialResult : undefined);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const resultRegion = useRef<HTMLDivElement>(null);
  const allowed = dialog !== undefined && data.actions.includes(dialog);
  const pending = busy || Boolean(allowed && suspensionState?.initialPending);
  return <div className="space-y-3">
    {data.actions.length > 0 ? <div role="group" aria-label={t('actionsLabel')} className="flex flex-wrap gap-2">{data.actions.map((actionId) => <Button key={actionId} variant={actionId === 'suspend_helper' ? 'destructive' : 'outline'} disabled={pending} aria-busy={pending && dialog === actionId} onClick={(event) => { trigger.current = event.currentTarget; setResult(undefined); setDialog(actionId); }}>{pending && dialog === actionId && <Spinner aria-hidden="true" />}{t(`actions.${actionId}`)}</Button>)}</div> : <p className="text-sm text-muted-foreground">{t('readOnly')}</p>}
    <div ref={resultRegion} tabIndex={-1} className="rounded-lg outline-offset-4"><FormFeedback result={result} successMessage={t('updated')} /></div>
    <AlertDialog open={allowed} onOpenChange={(open) => { if (!open && !pending) setDialog(undefined); }}>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); if (result?.ok) resultRegion.current?.focus(); else trigger.current?.focus(); }} className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        <AlertDialogHeader><AlertDialogTitle>{t(`actions.${dialog ?? 'suspend_helper'}`)}</AlertDialogTitle><AlertDialogDescription>{t(dialog === 'reinstate_helper' ? 'dialog.reinstateDescription' : 'dialog.suspendDescription')}</AlertDialogDescription></AlertDialogHeader>
        {dialog && allowed && <SuspensionForm key={dialog} actionId={dialog} handlers={handlers} onBusy={setBusy} onCancel={() => setDialog(undefined)} onSuccess={(next) => { setResult(next); setDialog(undefined); }} {...suspensionState} />}
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
