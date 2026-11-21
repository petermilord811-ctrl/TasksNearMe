'use client';

import { useId, useState, type ReactNode } from 'react';
import { Controller, useFormContext, useWatch, type FieldPath } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import type { OfferInput, OfferMessageDraftInput, OfferMessageDraftResult, OfferRules, QueryHandler } from '@/contracts';
import { AiDraftButton, AiDraftStatus, type AiDraftOutcome } from '@/ui/components/forms/ai-draft';
import { formatHours, formatMoney, marketLocalToUtc } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { MoneyInput } from '@/ui/components/forms/money-input';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Textarea } from '@/ui/primitives/textarea';
import { Button } from '@/ui/primitives/button';

/** `after`: what follows the field's hint and error, such as the message's "Write it for me". */
function OfferField({ name, label, hint, children, after }: { name: FieldPath<OfferInput>; label: string; hint: string; children: (id: string, invalid: boolean) => ReactNode; after?: ReactNode }) {
  const id = useId();
  const { getFieldState, formState } = useFormContext<OfferInput>();
  const { error } = getFieldState(name, formState);
  const t = useTranslations('forms');
  const code = error?.message;
  return <Field data-invalid={!!error} className="gap-2">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    {children(id, !!error)}
    <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
    <div id={`${id}-error`}>{code && <FieldError>{t(t.has(`fieldErrors.${code}`) ? `fieldErrors.${code}` : 'fieldErrors.invalid')}</FieldError>}</div>
    {after}
  </Field>;
}

/** The message's count, in a leaf of its own: a keystroke re-renders only this line. */
function MessageCount({ id, maximum }: { id: string; maximum: number }) {
  const t = useTranslations('helperTask.form');
  const message = useWatch<OfferInput, 'message'>({ name: 'message' });
  return <p id={id} className="text-right text-sm tabular-nums text-muted-foreground">{t('messageCount', { count: message.length, maximum })}</p>;
}

function OfferMoneyField({ name, label, hint }: { name: 'pricing.priceCents' | 'pricing.rateCents'; label: string; hint: string }) {
  const { control } = useFormContext<OfferInput>();
  return <OfferField name={name} label={label} hint={hint}>{(id, invalid) => <Controller control={control} name={name} render={({ field }) => <MoneyInput
    id={id} name={field.name} ref={field.ref} onBlur={field.onBlur} inputMode="decimal" aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="max-w-sm scroll-mb-40 tabular-nums"
    value={field.value} onValueChange={field.onChange}
  />} />}</OfferField>;
}

/**
 * "Write it for me" under the message: drafted from the task, the helper's profile, the start time and what
 * they'll bring; what's typed so far goes along as notes. The draft replaces the message (Undo puts it back).
 */
function MessageDraft({ onDraft }: { onDraft: QueryHandler<OfferMessageDraftInput, OfferMessageDraftResult> }) {
  const t = useTranslations('helperTask.form');
  const id = useId();
  const { getValues, setValue } = useFormContext<OfferInput>();
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<AiDraftOutcome>();
  const [before, setBefore] = useState<string>();

  async function draft() {
    if (pending) return;
    setPending(true);
    setOutcome(undefined);
    const typed = getValues('message');
    let result: OfferMessageDraftResult;
    try {
      result = await onDraft({ startTime: getValues('startTime'), brings: getValues('brings'), notes: typed.trim().slice(0, 300) });
    } catch {
      result = { ok: false, code: 'unavailable' };
    }
    setPending(false);
    if (!result.ok) {
      setOutcome({ kind: 'failed', code: result.code });
      return;
    }
    setBefore((kept) => kept ?? typed);
    setValue('message', result.message, { shouldDirty: true, shouldValidate: true });
    setOutcome({ kind: 'drafted' });
  }

  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <AiDraftButton pending={pending} onClick={() => void draft()} className="scroll-mb-40">{t('aiDraft')}</AiDraftButton>
      <p id={`${id}-hint`} className="min-w-0 flex-1 basis-56 text-sm text-muted-foreground">{t('aiDraftHint')}</p>
    </div>
    <AiDraftStatus outcome={outcome} onUndo={() => {
      setValue('message', before ?? '', { shouldDirty: true, shouldValidate: true });
      setBefore(undefined);
      setOutcome({ kind: 'undone' });
    }} />
  </div>;
}

