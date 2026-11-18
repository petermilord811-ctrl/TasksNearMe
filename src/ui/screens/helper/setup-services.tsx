'use client';

import { useId, useState } from 'react';
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, ShieldCheck, X } from 'lucide-react';
import type { CategorySlug, CategoryView, HelperServicesInput, ServiceDefault } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { FieldError } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Textarea } from '@/ui/primitives/textarea';
import { cn } from '@/ui/lib/utils';
import { HelperField, ServiceMoneyField } from './helper-forms';

type ServiceRow = HelperServicesInput['services'][number];

/** A new service, prefilled from the server's defaults (or the category's minimum when there are none). */
function newService(category: CategoryView, defaults: Partial<Record<CategorySlug, ServiceDefault>>): ServiceRow {
  const preset = defaults[category.slug];
  if (preset) return { categorySlug: category.slug, ...preset, description: '' };
  return category.defaultPricingType === 'fixed'
    ? { categorySlug: category.slug, pricingType: 'fixed', fromPriceCents: category.minPriceCents, description: '' }
    : { categorySlug: category.slug, pricingType: 'hourly', hourlyRateCents: category.minPriceCents, minHours: category.minHours ?? 1, description: '' };
}

/**
 * Helper setup's first part, What you do (plan 9.11): the market's categories as toggles, each with its typical
 * price range; a chosen one opens its pricing, prefilled, and an optional note. The services schema checks it.
 */
export function SetupServices({ form, categories, defaults }: { form: UseFormReturn<HelperServicesInput>; categories: CategoryView[]; defaults: Partial<Record<CategorySlug, ServiceDefault>> }) {
  const t = useTranslations('helperOnboarding.setup.services');
  const fields = useTranslations('forms');
  const categoryName = useTranslations('helperCard.categories');
  const id = useId();
  const rows = useFieldArray({ control: form.control, name: 'services' });
  const services = useWatch({ control: form.control, name: 'services' }) ?? [];
  const rootError = form.formState.errors.services?.root?.message ?? form.formState.errors.services?.message;

  function toggle(category: CategoryView) {
    const index = services.findIndex((service) => service.categorySlug === category.slug);
    if (index >= 0) rows.remove(index);
    else rows.append(newService(category, defaults), { shouldFocus: false });
    form.clearErrors('services');
  }

  return <div className="space-y-6">
    <fieldset aria-describedby={`${id}-hint${rootError ? ` ${id}-error` : ''}`} className="space-y-3">
      <legend className="text-base font-semibold">{t('choose')}</legend>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('chooseHint')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {categories.map((category) => {
          const chosen = services.some((service) => service.categorySlug === category.slug);
          const guidance = category.priceGuidance;
          return <button
            key={category.slug}
            type="button"
            aria-pressed={chosen}
            onClick={() => toggle(category)}
            className={cn(
              'group flex min-h-16 items-center gap-3 rounded-2xl border border-foreground/[0.1] bg-card px-4 py-3 text-left transition-[background-color,border-color,box-shadow] duration-200 hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-white/[0.1]',
              chosen && 'border-primary/50 bg-brand-soft shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)] dark:border-primary/50',
            )}
          >
            <span aria-hidden="true" className={cn('grid size-6 shrink-0 place-items-center rounded-full border border-foreground/25 transition-colors', chosen && 'border-primary bg-primary text-primary-foreground')}>
              {chosen && <Check className="size-4" />}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{categoryName(category.slug)}</span>
              <span className="block text-sm text-muted-foreground tabular-nums">{t(`typical.${guidance.unit}`, { low: formatMoney(guidance.lowCents), high: formatMoney(guidance.highCents) })}</span>
            </span>
          </button>;
        })}
      </div>
      {rootError && <FieldError id={`${id}-error`}>{rootError === 'required' ? t('none') : fields(`fieldErrors.${rootError}`)}</FieldError>}
    </fieldset>
    {rows.fields.length > 0 && <ul className="space-y-4">
      {rows.fields.map((row, index) => {
        const service = services[index] ?? row;
        const category = categories.find((item) => item.slug === service.categorySlug);
        if (!category) return null;
        return <li key={row.id}><ServiceCard form={form} index={index} service={service} category={category} defaults={defaults} onRemove={() => rows.remove(index)} /></li>;
      })}
    </ul>}
  </div>;
}

