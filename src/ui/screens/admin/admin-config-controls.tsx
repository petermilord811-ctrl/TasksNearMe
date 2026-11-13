'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import {
  bpsFromPercentText,
  dollarsText,
  flagSetInputSchema,
  percentText,
  policyPublishInputSchema,
  POLICY_FIELDS,
  POLICY_LIMITS,
  POLICY_MONEY_FIELDS,
  POLICY_PERCENT_FIELDS,
  type ActionResult,
  type AdminConfigHandlers,
  type AdminConfigPageData,
  type AdminFeatureFlag,
  type AdminPolicyValues,
  type FlagSetInput,
  type PolicyPublishInput,
} from '@/contracts';
import { formatMoney, parseMoneyInput } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { cn } from '@/ui/lib/utils';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { AdminCode, adminPanel, adminSection } from './admin-ui';

type PolicyKey = keyof AdminPolicyValues;
type PolicyForm = Record<PolicyKey, string> & { reason: string };

const GROUPS: { id: 'fees' | 'cancellation' | 'timers'; fields: PolicyKey[] }[] = [
  { id: 'fees', fields: ['posterBps', 'posterMinCents', 'helperBps'] },
  { id: 'cancellation', fields: ['freeUntilHours', 'lateFeeBps', 'lateFeeMinCents'] },
  { id: 'timers', fields: ['autoApproveHours', 'inviteTtlHours', 'pendingFundingMinutes', 'noShowMinutes', 'addressHideAfterHours', 'maxLeadDays', 'minLeadHours'] },
];

