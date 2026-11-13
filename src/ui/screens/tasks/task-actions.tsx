'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TASK_CANCEL_REASONS, type ActionDescriptor, type ActionResult, type TaskActionId, type TaskCancelReason, type TaskOwnerHandlers } from '@/contracts';
import { ActionBar } from '@/ui/components/actions/action-bar';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { cn } from '@/ui/lib/utils';

interface TaskActionsProps {
  actions: ActionDescriptor<TaskActionId>[];
  handlers: TaskOwnerHandlers;
  initialCancelOpen?: boolean;
  initialCancelResult?: ActionResult;
}

/** The reason sheet is also the cancellation confirmation; actions still come from the domain. */
export function TaskActions({ actions, handlers, initialCancelOpen = false, initialCancelResult }: TaskActionsProps) {
  const t = useTranslations('taskManage');
  const feedback = useTranslations('feedback');
  const fields = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(initialCancelOpen);
  const [reason, setReason] = useState<TaskCancelReason>();
  const [result, setResult] = useState(initialCancelResult);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const firstReason = useRef<HTMLInputElement | null>(null);
  const cancelAction = actions.find((action) => action.id === 'cancel_task');
  const fieldError = result && !result.ok ? result.fieldErrors?.reason?.[0] : undefined;
  const resultText = result ? feedback(`${result.ok ? 'success' : 'error'}.${result.code}`) : null;

  useEffect(() => {
    if (!pending && fieldError) firstReason.current?.focus();
  }, [pending, fieldError, result]);

  async function cancelTask(event: React.FormEvent) {
    event.preventDefault();
    if (!reason || !cancelAction?.enabled || locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    let next: ActionResult;
    try { next = await handlers.onCancelTask({ reason }); }
    catch { next = { ok: false, code: 'unknown' }; }
    locked.current = false;
    setPending(false);
    setResult(next);
    if (next.ok) {
      setOpen(false);
      if (next.redirectTo) router.push(next.redirectTo);
    }
  }

  return <>
    <ActionBar actions={actions} onRequestAction={(action, button) => {
      if (action !== 'cancel_task') return false;
      trigger.current = button;
      setReason(undefined);
      setResult(undefined);
      setOpen(true);
      return true;
    }} onAction={(action) => handlers.onTaskAction({ action: action as Exclude<TaskActionId, 'cancel_task'> })} />
    <div aria-live="polite" aria-atomic="true">
      {!open && resultText && <p className={cn('text-sm', result?.ok ? 'text-success' : 'text-destructive')}>{resultText}</p>}
    </div>
    <AlertDialog open={open} onOpenChange={(next) => { if (!locked.current) setOpen(next); }}>
      <AlertDialogContent onOpenAutoFocus={(event) => { event.preventDefault(); firstReason.current?.focus(); }} onEscapeKeyDown={(event) => { if (locked.current) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }} className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        <AlertDialogHeader><AlertDialogTitle>{t('cancel.title')}</AlertDialogTitle><AlertDialogDescription>{t('cancel.description')}</AlertDialogDescription></AlertDialogHeader>
        <form onSubmit={cancelTask} className="space-y-5" aria-busy={pending}>
          <fieldset disabled={pending} aria-describedby={`${id}-reason-hint`} aria-invalid={!!fieldError} className="space-y-2">
            <legend className="mb-2 font-semibold">{t('cancel.reason')}</legend>
            {TASK_CANCEL_REASONS.map((value, index) => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-input p-3 transition-[background-color,border-color] duration-200 ease-[var(--ease-out)] hover:border-foreground/40 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06] dark:has-[:checked]:bg-primary/[0.12]">
              <input ref={index === 0 ? firstReason : undefined} type="radio" name={`${id}-reason`} value={value} checked={reason === value} onChange={() => { setReason(value); setResult(undefined); }} className="size-5 shrink-0 accent-primary" />
              <span className="text-sm">{t(`cancel.reasons.${value}`)}</span>
            </label>)}
            <p id={`${id}-reason-hint`} className={cn('text-sm', fieldError ? 'text-destructive' : 'text-muted-foreground')}>{fieldError ? fields(fieldError) : t('cancel.required')}</p>
          </fieldset>
          <div aria-live="polite" aria-atomic="true">{resultText && <p className={cn('text-sm', result?.ok ? 'text-success' : 'text-destructive')}>{resultText}</p>}</div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>{t('cancel.keep')}</Button>
            <Button type="submit" variant={cancelAction?.kind === 'primary' ? 'default' : cancelAction?.kind === 'destructive' ? 'destructive' : 'outline'} disabled={!reason || pending || !cancelAction?.enabled} aria-busy={pending}>{pending && <Spinner />}{t(pending ? 'cancel.pending' : 'cancel.submit')}</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
