'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { FieldErrors, FieldValues, Path, UseFormReturn } from 'react-hook-form';
import type { ActionHandler, ActionResult, BookingSheetHandlers, BookingView, LateByMinutes, SafetyReportKind } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/ui/primitives/sheet';
import { Spinner } from '@/ui/primitives/spinner';

export interface BookingSheetProps {
  data: BookingView;
  handlers: BookingSheetHandlers;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: ActionResult) => void;
  returnFocus?: RefObject<HTMLElement | null>;
  confirm?: boolean;
  /** Static snapshots for previews; never submit a mutation on mount. */
  initialPending?: boolean;
  initialResult?: ActionResult;
  initialValues?: { reason?: string; note?: string; kind?: SafetyReportKind; description?: string; minutes?: LateByMinutes };
}

/** One modal DOM tree at every width, preserving form state and the keyboard path on resize. */
export function BookingSheetFrame({ title, description, children, emergency, alert = false, locked, open, onOpenChange, returnFocus }: Pick<BookingSheetProps, 'open' | 'onOpenChange' | 'returnFocus'> & {
  title: string; description: string; children: ReactNode; emergency?: ReactNode; alert?: boolean; locked: boolean;
}) {
  const t = useTranslations('bookingSheets');
  const changeOpen = (next: boolean) => { if (!locked) onOpenChange(next); };
  const restoreFocus = (event: Event) => {
    const trigger = returnFocus?.current;
    if (!trigger) return;
    const visible = (element: HTMLElement) => {
      for (let node: HTMLElement | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    };
    // A desktop action or mobile More button may have disappeared after a viewport resize.
    const fallback = Array.from(trigger.closest('[data-booking-hub]')?.querySelectorAll<HTMLButtonElement>('button[data-action-id], button[data-action-more]') ?? []).find((button) => !button.disabled && visible(button));
    const target = visible(trigger) ? trigger : fallback;
    if (target) { event.preventDefault(); target.focus(); }
  };
  const body = <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">{children}</div>;
  if (alert) return <AlertDialog open={open} onOpenChange={changeOpen}>
    <AlertDialogContent className="inset-x-0 top-auto bottom-0 flex max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-b-none rounded-t-xl p-0 pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl" onEscapeKeyDown={(event) => { if (locked) event.preventDefault(); }} onCloseAutoFocus={restoreFocus}>
      {emergency}
      <AlertDialogHeader className="shrink-0 place-items-start p-4 text-left sm:p-6"><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
      {body}
      <div className="shrink-0 border-t p-4 sm:px-6"><AlertDialogCancel disabled={locked} className="w-full">{t('back')}</AlertDialogCancel></div>
    </AlertDialogContent>
  </AlertDialog>;
  return <Sheet open={open} onOpenChange={changeOpen}>
    <SheetContent side="bottom" showCloseButton={false} className="max-h-[92dvh] gap-0 rounded-t-xl pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl" onEscapeKeyDown={(event) => { if (locked) event.preventDefault(); }} onInteractOutside={(event) => { if (locked) event.preventDefault(); }} onCloseAutoFocus={restoreFocus}>
      {emergency}
      <SheetHeader className="shrink-0 p-4 sm:p-6"><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>
      {body}
      <div className="shrink-0 border-t p-4 sm:px-6"><Button type="button" variant="outline" disabled={locked} className="w-full" onClick={() => changeOpen(false)}>{t('back')}</Button></div>
    </SheetContent>
  </Sheet>;
}

export function useSheetMutation<T extends FieldValues>(props: BookingSheetProps, form: UseFormReturn<T>, fields: readonly Path<T>[], handler: ActionHandler<T>, successMessage?: string) {
  const router = useRouter();
  const feedbackCopy = useTranslations('feedback');
  const [pending, setPending] = useState(props.initialPending ?? false);
  const [result, setResult] = useState(props.initialResult);
  const locked = useRef(Boolean(props.initialPending || props.initialResult?.ok));
  const feedbackRef = useRef<HTMLDivElement>(null);
  const { setError, setFocus } = form;

  useEffect(() => {
    if (!result || pending) return;
    let first: Path<T> | undefined;
    for (const field of fields) {
      const code = !result.ok ? result.fieldErrors?.[field]?.[0] : undefined;
      if (code) { setError(field, { type: 'server', message: code }); first ??= field; }
    }
    const timer = setTimeout(() => { if (first) setFocus(first); else feedbackRef.current?.focus(); }, 0);
    return () => clearTimeout(timer);
  }, [result, pending, fields, setError, setFocus]);

  async function submit(input: T) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    form.clearErrors();
    let next: ActionResult;
    try { next = await handler(input); }
    catch { next = { ok: false, code: 'unknown' }; }
    locked.current = next.ok;
    setPending(false);
    setResult(next);
    if (next.ok) {
      toast.success(successMessage ?? feedbackCopy(`success.${next.code}`));
      props.onSuccess?.(next);
      props.onOpenChange(false);
      if (next.redirectTo) router.push(next.redirectTo);
      router.refresh();
    }
  }
  function onInvalid(errors: FieldErrors<T>) {
    const first = fields.find((field) => Object.hasOwn(errors, field));
    if (first) setFocus(first);
  }
  return { pending, result, disabled: pending || Boolean(result?.ok), submit, onInvalid, feedbackRef };
}

export function SheetFeedback({ result, successMessage, feedbackRef }: { result?: ActionResult; successMessage?: string; feedbackRef: RefObject<HTMLDivElement | null> }) {
  const t = useTranslations('bookingSheets');
  const feedback = useTranslations('feedback');
  const router = useRouter();
  // Keep a summary even when field errors are also shown (including unrecognized server fields).
  const genericResult = result && !result.ok ? { ...result, fieldErrors: undefined } : result;
  return <div ref={feedbackRef} tabIndex={-1} className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
    {result && !result.ok && (result.code === 'not_allowed' || result.code === 'version_conflict') ? <div aria-live="polite"><Alert role="status" className="border-destructive/30"><AlertDescription className="space-y-2 text-foreground"><p>{t('changed')}</p><Button type="button" variant="outline" onClick={() => router.refresh()}>{t('reload')}</Button></AlertDescription></Alert></div> : <FormFeedback result={genericResult} successMessage={successMessage} errorMessage={result && !result.ok ? feedback(`error.${result.code}`) : undefined} />}
  </div>;
}

export function SheetSubmit({ label, pending, disabled, destructive = false }: { label: string; pending: boolean; disabled: boolean; destructive?: boolean }) {
  const t = useTranslations('bookingSheets');
  return <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={disabled} aria-busy={pending} className="h-auto min-h-11 w-full whitespace-normal">{pending && <Spinner aria-hidden="true" />}{pending ? t('sending') : label}</Button>;
}
