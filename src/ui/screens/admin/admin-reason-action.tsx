'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ActionHandler, ActionResult } from '@/contracts';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

/**
 * A staff action that needs a written reason (10 to 1,000 characters, kept in the audit log), confirmed in a
 * dialog: suspending or banning an account, canceling a booking (completion plan 5.14). The reason is checked
 * here only for length; the server decides the rest. `action` is the Server Action itself (server components
 * can pass it, never a closure); it's called with `payload` plus the reason under `field`.
 */
export function AdminReasonAction<P extends Record<string, string>>({ trigger, title, description, submit, pending: pendingLabel, destructive = false, action, payload, field, notAllowed, initialOpen = false }: {
  trigger: string;
  title: string;
  description: string;
  submit: string;
  pending: string;
  destructive?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: ActionHandler<any>;
  payload: P;
  field: 'reason' | 'note';
  notAllowed: string;
  initialOpen?: boolean;
}) {
  const t = useTranslations('adminUser.reasonAction');
  const router = useRouter();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(initialOpen);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitReason = async () => {
    const text = reason.trim();
    if (text.length < 10) return setError(t('required'));
    if (text.length > 1000) return setError(t('tooLong'));
    setError(null);
    setFailure(null);
    setPending(true);
    try {
      const result: ActionResult = await action({ ...payload, [field]: text });
      if (result.ok) {
        setOpen(false);
        setReason('');
        router.refresh();
      } else setFailure(result.code === 'not_allowed' ? notAllowed : t('failed'));
    } catch {
      setFailure(t('failed'));
    } finally {
      setPending(false);
    }
  };
  return <>
    <Button ref={button} type="button" variant={destructive ? 'destructive' : 'outline'} className="min-h-11" onClick={() => setOpen(true)}>{trigger}</Button>
    <AlertDialog open={open} onOpenChange={(next) => { if (pending) return; setOpen(next); if (!next) { setError(null); setFailure(null); } }}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); button.current?.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form noValidate aria-label={title} aria-busy={pending} className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!pending) void submitReason(); }}>
          <Field data-invalid={Boolean(error)} className="gap-2">
            <FieldLabel htmlFor={`${id}-reason`}>{t('reason')}</FieldLabel>
            <FieldDescription id={`${id}-hint`}>{t('hint')}</FieldDescription>
            <Textarea id={`${id}-reason`} value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={1000} disabled={pending} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} />
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
          </Field>
          <p aria-live="polite" className="text-sm text-destructive">{failure}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel type="button" disabled={pending}>{t('cancel')}</AlertDialogCancel>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{pending ? pendingLabel : submit}</Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
