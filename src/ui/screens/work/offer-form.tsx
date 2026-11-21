'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createOfferInputSchema, type ActionResult, type HelperTaskView, type HelperWorkHandlers, type OfferInput } from '@/contracts';
import { marketLocalToUtc } from '@/shared/format';
import { BotCheckField, useBotCheck } from '@/ui/components/forms/bot-check';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { OfferFields } from './offer-fields';
import { OfferEarnings } from './offer-earnings';

export interface OfferFormProps {
  data: HelperTaskView;
  handlers: HelperWorkHandlers;
  revising?: boolean;
  onCancel?: () => void;
  /** A new offer went: the summary that replaces this form takes focus (J-H8). */
  onSent?: () => void;
  /** Preview-only result state. */
  initialResult?: ActionResult;
}

/** A new offer's words for a task, kept in this tab until it's sent (personal drafts: gone at sign-out). */
export const offerDraftKey = (taskId: string) => `tnm:offer:${taskId}`;

export function OfferForm({ data, handlers, revising = false, onCancel, onSent, initialResult }: OfferFormProps) {
  const t = useTranslations('helperTask.form');
  const id = useId();
  const router = useRouter();
  const schema = useMemo(() => createOfferInputSchema(data.offerRules), [data.offerRules]);
  const own = revising ? data.myOffer : undefined;
  const form = useForm<OfferInput>({ resolver: zodResolver(schema), defaultValues: own ? {
    pricing: own.pricing,
    startTime: data.offerRules.startTimes.find((time) => marketLocalToUtc(data.offerRules.date, time, data.offerRules.timeZone) === own.proposedStart) ?? '',
    message: own.message, brings: own.brings,
  } : data.offerDefaults });
  const { setError, setFocus } = form;
  const pricing = useWatch({ control: form.control, name: 'pricing' });
  const validPricing = schema.safeParse({ pricing, startTime: data.offerRules.startTimes[0] ?? '', message: '', brings: [] }).success;
  const [result, setResult] = useState(initialResult);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const submitBar = useRef<HTMLDivElement>(null);
  useEffect(() => { if (revising) heading.current?.focus(); }, [revising]);

  // A new offer's words survive a reload or Back (journeys on a phone, J-H7: a 500-character message was lost): they come
  // back once, after hydration, where the task's rules still take them.
  const draftAt = offerDraftKey(data.task.id);
  useEffect(() => {
    if (revising) return;
    let saved: Partial<OfferInput> | null = null;
    try {
      saved = JSON.parse(window.sessionStorage.getItem(draftAt) ?? 'null') as Partial<OfferInput> | null;
    } catch {
      return;
    }
    if (!saved || typeof saved !== 'object') return;
    form.reset({
      ...form.getValues(),
      ...(typeof saved.message === 'string' ? { message: saved.message } : {}),
      ...(Array.isArray(saved.brings) ? { brings: saved.brings.filter((item): item is string => typeof item === 'string').slice(0, 10) } : {}),
      ...(typeof saved.startTime === 'string' && data.offerRules.startTimes.includes(saved.startTime) ? { startTime: saved.startTime } : {}),
      ...(saved.pricing && saved.pricing.type === data.offerRules.pricingType ? { pricing: saved.pricing } : {}),
    }, { keepDefaultValues: true });
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Saved as it's typed (after the restore above, which runs first and has read what was kept).
  const typed = useWatch({ control: form.control });
  useEffect(() => {
    if (revising) return;
    try {
      window.sessionStorage.setItem(draftAt, JSON.stringify(typed));
    } catch {
      // Storage off (a private window): nothing is kept.
    }
  }, [typed, revising, draftAt]);

  useEffect(() => {
    if (!result || result.ok || pending) return;
    const names: FieldPath<OfferInput>[] = data.offerRules.pricingType === 'fixed'
      ? ['pricing.priceCents', 'startTime', 'message', 'brings']
      : ['pricing.rateCents', 'pricing.estimatedHours', 'pricing.hoursCap', 'startTime', 'message', 'brings'];
    let first: FieldPath<OfferInput> | undefined;
    for (const name of names) {
      const code = result.fieldErrors?.[name]?.[0] ?? (name === 'brings' ? Object.entries(result.fieldErrors ?? {}).find(([key]) => /^brings\.\d+$/.test(key))?.[1]?.[0] : undefined);
      if (code) { setError(name, { type: 'server', message: code }); first ??= name; }
    }
    if (first) {
      // Let controlled field refs finish registering and pending controls become enabled.
      const target = first;
      const timer = setTimeout(() => setFocus(target), 0);
      return () => clearTimeout(timer);
    }
  }, [result, pending, data.offerRules.pricingType, setError, setFocus]);

  // A new offer runs the bot check (revising one doesn't); its answer goes with the offer.
  const check = useBotCheck(revising ? undefined : data.botCheck, 'offer');

  async function submit(input: OfferInput) {
    if (locked.current) return;
    locked.current = true; setPending(true); setResult(undefined);
    let next: ActionResult;
    try { next = await (revising ? handlers.onReviseOffer(input) : handlers.onSubmitOffer({ ...input, ...(check.token ? { botCheck: check.token } : {}) })); }
    catch { next = { ok: false, code: 'unknown' }; }
    if (!next.ok) check.reset();
    locked.current = false; setPending(false); setResult(next);
    if (next.ok && !revising) {
      try {
        window.sessionStorage.removeItem(draftAt);
      } catch {
        // Storage off: nothing was kept.
      }
      onSent?.();
    }
    if (next.ok && next.redirectTo) router.push(next.redirectTo);
  }

  // Keep a summary even when a server error names a field this form doesn't know.
  // A turned-down bot check is said by the check itself.
  const botCheckRefused = Boolean(result && !result.ok && result.fieldErrors?.botCheck);
  const feedback = botCheckRefused ? undefined : result && !result.ok ? { ...result, fieldErrors: undefined } : result;
  return <section aria-labelledby={`${id}-title`} className="space-y-5 rounded-xl border bg-card p-4 shadow-card sm:p-6">
    <h2 ref={heading} tabIndex={-1} id={`${id}-title`} className="rounded-sm font-heading text-xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t(revising ? 'reviseTitle' : 'title')}</h2>
    <p className="text-sm text-muted-foreground">{t('intro')}</p>
    <FormProvider {...form}><form noValidate aria-labelledby={`${id}-title`} aria-busy={pending} onSubmit={(event) => { void form.handleSubmit(submit)(event); }} className="space-y-6">
      <fieldset disabled={pending} className="min-w-0" onFocusCapture={(event) => {
        const bar = submitBar.current;
        // Native Tab scrolling can leave a partly visible field behind the sticky action bar.
        if (bar && event.target.getBoundingClientRect().bottom > bar.getBoundingClientRect().top) {
          event.target.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
      }}><legend className="sr-only">{t('details')}</legend><OfferFields rules={data.offerRules} onDraftMessage={data.aiDraftingEnabled ? handlers.onDraftOfferMessage : undefined} /></fieldset>
      <OfferEarnings pricing={pricing} valid={validPricing} onQuote={handlers.onQuote} />
      {!revising && data.botCheck && <BotCheckField check={check} result={result} />}
      <FormFeedback result={feedback} />
      <div ref={submitBar} className="sticky bottom-app-navigation z-10 flex flex-wrap gap-3 border-t bg-card pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button type="submit" disabled={pending} aria-busy={pending} className="min-w-0 flex-1 sm:flex-none">{pending && <Spinner />}{t(pending ? 'sending' : revising ? 'save' : 'send')}</Button>
        {onCancel && <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>{t('cancel')}</Button>}
      </div>
    </form></FormProvider>
  </section>;
}
