'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCompletionInputSchema, type ActionResult, type CompletionHandlers, type CompletionInput, type CompletionPageData } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
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
  const schema = useMemo(() => createCompletionInputSchema(data.rules), [data.rules]);
  const form = useForm<CompletionInput>({ resolver: zodResolver(schema), shouldFocusError: false, defaultValues: {
    photoIds: [], note: '', expenses: [], ...(data.rules.hours ? { hoursWorked: data.rules.hours.estimated } : {}),
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
  const submitBar = useRef<HTMLDivElement>(null);
  const busy = pending || uploading || quoting;
  const disabled = busy || Boolean(result?.ok);
  const { setError } = form;
  useEffect(() => {
    if (!result || result.ok || pending) return;
    for (const [name, codes] of Object.entries(result.fieldErrors ?? {})) {
      if (codes?.[0] && /^(photoIds|note|hoursWorked|expenses(?:\.\d+(?:\.(description|amountCents|receiptPhotoId))?)?)$/.test(name)) {
        setError(name as FieldPath<CompletionInput>, { type: 'server', message: codes[0] });
      }
    }
    const timer = setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-field-invalid="true"]')?.focus(), 0);
    return () => clearTimeout(timer);
  }, [result, pending, setError]);

  async function submit(input: CompletionInput) {
    if (locked.current || busy) return;
    locked.current = true; setPending(true); setResult(undefined);
    let next: ActionResult;
    try { next = await handlers.onSubmit(input); } catch { next = { ok: false, code: 'unknown' }; }
    locked.current = next.ok; setPending(false); setResult(next);
    if (next.ok && next.redirectTo) router.push(next.redirectTo);
  }
  const feedback = result && !result.ok ? { ...result, fieldErrors: undefined } : result;
  return <FormProvider {...form}><form ref={formRef} noValidate aria-label={t('form')} aria-busy={busy} className="space-y-6 rounded-xl border bg-card p-4 shadow-card sm:p-6" onSubmit={(event) => { if (disabled) { event.preventDefault(); return; } void form.handleSubmit(submit, () => { setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-field-invalid="true"]')?.focus(), 0); })(event); }}>
    <fieldset disabled={disabled} className="min-w-0" onFocusCapture={(event) => { const bar = submitBar.current; if (bar && event.target.getBoundingClientRect().bottom > bar.getBoundingClientRect().top) event.target.scrollIntoView({ block: 'center', behavior: 'instant' }); }}><legend className="sr-only">{t('form')}</legend><CompletionFields rules={data.rules} onUploadPhoto={handlers.onUploadPhoto} onBusyChange={setUploading} expensesCents={expensesCents} /></fieldset>
    <CompletionEarnings hoursWorked={values.hoursWorked} expensesCents={expensesCents} valid={validQuote} onQuote={handlers.onQuoteFinal} onBusyChange={setQuoting} disabled={pending || uploading} initialError={initialQuoteError} />
    {result && !result.ok && result.code === 'not_allowed' ? <div role="status" className="space-y-3 rounded-xl border border-warning/40 p-4"><p>{t('changed')}</p><Button type="button" variant="outline" disabled={busy} onClick={() => router.refresh()}>{t('reload')}</Button></div> : <FormFeedback result={feedback} successMessage={t('submitted')} />}
    <p id={`${id}-approval`} className="rounded-lg bg-secondary p-4 text-sm text-secondary-foreground">{t('approval')}</p>
    <div ref={submitBar} className="sticky bottom-0 z-10 border-t bg-card pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><Button type="submit" disabled={disabled} aria-busy={busy} aria-describedby={`${id}-approval`} className="w-full sm:w-auto">{busy && <Spinner aria-hidden="true" />}{t(pending ? 'sending' : 'send')}</Button></div>
  </form></FormProvider>;
}
