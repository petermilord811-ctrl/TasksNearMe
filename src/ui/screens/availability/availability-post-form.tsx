'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { availabilityPostInputSchema, type ActionResult, type AvailabilityHandlers, type AvailabilityPostInput, type ISODateTime, type MyAvailabilityPageData } from '@/contracts';
import { formatDate, formatDateTime, marketLocalToUtc } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { MarketDateInput, MarketTimeSelect } from '@/ui/components/forms/market-schedule-fields';
import { PricingFields } from '@/ui/components/forms/pricing-fields';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';

export interface AvailabilityFormPreviewState {
  initialResult?: ActionResult;
  initialPending?: boolean;
  initialValues?: AvailabilityPostInput;
}

export function AvailabilityPostForm({ data, onCreate, now, initialResult, initialPending = false, initialValues }: {
  data: MyAvailabilityPageData;
  onCreate: AvailabilityHandlers['onCreate'];
  now: ISODateTime;
} & AvailabilityFormPreviewState) {
  const t = useTranslations('availability');
  const categories = useTranslations('helperProfile.categories');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const id = useId();
  const router = useRouter();
  const feedbackRef = useRef<HTMLDivElement>(null);
  const locked = useRef(initialPending);
  const [pending, setPending] = useState(initialPending);
  const [result, setResult] = useState(initialResult);
  const category = data.setup.bookableCategories[0];
  const schema = useMemo(() => availabilityPostInputSchema.superRefine((input, context) => {
    if (input.date < data.limits.firstDate || input.date > data.limits.lastDate) {
      context.addIssue({ code: 'custom', path: ['date'], message: 'out_of_range' });
    }
  }), [data.limits.firstDate, data.limits.lastDate]);
  const form = useForm<AvailabilityPostInput>({
    resolver: zodResolver(schema), mode: 'onTouched',
    defaultValues: initialValues ?? {
      categorySlug: category, date: '', startTime: '', endTime: '',
      pricing: data.listedPricing[category] ?? { type: 'fixed', priceCents: 0 },
    },
  });
  const { register, setValue, clearErrors, getFieldState, formState, setError, setFocus } = form;
  const date = useWatch({ control: form.control, name: 'date' });
  const pricing = useWatch({ control: form.control, name: 'pricing' });

  useEffect(() => {
    if (!result || pending) return;
    const fields: FieldPath<AvailabilityPostInput>[] = ['categorySlug', 'date', 'startTime', 'endTime', 'pricing.type', 'pricing.priceCents', 'pricing.rateCents', 'pricing.estimatedHours', 'pricing.hoursCap'];
    let first: FieldPath<AvailabilityPostInput> | undefined;
    for (const name of fields) {
      const code = !result.ok ? result.fieldErrors?.[name]?.[0]
        ?? (name === (pricing.type === 'fixed' ? 'pricing.priceCents' : 'pricing.rateCents') ? result.fieldErrors?.pricing?.[0] : undefined) : undefined;
      if (code) { setError(name, { type: 'server', message: code }); first ??= name; }
    }
    const timer = setTimeout(() => { if (first) setFocus(first); else feedbackRef.current?.focus(); }, 0);
    return () => clearTimeout(timer);
  }, [result, pending, pricing.type, setError, setFocus]);

  async function submit(input: AvailabilityPostInput) {
    if (locked.current) return;
    locked.current = true; setPending(true); setResult(undefined); clearErrors();
    let next: ActionResult;
    try { next = await onCreate(input); } catch { next = { ok: false, code: 'unknown' }; }
    locked.current = false; setPending(false); setResult(next);
    if (next.ok) {
      form.reset({ ...input, date: '', startTime: '', endTime: '' });
      if (next.redirectTo) router.push(next.redirectTo); else router.refresh();
    }
  }

  function field(name: 'categorySlug' | 'date' | 'startTime' | 'endTime', label: string, hint: string, children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string }) => ReactNode) {
    const error = getFieldState(name, formState).error;
    const fieldId = `${id}-${name}`;
    const code = error?.message;
    const specific = name === 'categorySlug' && code === 'invalid' ? t('errors.category')
      : code === 'out_of_range' ? t(`errors.${name === 'categorySlug' ? 'category' : name}`, { maxHours: data.limits.maxHours }) : undefined;
    return <Field className="gap-2" data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      {children({ id: fieldId, 'aria-invalid': Boolean(error), 'aria-describedby': `${fieldId}-hint ${fieldId}-error` })}
      <FieldDescription id={`${fieldId}-hint`}>{hint}</FieldDescription>
      <div id={`${fieldId}-error`} aria-live="polite">{code && <FieldError>{specific ?? fieldCopy(fieldCopy.has(code) ? code : 'invalid')}</FieldError>}</div>
    </Field>;
  }

  const errorMessage = result && !result.ok ? result.code === 'limit_reached' ? t('atLimit', { count: data.limits.maxActive })
    : result.code === 'not_allowed' ? t('errors.createNotAllowed') : undefined : undefined;
  return <section className="space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]" aria-labelledby={`${id}-title`}>
    <div><h2 id={`${id}-title`} className="font-display text-xl/7 font-semibold tracking-[-0.015em]">{t('newSlot')}</h2><p className="mt-2 text-sm text-muted-foreground">{t('newSlotHint')}</p></div>
    <FormProvider {...form}><form noValidate aria-label={t('newSlot')} aria-busy={pending} className="space-y-5" onSubmit={(event) => { void form.handleSubmit(submit)(event); }}>
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        <legend className="sr-only">{t('newSlot')}</legend>
        {field('categorySlug', t('category'), t('categoryHint'), (props) => <select {...register('categorySlug', { onChange: (event) => {
          const next = data.setup.bookableCategories.find((value) => value === event.target.value);
          if (next) setValue('pricing', data.listedPricing[next] ?? { type: 'fixed', priceCents: 0 });
          clearErrors('pricing');
        } })} {...props} className="min-h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 py-2 text-base shadow-[inset_0_1px_2px_rgb(23_18_14/0.05)] transition-[border-color,box-shadow] duration-200 ease-[var(--ease-out)] outline-none hover:border-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 dark:bg-white/[0.035] dark:shadow-none">
          <option value="">{t('chooseCategory')}</option>
          {data.setup.bookableCategories.map((value) => <option key={value} value={value}>{categories(value)}</option>)}
        </select>)}
        {field('date', t('date'), t('dateHint', { first: formatDate(marketLocalToUtc(data.limits.firstDate, '12:00')), last: formatDate(marketLocalToUtc(data.limits.lastDate, '12:00')) }), (props) => <MarketDateInput {...register('date')} {...props} min={data.limits.firstDate} max={data.limits.lastDate} className="max-w-sm" />)}
        <div className="grid gap-5 sm:grid-cols-2">{(['startTime', 'endTime'] as const).map((name) => <div key={name}>{field(name, t(name), t('timeHint'), (props) => <MarketTimeSelect {...register(name)} {...props} date={date || data.limits.firstDate} placeholder={t('chooseTime')} />)}</div>)}</div>
        <div className="space-y-2 rounded-2xl bg-secondary p-4 text-sm text-secondary-foreground">
          <p>{t('timePolicy', data.limits)}</p><p className="tabular-nums">{t('currentTime', { now: formatDateTime(now) })}</p>
        </div>
        <div className="space-y-5 border-t pt-5"><PricingFields namespace="availability" disabled={pending} /></div>
      </fieldset>
      <div ref={feedbackRef} tabIndex={-1} className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><FormFeedback result={result && !result.ok ? { ...result, fieldErrors: undefined } : result} successMessage={result?.ok && result.code === 'saved' ? t('created') : undefined} errorMessage={errorMessage} /></div>
      <Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'creating' : 'create')}</Button>
    </form></FormProvider>
  </section>;
}