const isPercent = (key: PolicyKey) => POLICY_PERCENT_FIELDS.includes(key);
const isMoney = (key: PolicyKey) => POLICY_MONEY_FIELDS.includes(key);
/** A stored value as the form shows it. */
const textOf = (key: PolicyKey, value: number) => (isPercent(key) ? percentText(value) : isMoney(key) ? dollarsText(value) : String(value));
/** A limit as people read it. */
const limitText = (key: PolicyKey, value: number) => (isPercent(key) ? `${percentText(value)}%` : isMoney(key) ? formatMoney(value) : String(value));
/** Form text to the stored unit (null when it isn't a valid number). */
function valueOf(key: PolicyKey, text: string): number | null {
  if (isPercent(key)) return bpsFromPercentText(text);
  if (isMoney(key)) return parseMoneyInput(text);
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

export interface AdminConfigPreviewState {
  initialPolicyValues?: Partial<PolicyForm>;
  initialPolicyResult?: ActionResult;
  initialFlag?: { key: string; reason?: string };
}

function PublishForm({ data, handlers, initialValues, initialResult }: { data: AdminConfigPageData; handlers: AdminConfigHandlers; initialValues?: Partial<PolicyForm>; initialResult?: ActionResult }) {
  const t = useTranslations('adminConfig');
  const router = useRouter();
  const id = useId();
  const next = Math.max(...data.history.map((item) => item.version)) + 1;
  const defaults = Object.fromEntries(POLICY_FIELDS.map((key) => [key, textOf(key, data.current.values[key])])) as Record<PolicyKey, string>;
  const form = useForm<PolicyForm>({ defaultValues: { ...defaults, reason: '', ...initialValues } });
  const action = useFormAction(form, { initialResult, onResult: (result) => { if (result.ok) { form.setValue('reason', ''); router.refresh(); } } });
  const pending = action.pending || form.formState.isSubmitting;
  const { errors } = form.formState;
  const errorOf = (key: PolicyKey) => {
    const code = errors[key]?.message;
    if (!code) return undefined;
    return code === 'out_of_range' ? t('range', { min: limitText(key, POLICY_LIMITS[key].min), max: limitText(key, POLICY_LIMITS[key].max) }) : t('invalidNumber');
  };
  const reasonCode = errors.reason?.message;
  const reasonError = reasonCode ? t(reasonCode === 'too_long' ? 'reasonTooLong' : 'reasonRequired') : undefined;
  const feedback = action.result && (action.result.ok || !action.result.fieldErrors) ? action.result : undefined;

  const submit = form.handleSubmit(async (values) => {
    let first = true;
    const fail = (field: keyof PolicyForm, message: string) => { form.setError(field, { type: 'validate', message }, { shouldFocus: first }); first = false; };
    const converted: Partial<Record<PolicyKey, number>> = {};
    for (const key of POLICY_FIELDS) {
      const value = valueOf(key, values[key]);
      if (value === null) fail(key, 'invalid');
      else converted[key] = value;
    }
    if (!first) return;
    const input = { ...(converted as Record<PolicyKey, number>), reason: values.reason } satisfies PolicyPublishInput;
    const parsed = policyPublishInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && (field === 'reason' || (POLICY_FIELDS as string[]).includes(field))) fail(field as keyof PolicyForm, issue.message);
      }
      return;
    }
    await action.run(handlers.onPublishPolicy, input);
  });

  return <form noValidate aria-labelledby={`${id}-title`} aria-busy={pending} className={cn(adminSection, 'space-y-5')} onSubmit={(event) => { if (pending) { event.preventDefault(); return; } void submit(event); }}>
    <h3 id={`${id}-title`} className="font-display text-lg leading-6 font-semibold tracking-[-0.01em]">{t('publishTitle')}</h3>
    {GROUPS.map((group) => <fieldset key={group.id} className="space-y-3">
      <legend className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">{t(`groups.${group.id}`)}</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{group.fields.map((key) => {
        const error = errorOf(key);
        return <Field key={key} data-invalid={Boolean(error)} className="gap-2">
          <FieldLabel htmlFor={`${id}-${key}`}>{t(`fields.${key}`)}</FieldLabel>
          <Input {...form.register(key)} id={`${id}-${key}`} inputMode="decimal" disabled={pending} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-${key}-error` : undefined} className="tabular-nums" />
          {error && <FieldError id={`${id}-${key}-error`}>{error}</FieldError>}
        </Field>;
      })}</div>
    </fieldset>)}
    <Field data-invalid={Boolean(reasonError)} className="gap-2">
      <FieldLabel htmlFor={`${id}-reason`}>{t('reason')}</FieldLabel>
      <FieldDescription id={`${id}-reason-hint`}>{t('reasonHint')}</FieldDescription>
      <Textarea {...form.register('reason')} id={`${id}-reason`} rows={3} maxLength={1000} disabled={pending} aria-invalid={Boolean(reasonError)} aria-describedby={`${id}-reason-hint${reasonError ? ` ${id}-reason-error` : ''}`} />
      {reasonError && <FieldError id={`${id}-reason-error`}>{reasonError}</FieldError>}
    </Field>
    <FormFeedback result={feedback} successMessage={t('published')} errorMessage={feedback && !feedback.ok && feedback.code === 'not_allowed' ? t('notAllowed') : undefined} />
    <Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{pending ? t('publishing') : t('publish', { version: next })}</Button>
  </form>;
}

function FlagForm({ flag, handlers, initialReason, onCancel, onDone, onBusy }: { flag: AdminFeatureFlag; handlers: AdminConfigHandlers; initialReason?: string; onCancel: () => void; onDone: (result: ActionResult) => void; onBusy: (busy: boolean) => void }) {
  const t = useTranslations('adminConfig');
  const router = useRouter();
  const id = useId();
  const form = useForm<{ reason: string }>({ defaultValues: { reason: initialReason ?? '' } });
  const action = useFormAction(form, { onResult: (result) => { if (result.ok) { onDone(result); router.refresh(); } } });
  const pending = action.pending || form.formState.isSubmitting;
  const code = form.formState.errors.reason?.message;
  const reasonError = code ? t(code === 'too_long' ? 'reasonTooLong' : 'reasonRequired') : undefined;
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : undefined;
  const label = flag.enabled ? t('turnOff', { key: flag.key }) : t('turnOn', { key: flag.key });
  return <form noValidate aria-label={label} aria-busy={pending} className="space-y-4" onSubmit={form.handleSubmit(async ({ reason }) => {
    const input: FlagSetInput = { key: flag.key, enabled: !flag.enabled, reason };
    const parsed = flagSetInputSchema.safeParse(input);
    if (!parsed.success) { form.setError('reason', { type: 'validate', message: parsed.error.issues[0]?.message ?? 'required' }, { shouldFocus: true }); return; }
    onBusy(true);
    try { await action.run(handlers.onSetFlag, input); } finally { onBusy(false); }
  })}>
    <Field data-invalid={Boolean(reasonError)} className="gap-2">
      <FieldLabel htmlFor={`${id}-reason`}>{t('reason')}</FieldLabel>
      <FieldDescription id={`${id}-hint`}>{t('reasonHint')}</FieldDescription>
      <Textarea {...form.register('reason')} id={`${id}-reason`} rows={3} maxLength={1000} disabled={pending} aria-invalid={Boolean(reasonError)} aria-describedby={`${id}-hint${reasonError ? ` ${id}-error` : ''}`} />
      {reasonError && <FieldError id={`${id}-error`}>{reasonError}</FieldError>}
    </Field>
    <FormFeedback result={feedback} errorMessage={feedback?.code === 'not_allowed' ? t('notAllowed') : undefined} />
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <AlertDialogCancel type="button" disabled={pending} onClick={onCancel}>{t('cancel')}</AlertDialogCancel>
      <Button type="submit" variant={flag.enabled ? 'destructive' : 'default'} disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{pending ? t('saving') : label}</Button>
    </div>
  </form>;
}

/** The config page's interactive parts: publishing a policy version, and the flags (UI-038). */
export function AdminConfigControls({ data, handlers, part, initialPolicyValues, initialPolicyResult, initialFlag }: { data: AdminConfigPageData; handlers: AdminConfigHandlers; part: 'policy' | 'flags' } & AdminConfigPreviewState) {
  const t = useTranslations('adminConfig');
  const [flagKey, setFlagKey] = useState<string | undefined>(initialFlag?.key);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | undefined>();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const resultRegion = useRef<HTMLDivElement>(null);
  if (part === 'policy') return <PublishForm data={data} handlers={handlers} initialValues={initialPolicyValues} initialResult={initialPolicyResult} />;
  const flag = data.flags.find((item) => item.key === flagKey);
  return <div className="space-y-3">
    <div ref={resultRegion} tabIndex={-1} className={result ? 'rounded-lg outline-offset-4' : 'sr-only'}><FormFeedback result={result} successMessage={t('flagSaved')} /></div>
    <ul className={cn(adminPanel, 'divide-y divide-foreground/[0.07] dark:divide-white/[0.07]')}>{data.flags.map((item) => <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors duration-200 hover:bg-foreground/[0.02] dark:hover:bg-white/[0.02]">
      <div className="min-w-0 space-y-1"><AdminCode className="font-semibold">{item.key}</AdminCode><p className="text-sm text-muted-foreground">{item.description}</p></div>
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium', item.enabled ? 'bg-badge-success text-badge-success-foreground' : 'bg-badge-neutral text-badge-neutral-foreground')}><span aria-hidden="true" className={cn('size-1.5 rounded-full', item.enabled ? 'bg-current' : 'bg-current opacity-50')} />{item.enabled ? t('on') : t('off')}</span>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={(event) => { trigger.current = event.currentTarget; setResult(undefined); setFlagKey(item.key); }}>{item.enabled ? t('turnOff', { key: item.key }) : t('turnOn', { key: item.key })}</Button>
      </div>
    </li>)}</ul>
    <AlertDialog open={Boolean(flag)} onOpenChange={(open) => { if (!open && !busy) setFlagKey(undefined); }}>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); if (result?.ok) resultRegion.current?.focus(); else trigger.current?.focus(); }} className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        <AlertDialogHeader><AlertDialogTitle>{flag ? t(flag.enabled ? 'flagDialogOff' : 'flagDialogOn', { key: flag.key }) : null}</AlertDialogTitle><AlertDialogDescription>{flag ? t('flagDialogDescription', { description: flag.description }) : null}</AlertDialogDescription></AlertDialogHeader>
        {flag && <FlagForm key={flag.key} flag={flag} handlers={handlers} initialReason={initialFlag?.reason} onBusy={setBusy} onCancel={() => setFlagKey(undefined)} onDone={(next) => { setResult(next); setFlagKey(undefined); }} />}
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
