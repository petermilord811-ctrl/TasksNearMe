'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCompletionInputSchema, type ActionResult, type CompletionHandlers, type CompletionInput, type CompletionPageData } from '@/contracts';
import { actionTray, note, surface, surfacePad } from '@/ui/components/bookings/surface';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useKeepFocusAboveBar } from '@/ui/lib/keep-focus-above-bar';
import { useRouteDialog } from '@/ui/lib/route-dialog';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { CompletionFields } from './completion-fields';
import { CompletionEarnings } from './completion-earnings';

export function CompletionForm({ data, handlers, initialResult, initialPending = false, initialQuoteError }: {
  data: CompletionPageData; handlers: CompletionHandlers; initialResult?: ActionResult; initialPending?: boolean; initialQuoteError?: boolean;
}) {
  const t = useTranslations('bookingComplete');
  const id = useId();
  const router = useRouter();
  const dialog = useRouteDialog();
  const schema = useMemo(() => createCompletionInputSchema(data.rules), [data.rules]);
  const form = useForm<CompletionInput>({ resolver: zodResolver(schema), shouldFocusError: false, defaultValues: {
    photoIds: [], note: '', expenses: [], ...(data.rules.hours ? { hoursWorked: data.rules.hours.estimated } : {}),
    ...(data.rules.checklist.length > 0 ? { checklist: Object.fromEntries(data.rules.checklist.map((key) => [key, false])) } : {}),
  } });
  const values = useWatch({ control: form.control });
  const expensesCents = (values.expenses ?? []).reduce((sum, item) => sum + (Number.isSafeInteger(item.amountCents) && (item.amountCents ?? 0) > 0 ? item.amountCents! : 0), 0);
  const checked = schema.safeParse(values);
  const validQuote = checked.success || !checked.error.issues.some((issue) => issue.path[0] === 'hoursWorked' || (issue.path[0] === 'expenses' && (issue.path.length === 1 || issue.path[2] === 'amountCents')));
  const [result, setResult] = useState(initialResult);
  const [pending, setPending] = useState(initialPending);
  const [uploading, setUploading] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const locked = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusInvalid = useRef(false);
  const submitBar = useRef<HTMLDivElement>(null);
  // A field that focus reaches behind the sticky Send for approval bar, or whose hint or count is, comes clear of it,
  // also when a keyboard that shrinks the page opens (WCAG 2.4.11).
  const fields = useRef<HTMLFieldSetElement>(null);
  useKeepFocusAboveBar(fields, submitBar);
  const busy = pending || uploading || quoting;
  const disabled = busy || Boolean(result?.ok);
  // The fields lock only for the person's own actions (sending, a photo uploading) and once the work is sent. The
  // earnings quote runs in the background and never locks what they tick or type: only Send for approval waits for it.
  const fieldsLocked = pending || uploading || Boolean(result?.ok);
  const { setError } = form;
  useEffect(() => {
    if (!result || result.ok || pending) return;
    for (const [name, codes] of Object.entries(result.fieldErrors ?? {})) {
      if (codes?.[0] && /^(photoIds|note|hoursWorked|expenses(?:\.\d+(?:\.(description|amountCents|receiptPhotoId))?)?)$/.test(name)) {
        focusInvalid.current = true;
        setError(name as FieldPath<CompletionInput>, { type: 'server', message: codes[0] });
      }
    }
  }, [result, pending, setError]);
  // Nested server errors render in a subsequent commit. Focus only once their
  // controls exist and the fieldset is enabled, without racing a timer.
  useLayoutEffect(() => {
    if (!focusInvalid.current || fieldsLocked) return;
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-field-invalid="true"]');
    if (invalid) {
      invalid.focus();
      focusInvalid.current = false;
    }
  });

  async function submit(input: CompletionInput) {
    if (locked.current || busy) return;
    focusInvalid.current = false;
    locked.current = true; setPending(true); setResult(undefined);
    let next: ActionResult;
    try { next = await handlers.onSubmit(input); } catch { next = { ok: false, code: 'unknown' }; }
    locked.current = next.ok; setPending(false); setResult(next);
    // A route dialog closes over the booking, which then waits for the client; the full page goes to the booking.
    if (next.ok && dialog) dialog.finish(next, t('submitted'));
    else if (next.ok && next.redirectTo) router.push(next.redirectTo);
  }
  const feedback = result && !result.ok ? { ...result, fieldErrors: undefined } : result;
  return <FormProvider {...form}><form ref={formRef} noValidate aria-label={t('form')} aria-busy={pending || uploading} className={cn(surface, surfacePad, 'space-y-6')} onSubmit={(event) => { if (disabled) { event.preventDefault(); return; } void form.handleSubmit(submit, () => { focusInvalid.current = true; })(event); }}>
    <fieldset ref={fields} disabled={fieldsLocked} className="min-w-0"><legend className="sr-only">{t('form')}</legend><CompletionFields rules={data.rules} categorySlug={data.booking.task.categorySlug} onUploadPhoto={handlers.onUploadPhoto} onBusyChange={setUploading} expensesCents={expensesCents} /></fieldset>
    <CompletionEarnings hoursWorked={values.hoursWorked} expensesCents={expensesCents} valid={validQuote} onQuote={handlers.onQuoteFinal} onBusyChange={setQuoting} disabled={pending || uploading} initialError={initialQuoteError} />
    {result && !result.ok && result.code === 'not_allowed' ? <div role="status" className="space-y-3 rounded-2xl border border-warning/40 bg-badge-warning/60 p-4"><p>{t('changed')}</p><Button type="button" variant="outline" disabled={busy} onClick={() => router.refresh()}>{t('reload')}</Button></div> : <FormFeedback result={feedback} successMessage={t('submitted')} />}
    <p id={`${id}-approval`} className={note}>{t('approval')}</p>
    <div ref={submitBar} className={actionTray}><Button type="submit" disabled={disabled} aria-busy={busy} aria-describedby={`${id}-approval`} className="w-full sm:w-auto">{busy && <Spinner aria-hidden="true" />}{t(pending ? 'sending' : 'send')}</Button></div>
  </form></FormProvider>;
}
