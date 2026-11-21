'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { proposeChangeInputSchema, type ActionResult, type ProposeChangeHandlers, type ProposeChangeInput, type ProposeChangePageData } from '@/contracts';
import { actionTray, sectionTitle, surface, surfacePad } from '@/ui/components/bookings/surface';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { useKeepFocusAboveBar } from '@/ui/lib/keep-focus-above-bar';
import { ChangeQuote } from './change-quote';
import { ProposeChangeFields } from './propose-change-fields';
import { changedInput, changeDefaults, startOutsideWindow } from './propose-change-values';

export interface ProposeChangeFormProps {
  data: ProposeChangePageData;
  handlers: ProposeChangeHandlers;
  initialInput?: Partial<ProposeChangeInput>;
  initialResult?: ActionResult;
}

export function ProposeChangeForm({ data, handlers, initialInput, initialResult }: ProposeChangeFormProps) {
  const t = useTranslations('changes.propose');
  const router = useRouter();
  const form = useForm<ProposeChangeInput>({ defaultValues: { ...changeDefaults(data), ...initialInput } });
  const values = useWatch({ control: form.control }) as ProposeChangeInput;
  const input = changedInput(data, values);
  const parsed = proposeChangeInputSchema.safeParse(input);
  const validInput = parsed.success && !startOutsideWindow(data, input) ? parsed.data : undefined;
  const [result, setResult] = useState(initialResult);
  const [pending, setPending] = useState(false);
  const [noChanges, setNoChanges] = useState(false);
  const [confirming, setConfirming] = useState<ProposeChangeInput>();
  const locked = useRef(false);
  const submitButton = useRef<HTMLButtonElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  // A field that focus reaches behind the sticky bar, or whose hint is, comes clear of it, also when a keyboard that
  // shrinks the page opens (WCAG 2.4.11).
  const fields = useRef<HTMLFieldSetElement>(null);
  useKeepFocusAboveBar(fields, bar);
  const { setError, setFocus } = form;
  useEffect(() => {
    if (!result || result.ok || pending) return;
    let first: keyof ProposeChangeInput | undefined;
    for (const [name, codes] of Object.entries(result.fieldErrors ?? {})) {
      if (name in changeDefaults(data) && codes?.[0]) {
        const field = name as keyof ProposeChangeInput;
        setError(field, { message: codes[0] }); first ??= field;
      }
    }
    if (first) { const target = first; const timer = setTimeout(() => setFocus(target), 0); return () => clearTimeout(timer); }
  }, [result, pending, data, setError, setFocus]);

  function review(values: ProposeChangeInput) {
    form.clearErrors();
    setResult(undefined);
    setNoChanges(false);
    const next = changedInput(data, values);
    const validation = proposeChangeInputSchema.safeParse(next);
    if (!validation.success) {
      // The contract's no-change error is attached to price, even for forms without a price field.
      const nothingChanged = Object.keys(next).length === 1;
      if (nothingChanged) {
        setNoChanges(true); setResult({ ok: false, code: 'validation_failed' });
        const messageIssue = validation.error.issues.find((issue) => issue.path[0] === 'message');
        if (messageIssue) form.setError('message', { message: messageIssue.message });
        const firstField = data.allowedTypes.includes('price') ? data.current.pricing.type === 'fixed' ? 'priceCents' : 'hourlyRateCents'
          : data.allowedTypes.includes('hours_cap') ? 'hoursCap' : data.allowedTypes.includes('schedule') ? 'start'
            : data.allowedTypes.includes('scope') ? 'scopeText' : data.allowedTypes.includes('expense_allowance') ? 'expenseAllowanceCents' : 'message';
        form.setFocus(messageIssue ? 'message' : firstField);
      } else {
        for (const issue of validation.error.issues) form.setError(issue.path[0] as keyof ProposeChangeInput, { message: issue.message });
        form.setFocus(validation.error.issues[0].path[0] as keyof ProposeChangeInput);
      }
      return;
    }
    if (startOutsideWindow(data, next)) { form.setError('start', { message: 'out_of_range' }); form.setFocus('start'); return; }
    setConfirming(validation.data);
  }

  async function submit(next: ProposeChangeInput) {
    if (locked.current) return;
    locked.current = true; setPending(true); setResult(undefined); setConfirming(undefined);
    let response: ActionResult;
    try { response = await handlers.onPropose(next); }
    catch { response = { ok: false, code: 'unknown' }; }
    locked.current = false; setPending(false); setResult(response);
    if (response.ok && response.redirectTo) router.push(response.redirectTo);
  }

  return <FormProvider {...form}>
    <form noValidate onSubmit={(event) => { void form.handleSubmit(review)(event); }} aria-busy={pending} className="space-y-6">
      <fieldset ref={fields} disabled={pending} className={cn(surface, surfacePad, 'min-w-0 space-y-5')}>
        <legend className="sr-only">{t('fields')}</legend>
        <div className="space-y-1.5">
          <h2 className={sectionTitle}>{t('fields')}</h2>
          <p className="text-sm text-pretty text-muted-foreground">{t('fieldsHint')}</p>
        </div>
        <ProposeChangeFields data={data} />
      </fieldset>
      <ChangeQuote input={validInput} viewerRole={data.booking.viewerRole} onQuote={handlers.onQuote} />
      <FormFeedback result={result && !result.ok ? { ...result, fieldErrors: undefined } : result} errorMessage={noChanges ? t('noChanges') : result && !result.ok && result.code === 'not_allowed' ? t('notAllowed') : undefined} />
      <div ref={bar} className={actionTray}>
        <Button ref={submitButton} type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner />}{t(pending ? 'sending' : 'send')}</Button>
      </div>
    </form>
    <AlertDialog open={!!confirming} onOpenChange={(open) => { if (!open) setConfirming(undefined); }}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); submitButton.current?.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('confirmDescription')}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirming) void submit(confirming); }}>{t('confirmSend')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </FormProvider>;
}