export function OfferFields({ rules, onDraftMessage }: {
  rules: OfferRules;
  /** "Write it for me" on the message, when drafting is on for this helper. */
  onDraftMessage?: QueryHandler<OfferMessageDraftInput, OfferMessageDraftResult>;
}) {
  // On the task's market clock (completion plan 8.1).
  const { formatTime, zoneName } = useFormat(rules.timeZone);
  const t = useTranslations('helperTask.form');
  const fields = useTranslations('forms');
  const { register, control, setValue, setError, clearErrors } = useFormContext<OfferInput>();
  const [bring, setBring] = useState('');
  const [bringError, setBringError] = useState<string>();
  // Named subscriptions: a keystroke in the message re-renders only its count (MessageCount), not every field; watch()
  // re-rendered the whole form (speed on a phone: INP).
  const brings = useWatch({ control, name: 'brings' });

  function addBring() {
    const value = bring.trim();
    if (value.length < 2 || value.length > 40) { setBringError(value.length < 2 ? 'too_short' : 'too_long'); return; }
    if (brings.length >= 10) { setError('brings', { type: 'manual', message: 'too_long' }); return; }
    setValue('brings', [...brings, value], { shouldDirty: true, shouldValidate: true });
    setBring(''); setBringError(undefined);
  }

  return <div className="space-y-6">
    {rules.pricingType === 'fixed'
      ? <OfferMoneyField name="pricing.priceCents" label={t('price')} hint={t('priceHint', { minimum: formatMoney(rules.minPriceCents) })} />
      : <>
        <OfferMoneyField name="pricing.rateCents" label={t('rate')} hint={t('rateHint')} />
        <div className="grid gap-5 sm:grid-cols-2">{(['estimatedHours', 'hoursCap'] as const).map((key) => <OfferField key={key} name={`pricing.${key}`} label={t(key)} hint={key === 'hoursCap' && rules.minHoursCap !== undefined ? t('hoursCapMinimumHint', { minimum: formatHours(rules.minHoursCap) }) : t(`${key}Hint`)}>{(id, invalid) => <Input
          {...register(`pricing.${key}`, { setValueAs: (value: string) => value === '' ? -1 : Number(value) })} id={id} type="number" inputMode="decimal" min={0.5} step={0.5}
          aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="scroll-mb-40 tabular-nums"
        />}</OfferField>)}</div>
      </>}
    <OfferField name="startTime" label={t('startTime')} hint={t('startTimeHint', { zone: zoneName })}>{(id, invalid) => <select {...register('startTime')} id={id} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="min-h-11 w-full scroll-mb-40 rounded-[10px] border border-input bg-background px-3 text-base tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <option value="" disabled>{t('chooseStart')}</option>
      {rules.startTimes.map((time) => <option key={time} value={time}>{formatTime(marketLocalToUtc(rules.date, time, rules.timeZone))}</option>)}
    </select>}</OfferField>
    {/* The hint and error right under the count, "Write it for me" after them: with a phone's keyboard open, the
        message, its count and its hint fit above Send offer (journeys on a phone). */}
    <OfferField name="message" label={t('message')} hint={t('privacy')} after={onDraftMessage && <MessageDraft onDraft={onDraftMessage} />}>{(id, invalid) => <>
      <Textarea {...register('message')} id={id} maxLength={rules.messageMaxLength} rows={4} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error ${id}-count`} className="min-h-28 scroll-mb-40" />
      <MessageCount id={`${id}-count`} maximum={rules.messageMaxLength} />
    </>}</OfferField>
    <OfferField name="brings" label={t('brings')} hint={t('bringsHint')}>{(id, invalid) => <Controller name="brings" control={control} render={({ field }) => <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input ref={field.ref} id={id} value={bring} onChange={(event) => { setBring(event.target.value); setBringError(undefined); clearErrors('brings'); }} onBlur={field.onBlur} maxLength={40} readOnly={brings.length >= 10} aria-invalid={invalid || !!bringError} aria-describedby={`${id}-hint ${id}-error ${id}-entry-error`} className="min-w-0 flex-1 scroll-mb-40" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addBring(); } }} />
        <Button type="button" variant="outline" onClick={addBring} disabled={brings.length >= 10} className="scroll-mb-40">{t('addBring')}</Button>
      </div>
      <div id={`${id}-entry-error`}>{bringError && <FieldError>{fields(`fieldErrors.${bringError}`)}</FieldError>}</div>
      {brings.length > 0 && <ul aria-label={t('brings')} className="flex flex-wrap gap-2">{brings.map((item, index) => <li key={`${index}-${item}`} className="flex max-w-full items-center gap-1 rounded-full border bg-secondary pl-4 text-sm text-secondary-foreground">
        <span className="min-w-0 break-words">{item}</span><Button type="button" variant="ghost" size="icon" aria-label={t('removeBring', { item })} className="shrink-0 scroll-mb-40 rounded-full" onClick={() => { field.onChange(brings.filter((_, position) => position !== index)); clearErrors('brings'); }}><X aria-hidden="true" className="size-4" /></Button>
      </li>)}</ul>}
    </div>} />}</OfferField>
  </div>;
}
