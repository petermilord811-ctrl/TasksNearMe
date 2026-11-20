'use client';

import { useId, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { ActionResult } from '@/contracts/actions';
import { FIND_WORK_DISTANCES } from '@/contracts/helper-work';
import { routes } from '@/contracts/routes';
import { SAVED_SEARCH_ALERTS, SAVED_SEARCH_PRICE_MAX, type EditSavedSearchHandlers, type EditSavedSearchPageData, type SavedSearchAlert, type SavedSearchFilterValues } from '@/contracts/searches';
import { TASK_BOARD_POSTED, TASK_BOARD_Q_MAX, TASK_BOARD_TIMES, TASK_BOARD_WHEN } from '@/contracts/tasks';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { nativeSelectClassName } from '@/ui/components/forms/native-select';
import { LocaleLink as Link, localeHref } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';

const MAX_AREAS = 12;
const card = 'space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]';
const legendClass = 'text-sm font-semibold';
const hintClass = 'text-sm text-muted-foreground';

/** A choice that turns on and off (a checkbox), drawn as a pill. */
function TogglePill({ checked, disabled = false, onChange, children }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return <label className={cn(
    'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
    checked ? 'border-primary/60 bg-primary/[0.07] text-foreground' : 'border-foreground/[0.12] hover:border-foreground/30 dark:border-white/[0.12]',
    disabled && !checked && 'cursor-not-allowed opacity-50',
  )}>
    <input type="checkbox" className="sr-only" checked={checked} disabled={disabled && !checked} onChange={(event) => onChange(event.target.checked)} />
    <span aria-hidden="true" className={cn('flex size-4 shrink-0 items-center justify-center rounded-[5px] border', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/30')}>{checked && <Check className="size-3" strokeWidth={3} />}</span>
    {children}
  </label>;
}

const dollars = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const number = Number(trimmed);
  return Number.isInteger(number) && number >= 0 ? number : Number.NaN;
};

/**
 * Editing a saved search (completion plan 7.10, sweep SS5): its name, its alerts, and its filters, the board's own
 * (keyword, category and task type, neighborhoods, price, when, time of day, posted, remote, few offers), plus the
 * distance for a search saved from find work. The server stores it as the board would; the page only collects it.
 */
export function EditSavedSearchScreen({ data, handlers, initialResult }: { data: EditSavedSearchPageData; handlers: EditSavedSearchHandlers; initialResult?: ActionResult }) {
  const t = useTranslations('savedSearches');
  const board = useTranslations('taskBoard');
  const taskCard = useTranslations('taskCard');
  const work = useTranslations('findWork');
  const fields = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const locale = useLocale();
  const id = useId();
  const [name, setName] = useState(data.name);
  const [alert, setAlert] = useState<SavedSearchAlert>(data.alert);
  const [values, setValues] = useState<SavedSearchFilterValues>(data.values);
  const [minPrice, setMinPrice] = useState(data.values.minPrice !== undefined ? String(data.values.minPrice) : '');
  const [maxPrice, setMaxPrice] = useState(data.values.maxPrice !== undefined ? String(data.values.maxPrice) : '');
  const [result, setResult] = useState<ActionResult | undefined>(initialResult);
  const [pending, startTransition] = useTransition();
  const set = (change: Partial<SavedSearchFilterValues>) => setValues((current) => ({ ...current, ...change }));
  const types = values.category ? data.options.categories.find((category) => category.slug === values.category)?.types ?? [] : [];

  const min = dollars(minPrice);
  const max = dollars(maxPrice);
  const fieldError = (key: string) => (result && !result.ok ? result.fieldErrors?.[key]?.[0] : undefined);
  // Checked here as the person types (the server checks the same, and answers with field codes).
  const priceProblem = Number.isNaN(min) || Number.isNaN(max) || (min ?? 0) > SAVED_SEARCH_PRICE_MAX || (max ?? 0) > SAVED_SEARCH_PRICE_MAX ? 'invalid' : min !== undefined && max !== undefined && min > max ? 'order' : undefined;
  const serverPrice = fieldError('filters.minPrice') ?? fieldError('filters.maxPrice');
  const priceError = priceProblem === 'order' || serverPrice === 'out_of_range' ? t('edit.priceOrder') : priceProblem || serverPrice ? t('edit.priceInvalid') : undefined;
  const nameCode = name.trim().length < 2 ? 'too_short' : fieldError('name');
  const nameError = nameCode ? fields(fields.has(nameCode) ? nameCode : 'invalid') : undefined;
  const invalid = name.trim().length < 2 || Boolean(priceProblem);

  const submit = () => startTransition(async () => {
    let next: ActionResult;
    try {
      next = await handlers.onSave({
        id: data.id,
        name,
        alert,
        filters: {
          ...values,
          ...(values.q?.trim() ? { q: values.q.trim() } : { q: undefined }),
          minPrice: Number.isNaN(min) ? undefined : min,
          maxPrice: Number.isNaN(max) ? undefined : max,
        },
      });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    setResult(next);
    if (next.ok) {
      toast.success(t('updated'));
      router.push(localeHref(next.redirectTo ?? routes.app.savedSearches(), locale));
    }
  });

  return <div className="mx-auto w-full max-w-reading space-y-5">
    <Link href={routes.app.savedSearches()} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" />{t('edit.back')}</Link>
    <div className="space-y-1.5">
      <h1 className="font-display text-[1.75rem]/[1.15] font-semibold tracking-[-0.02em]">{t('edit.title')}</h1>
      <p className="text-sm text-muted-foreground">{t(data.source === 'find_work' ? 'edit.fromFindWork' : 'edit.fromBoard', { market: data.marketName })} · <span className="tabular-nums">{t('openCount', { count: data.openCount })}</span></p>
    </div>
    <form noValidate aria-label={t('edit.title')} aria-busy={pending} className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (!pending && !invalid) submit(); }}>
      <div className={card}>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-name`} className={legendClass}>{t('new.name')}</label>
          <Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required aria-invalid={Boolean(nameError)} aria-describedby={`${id}-name-hint${nameError ? ` ${id}-name-error` : ''}`} />
          <p id={`${id}-name-hint`} className={hintClass}>{t('new.nameHint')}</p>
          {nameError && <p id={`${id}-name-error`} className="text-sm text-destructive">{nameError}</p>}
        </div>
        <fieldset className="space-y-2">
          <legend className={legendClass}>{t('alerts.label')}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {SAVED_SEARCH_ALERTS.map((option) => <label key={option} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border px-3.5 text-sm font-medium has-focus-visible:outline-2 has-focus-visible:outline-ring', alert === option ? 'border-primary/60 bg-primary/[0.05]' : 'border-foreground/[0.09] hover:border-foreground/20')}>
              <input type="radio" name="alert" value={option} checked={alert === option} onChange={() => setAlert(option)} className="accent-[var(--primary)]" />{t(`alerts.${option}`)}
            </label>)}
          </div>
          <p className={hintClass}>{t('alerts.hint')}</p>
        </fieldset>
      </div>

      <div className={card}>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t('new.filters')}</h2>
          <p className={hintClass}>{t('edit.filtersHint', { market: data.marketName })}</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-q`} className={legendClass}>{board('search.label')}</label>
          <Input id={`${id}-q`} type="search" value={values.q ?? ''} onChange={(event) => set({ q: event.target.value })} maxLength={TASK_BOARD_Q_MAX} placeholder={board('search.placeholder')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-category`} className={legendClass}>{board('category')}</label>
            <select id={`${id}-category`} value={values.category ?? ''} onChange={(event) => set({ category: (event.target.value || undefined) as SavedSearchFilterValues['category'], type: undefined })} className={nativeSelectClassName}>
              <option value="">{board('allCategories')}</option>
              {data.options.categories.map((category) => <option key={category.slug} value={category.slug}>{taskCard(`categories.${category.slug}`)}</option>)}
            </select>
          </div>
          {values.category && types.length > 0 && <div className="space-y-1.5">
            <label htmlFor={`${id}-type`} className={legendClass}>{board('types')}</label>
            <select id={`${id}-type`} value={values.type ?? ''} onChange={(event) => set({ type: event.target.value || undefined })} className={nativeSelectClassName}>
              <option value="">{board('allTypes')}</option>
              {types.map((type) => <option key={type} value={type}>{taskCard(`types.${values.category}.${type}`)}</option>)}
            </select>
          </div>}
        </div>
        {data.options.areas.length > 0 && <fieldset className="space-y-2">
          <legend className={legendClass}>{board('areas')}</legend>
          <p className={hintClass}>{t('edit.areasHint', { max: MAX_AREAS, market: data.marketName })}</p>
          <div className="flex flex-wrap gap-2">
            {data.options.areas.map((area) => <TogglePill key={area.slug} checked={values.areas.includes(area.slug)} disabled={values.areas.length >= MAX_AREAS} onChange={(checked) => set({ areas: checked ? [...values.areas, area.slug] : values.areas.filter((slug) => slug !== area.slug) })}>{area.name}</TogglePill>)}
          </div>
        </fieldset>}
        <fieldset className="space-y-2">
          <legend className={legendClass}>{board('price')}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor={`${id}-min`} className="text-sm text-muted-foreground">{board('priceRange.min')}</label>
              <Input id={`${id}-min`} inputMode="numeric" pattern="[0-9]*" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} aria-invalid={Boolean(priceError)} aria-describedby={priceError ? `${id}-price-error` : undefined} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${id}-max`} className="text-sm text-muted-foreground">{board('priceRange.max')}</label>
              <Input id={`${id}-max`} inputMode="numeric" pattern="[0-9]*" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} aria-invalid={Boolean(priceError)} aria-describedby={priceError ? `${id}-price-error` : undefined} />
            </div>
            <div className="col-span-2 space-y-1 sm:col-span-1">
              <label htmlFor={`${id}-pricing`} className="text-sm text-muted-foreground">{board('pricing')}</label>
              <select id={`${id}-pricing`} value={values.pricing ?? ''} onChange={(event) => set({ pricing: (event.target.value || undefined) as SavedSearchFilterValues['pricing'] })} className={nativeSelectClassName}>
                <option value="">{board('pricingOptions.any')}</option>
                <option value="fixed">{board('pricingOptions.fixed')}</option>
                <option value="hourly">{board('pricingOptions.hourly')}</option>
              </select>
            </div>
          </div>
          {priceError && <p id={`${id}-price-error`} className="text-sm text-destructive">{priceError}</p>}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-when`} className={legendClass}>{board('when')}</label>
            <select id={`${id}-when`} value={values.when} onChange={(event) => set({ when: event.target.value as SavedSearchFilterValues['when'] })} className={nativeSelectClassName}>
              {TASK_BOARD_WHEN.map((when) => <option key={when} value={when}>{board(`whenOptions.${when}`)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-posted`} className={legendClass}>{board('posted')}</label>
            <select id={`${id}-posted`} value={values.posted ?? ''} onChange={(event) => set({ posted: (event.target.value || undefined) as SavedSearchFilterValues['posted'] })} className={nativeSelectClassName}>
              <option value="">{board('postedOptions.any')}</option>
              {TASK_BOARD_POSTED.map((posted) => <option key={posted} value={posted}>{board(`postedOptions.${posted}`)}</option>)}
            </select>
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className={legendClass}>{board('times')}</legend>
          <div className="flex flex-wrap gap-2">
            {TASK_BOARD_TIMES.map((time) => <TogglePill key={time} checked={values.times.includes(time)} onChange={(checked) => set({ times: checked ? TASK_BOARD_TIMES.filter((option) => option === time || values.times.includes(option)) : values.times.filter((option) => option !== time) })}>{board(`timeOptions.${time}`)}</TogglePill>)}
          </div>
        </fieldset>
        {data.source === 'find_work' && <div className="space-y-1.5">
          <label htmlFor={`${id}-distance`} className={legendClass}>{work('distance')}</label>
          <select id={`${id}-distance`} value={values.distance ?? 'any'} onChange={(event) => set({ distance: event.target.value as SavedSearchFilterValues['distance'] })} aria-describedby={`${id}-distance-hint`} className={nativeSelectClassName}>
            {FIND_WORK_DISTANCES.map((distance) => <option key={distance} value={distance}>{work(`distanceOptions.${distance}`)}</option>)}
          </select>
          <p id={`${id}-distance-hint`} className={hintClass}>{t('edit.distanceHint')}</p>
        </div>}
        <fieldset className="space-y-2">
          <legend className={legendClass}>{board('more')}</legend>
          <div className="flex flex-wrap gap-2">
            <TogglePill checked={values.remoteOnly} onChange={(checked) => set({ remoteOnly: checked })}>{board('remoteOnly')}</TogglePill>
            <TogglePill checked={values.few} onChange={(checked) => set({ few: checked })}>{board('few')}</TogglePill>
          </div>
        </fieldset>
      </div>

      {result && !result.ok && <FormFeedback result={result} errorMessage={result.code === 'not_found' ? t('edit.notFound') : undefined} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={routes.app.savedSearches()} className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium text-muted-foreground hover:text-foreground">{t('edit.cancel')}</Link>
        <Button type="submit" disabled={pending || invalid} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'new.submitting' : 'edit.submit')}</Button>
      </div>
    </form>
  </div>;
}