function ServiceCard({ form, index, service, category, defaults, onRemove }: { form: UseFormReturn<HelperServicesInput>; index: number; service: ServiceRow; category: CategoryView; defaults: Partial<Record<CategorySlug, ServiceDefault>>; onRemove: () => void }) {
  const t = useTranslations('helperOnboarding.setup.services');
  const forms = useTranslations('helperOnboarding.forms.services');
  const categoryName = useTranslations('helperCard.categories');
  const id = useId();
  const name = categoryName(category.slug);
  const errors = form.formState.errors.services?.[index];
  const [noteOpen, setNoteOpen] = useState(Boolean(service.description));

  function setPricing(pricingType: 'fixed' | 'hourly') {
    if (pricingType === service.pricingType) return;
    const preset = defaults[category.slug];
    if (pricingType === 'fixed') {
      form.setValue(`services.${index}.fromPriceCents`, preset?.pricingType === 'fixed' ? preset.fromPriceCents : category.minPriceCents, { shouldDirty: true });
      form.setValue(`services.${index}.hourlyRateCents`, undefined);
      form.setValue(`services.${index}.minHours`, undefined);
    } else {
      form.setValue(`services.${index}.hourlyRateCents`, preset?.pricingType === 'hourly' ? preset.hourlyRateCents : category.minPriceCents, { shouldDirty: true });
      form.setValue(`services.${index}.minHours`, preset?.pricingType === 'hourly' ? preset.minHours : (category.minHours ?? 1), { shouldDirty: true });
      form.setValue(`services.${index}.fromPriceCents`, undefined);
    }
    form.setValue(`services.${index}.pricingType`, pricingType, { shouldDirty: true });
    form.clearErrors(`services.${index}`);
  }

  return <section aria-labelledby={`${id}-title`} className="space-y-4 rounded-2xl border border-foreground/[0.08] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h3 id={`${id}-title`} className="font-heading text-base font-semibold">{name}</h3>
        {category.requiresBackgroundCheck && <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{t('background')}</p>}
      </div>
      <button type="button" onClick={onRemove} aria-label={t('remove', { service: name })} className="-mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <X aria-hidden="true" className="size-5" />
      </button>
    </div>
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t('pricing', { service: name.toLowerCase() })}</legend>
      <div className="inline-grid grid-cols-2 rounded-full bg-muted p-1">
        {(['fixed', 'hourly'] as const).map((type) => <label key={type} className={cn('flex min-h-10 cursor-pointer items-center justify-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring', service.pricingType === type && 'bg-card text-foreground shadow-sm')}>
          <input type="radio" name={`${id}-pricing`} value={type} checked={service.pricingType === type} onChange={() => setPricing(type)} className="sr-only" />
          {t(type)}
        </label>)}
      </div>
    </fieldset>
    {service.pricingType === 'fixed'
      ? <ServiceMoneyField key="fixed" form={form} name={`services.${index}.fromPriceCents`} label={t('fromPrice')} hint={t('minimum', { amount: formatMoney(category.minPriceCents) })} />
      : <div className="grid gap-4 sm:grid-cols-2">
        <ServiceMoneyField key="hourly" form={form} name={`services.${index}.hourlyRateCents`} label={t('hourlyRate')} hint={t('minimum', { amount: formatMoney(category.minPriceCents) })} />
        <HelperField id={`${id}-hours`} label={t('minHours')} hint={forms('minHoursHint')} error={errors?.minHours?.message}>
          <Input {...form.register(`services.${index}.minHours`, { setValueAs: (value: string) => value === '' ? undefined : Number(value) })} id={`${id}-hours`} type="number" inputMode="numeric" min={1} max={8} step={1} aria-invalid={!!errors?.minHours} aria-describedby={`${id}-hours-hint${errors?.minHours ? ` ${id}-hours-error` : ''}`} className="max-w-32 tabular-nums" />
        </HelperField>
      </div>}
    {noteOpen
      ? <HelperField id={`${id}-note`} label={t('noteLabel', { service: name.toLowerCase() })} hint={t('noteHint')} error={errors?.description?.message}>
        <Textarea {...form.register(`services.${index}.description`)} id={`${id}-note`} maxLength={300} rows={2} aria-invalid={!!errors?.description} aria-describedby={`${id}-note-hint${errors?.description ? ` ${id}-note-error` : ''}`} />
      </HelperField>
      : <button type="button" onClick={() => setNoteOpen(true)} className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <ChevronDown aria-hidden="true" className="size-4" />{t('note')}
      </button>}
  </section>;
}
