'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Route, X } from 'lucide-react';
import { NEIGHBORHOOD_DAY_RULES, neighborhoodDayInputSchema, type ActionResult, type MyAvailabilityPageData, type NeighborhoodDayHandlers, type NeighborhoodDayInput } from '@/contracts';
import { formatMoney, marketLocalToUtc } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { MarketDateInput, MarketTimeSelect } from '@/ui/components/forms/market-schedule-fields';
import { MoneyInput } from '@/ui/components/forms/money-input';
import { nativeSelectClassName } from '@/ui/components/forms/native-select';
import { Button } from '@/ui/primitives/button';
import { Checkbox } from '@/ui/primitives/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';

export interface NeighborhoodDayFormPreviewState {
  initialDayResult?: ActionResult;
  initialDayValues?: NeighborhoodDayInput;
}

type Neighborhood = NonNullable<MyAvailabilityPageData['neighborhood']>;

/** "Open a neighborhood day" on `/app/availability` (2026-11-24): one neighborhood, one date, 2 to 8 visits, a price per visit. */
export function NeighborhoodDayForm({ data, neighborhood, onCreateDay, initialDayResult, initialDayValues }: {
  data: MyAvailabilityPageData;
  neighborhood: Neighborhood;
  onCreateDay: NeighborhoodDayHandlers['onCreateDay'];
} & NeighborhoodDayFormPreviewState) {
  const t = useTranslations('neighborhoodDays');
  const categories = useTranslations('helperProfile.categories');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const { formatDate, zoneName } = useFormat(data.timeZone);
  const id = useId();
  const router = useRouter();
  const feedbackRef = useRef<HTMLDivElement>(null);
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(initialDayResult);
  const category = data.setup.bookableCategories[0];
  const listed = (slug: string | undefined) => {
    const pricing = slug ? data.listedPricing[slug as keyof typeof data.listedPricing] : undefined;
    return pricing?.type === 'fixed' ? pricing.priceCents : 0;
  };
  const [offerNeighbor, setOfferNeighbor] = useState(initialDayValues?.neighborPriceCents !== undefined);
  const schema = useMemo(() => neighborhoodDayInputSchema.superRefine((input, context) => {
    if (input.date < data.limits.firstDate || input.date > data.limits.lastDate) context.addIssue({ code: 'custom', path: ['date'], message: 'out_of_range' });
  }), [data.limits.firstDate, data.limits.lastDate]);
  const form = useForm<NeighborhoodDayInput>({
    resolver: zodResolver(schema), mode: 'onTouched',
    defaultValues: initialDayValues ?? {
      areaSlug: neighborhood.areas[0]?.slug ?? '', categorySlug: category, date: '',
      visits: [{ startTime: '', endTime: '' }, { startTime: '', endTime: '' }],
      priceCents: listed(category),
    },
  });
  const { register, setValue, clearErrors, getFieldState, formState, setError, setFocus } = form;
  const visits = useFieldArray({ control: form.control, name: 'visits' });
  const date = useWatch({ control: form.control, name: 'date' });
  const priceCents = useWatch({ control: form.control, name: 'priceCents' });

  useEffect(() => {
    if (!result || pending || result.ok) return;
    let first: FieldPath<NeighborhoodDayInput> | undefined;
    for (const [name, codes] of Object.entries(result.fieldErrors ?? {})) {
      const code = codes?.[0];
      if (!code) continue;
      setError(name as FieldPath<NeighborhoodDayInput>, { type: 'server', message: code });
      first ??= name as FieldPath<NeighborhoodDayInput>;
    }
    const timer = setTimeout(() => { if (first) setFocus(first); else feedbackRef.current?.focus(); }, 0);
    return () => clearTimeout(timer);
  }, [result, pending, setError, setFocus]);

  async function submit(input: NeighborhoodDayInput) {
    if (locked.current) return;
    locked.current = true; setPending(true); setResult(undefined); clearErrors();
    const sent: NeighborhoodDayInput = { ...input, ...(offerNeighbor ? {} : { neighborPriceCents: undefined }) };
    let next: ActionResult;
    try { next = await onCreateDay(sent); } catch { next = { ok: false, code: 'unknown' }; }
    locked.current = false; setPending(false); setResult(next);
    if (next.ok) {
      form.reset({ ...input, date: '', visits: [{ startTime: '', endTime: '' }, { startTime: '', endTime: '' }] });
      router.refresh();
    }
  }

  /** The words for a field's error: the specific rule where we have one. */
  function message(name: string, code: string): string {
    if (name === 'areaSlug') return t('errors.area');
    if (name === 'categorySlug') return t('errors.category');
    if (name === 'date' && code === 'out_of_range') return t('errors.date', { last: formatDate(marketLocalToUtc(data.limits.lastDate, '12:00', data.timeZone)) });
    if (name.endsWith('.startTime') && code === 'out_of_range') return t('errors.visitStart', { lead: data.limits.leadHours });
    if (name.endsWith('.endTime') && code === 'out_of_range') return t('errors.visitEnd', { maxHours: data.limits.maxHours });
    if (name === 'priceCents') return t('errors.price');
    if (name === 'neighborPriceCents' && code === 'out_of_range') return t('errors.neighborPrice');
    return fieldCopy(fieldCopy.has(code) ? code : 'invalid');
  }

  function field(name: FieldPath<NeighborhoodDayInput>, label: string, hint: string | undefined, children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string }) => ReactNode) {
    const error = getFieldState(name, formState).error;
    const fieldId = `${id}-${name.replaceAll('.', '-')}`;
    return <Field className="gap-2" data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      {children({ id: fieldId, 'aria-invalid': Boolean(error), 'aria-describedby': `${fieldId}-hint ${fieldId}-error` })}
      {hint && <FieldDescription id={`${fieldId}-hint`}>{hint}</FieldDescription>}
      <div id={`${fieldId}-error`}>{error?.message && <FieldError>{message(name, error.message)}</FieldError>}</div>
    </Field>;
  }

  const errorMessage = result && !result.ok ? result.code === 'limit_reached' ? t('errors.limit', { max: data.limits.maxActive })
    : result.code === 'not_allowed' ? t('errors.notAllowed') : undefined : undefined;
  const visitsError = getFieldState('visits', formState).error;
  return <section className="space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]" aria-labelledby={`${id}-title`}>
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-primary"><Route aria-hidden="true" className="size-5" /></span>
      <div><h2 id={`${id}-title`} className="font-display text-xl/7 font-semibold tracking-[-0.015em]">{t('form.title')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('form.hint')}</p></div>
    </div>
    <form noValidate aria-label={t('form.title')} aria-busy={pending} className="space-y-5" onSubmit={(event) => { void form.handleSubmit(submit)(event); }}>
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        <legend className="sr-only">{t('form.title')}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {field('areaSlug', t('form.area'), t('form.areaHint'), (props) => <select {...register('areaSlug')} {...props} className={nativeSelectClassName}>
            <option value="">{t('form.chooseArea')}</option>
            {neighborhood.areas.map((area) => <option key={area.slug} value={area.slug}>{area.name}</option>)}
          </select>)}
          {field('categorySlug', t('form.category'), t('form.categoryHint'), (props) => <select {...register('categorySlug', { onChange: (event) => { setValue('priceCents', listed(event.target.value)); clearErrors('priceCents'); } })} {...props} className={nativeSelectClassName}>
            <option value="">{t('form.chooseCategory')}</option>
            {data.setup.bookableCategories.map((value) => <option key={value} value={value}>{categories(value)}</option>)}
          </select>)}
        </div>
        {field('date', t('form.date'), t('form.dateHint', { first: formatDate(marketLocalToUtc(data.limits.firstDate, '12:00', data.timeZone)), last: formatDate(marketLocalToUtc(data.limits.lastDate, '12:00', data.timeZone)) }), (props) => <MarketDateInput {...register('date')} {...props} min={data.limits.firstDate} max={data.limits.lastDate} className="max-w-sm" />)}
        <fieldset className="min-w-0 space-y-3">
          <legend className="font-medium">{t('form.visits')}</legend>
          <p className="text-sm text-muted-foreground">{t('form.visitsHint', { min: NEIGHBORHOOD_DAY_RULES.minVisits, max: NEIGHBORHOOD_DAY_RULES.maxVisits, zone: zoneName })}</p>
          <ol className="space-y-3">
            {visits.fields.map((visit, index) => <li key={visit.id} className="rounded-2xl border border-foreground/[0.07] p-3 dark:border-white/[0.06]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{t('form.visit', { n: index + 1 })}</p>
                {visits.fields.length > NEIGHBORHOOD_DAY_RULES.minVisits && <Button type="button" variant="ghost" size="icon" aria-label={t('form.removeVisit', { n: index + 1 })} onClick={() => visits.remove(index)}><X aria-hidden="true" /></Button>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['startTime', 'endTime'] as const).map((part) => <div key={part}>{field(`visits.${index}.${part}`, t(part === 'startTime' ? 'form.start' : 'form.end'), undefined, (props) => <MarketTimeSelect {...register(`visits.${index}.${part}`)} {...props} date={date || data.limits.firstDate} placeholder={t('form.chooseTime')} />)}</div>)}
              </div>
            </li>)}
          </ol>
          {visitsError?.message && <FieldError>{fieldCopy(fieldCopy.has(visitsError.message) ? visitsError.message : 'invalid')}</FieldError>}
          {visits.fields.length < NEIGHBORHOOD_DAY_RULES.maxVisits && <Button type="button" variant="outline" onClick={() => visits.append({ startTime: '', endTime: '' })}><Plus aria-hidden="true" />{t('form.addVisit')}</Button>}
        </fieldset>
        <div className="space-y-5 border-t pt-5">
          <Controller control={form.control} name="priceCents" render={({ field: money }) => field('priceCents', t('form.price'), t('form.priceHint'), (props) => <MoneyInput {...props} name={money.name} ref={money.ref} onBlur={money.onBlur} value={money.value} onValueChange={money.onChange} className="max-w-48" />)} />
          <div className="flex items-start gap-3">
            <Checkbox id={`${id}-neighbor`} checked={offerNeighbor} onCheckedChange={(checked) => { setOfferNeighbor(checked === true); setValue('neighborPriceCents', checked === true ? -1 : undefined); clearErrors('neighborPriceCents'); }} aria-describedby={`${id}-neighbor-hint`} className="size-6 shrink-0" />
            <div><label htmlFor={`${id}-neighbor`} className="font-medium">{t('form.neighborToggle')}</label><p id={`${id}-neighbor-hint`} className="text-sm text-muted-foreground">{t('form.neighborToggleHint')}</p></div>
          </div>
          {offerNeighbor && <Controller control={form.control} name="neighborPriceCents" render={({ field: money }) => field('neighborPriceCents', t('form.neighborPrice'), t('form.neighborPriceHint', { price: formatMoney(Math.max(0, priceCents ?? 0)) }), (props) => <MoneyInput {...props} name={money.name} ref={money.ref} onBlur={money.onBlur} value={money.value ?? -1} onValueChange={money.onChange} className="max-w-48" />)} />}
        </div>
      </fieldset>
      <div ref={feedbackRef} tabIndex={-1} className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><FormFeedback result={result && !result.ok ? { ...result, fieldErrors: undefined } : result} successMessage={result?.ok ? t('form.created') : undefined} errorMessage={errorMessage} /></div>
      <Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'form.creating' : 'form.create')}</Button>
    </form>
  </section>;
}
