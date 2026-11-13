'use client';

import { Hammer, Laptop, Leaf, Package, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormContext } from 'react-hook-form';
import type { CategorySlug, PostTaskPageData, TaskDraftInput } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { PostingField, postingFieldId } from './posting-field';

const icons = { 'furniture-assembly': Hammer, 'moving-help': Package, 'yard-cleanup': Leaf, 'light-cleaning': Sparkles, 'computer-help': Laptop };

export function CategoryStep({ data }: { data: PostTaskPageData }) {
  const t = useTranslations('postTask');
  const { watch, setValue, clearErrors, register, formState, getFieldState } = useFormContext<TaskDraftInput>();
  const selected = watch('categorySlug');
  const id = postingFieldId('categorySlug');
  function select(slug: CategorySlug) {
    if (selected === slug) return;
    const category = data.categories.find((item) => item.slug === slug)!;
    setValue('categorySlug', slug, { shouldDirty: true });
    setValue('details', {}, { shouldDirty: true });
    setValue('budget', category.defaultPricingType === 'fixed'
      ? { type: 'fixed', priceCents: 0 }
      : { type: 'hourly', rateCents: 0, estimatedHours: category.minHours ?? 1, hoursCap: category.minHours ?? 1 }, { shouldDirty: true });
    if (!category.remoteAllowed && watch('location.mode') === 'remote') setValue('location', { mode: 'local', placeId: '' }, { shouldDirty: true });
    clearErrors(['categorySlug', 'details', 'budget', 'location']);
  }
  return <PostingField name="categorySlug" label={t('category.label')} hint={t('category.hint')}>
    <div role="radiogroup" aria-label={t('category.label')} aria-describedby={`${id}-hint ${id}-error`} aria-invalid={getFieldState('categorySlug', formState).invalid} className="grid gap-3">
      {data.categories.map((category, index) => {
        const Icon = icons[category.slug];
        return <label key={category.slug} className={cn('group/category flex min-h-24 cursor-pointer items-center gap-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card transition-[background-color,border-color,box-shadow,transform] duration-300 ease-[var(--ease-out)] hover:border-foreground/20 motion-safe:hover:-translate-y-px has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 dark:border-white/[0.06]', selected === category.slug && 'border-primary bg-primary/[0.05] shadow-[inset_0_0_0_1px_var(--primary)] dark:bg-primary/[0.1]')}>
          <input {...register('categorySlug')} id={index === 0 ? id : `${id}-${category.slug}`} type="radio" value={category.slug} checked={selected === category.slug} onChange={() => select(category.slug)} className="size-5 shrink-0 accent-primary" />
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground transition-transform duration-300 ease-[var(--ease-out)] group-hover/category:scale-105"><Icon className="size-6" aria-hidden="true" /></span>
          <span className="min-w-0"><span className="block font-semibold">{category.name}</span><span className="mt-1 block text-sm text-muted-foreground">{t(`category.scope.${category.slug}`)}</span></span>
        </label>;
      })}
    </div>
  </PostingField>;
}
