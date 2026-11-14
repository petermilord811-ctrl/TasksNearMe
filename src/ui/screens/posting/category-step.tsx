'use client';

import { useId, useState } from 'react';
import { Hammer, Laptop, Leaf, Lightbulb, Package, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormContext } from 'react-hook-form';
import type { CategorySlug, PostTaskPageData, TaskDraftInput } from '@/contracts';
import { readTaskIntent } from '@/shared/task-intent';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { PostingField, postingFieldId } from './posting-field';

const icons = { 'furniture-assembly': Hammer, 'moving-help': Package, 'yard-cleanup': Leaf, 'light-cleaning': Sparkles, 'computer-help': Laptop };

export function CategoryStep({ data }: { data: PostTaskPageData }) {
  const t = useTranslations('postTask');
  const categoryName = useTranslations('helperCard.categories');
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
  return <div className="space-y-6">
    <CategorySuggestion data={data} selected={selected} onUse={(slug, title) => {
      select(slug);
      // The words they typed make a first title, unless they already wrote one.
      if (title && !watch('title')) setValue('title', title, { shouldDirty: true });
    }} />
    <PostingField name="categorySlug" label={t('category.label')} hint={t('category.hint')}>
    <div role="radiogroup" aria-label={t('category.label')} aria-describedby={`${id}-hint ${id}-error`} aria-invalid={getFieldState('categorySlug', formState).invalid} className="grid gap-3">
      {data.categories.map((category, index) => {
        const Icon = icons[category.slug];
        return <label key={category.slug} className={cn('group/category flex min-h-24 cursor-pointer items-center gap-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card transition-[background-color,border-color,box-shadow,transform] duration-300 ease-[var(--ease-out)] hover:border-foreground/20 motion-safe:hover:-translate-y-px has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 dark:border-white/[0.06]', selected === category.slug && 'border-primary bg-primary/[0.05] shadow-[inset_0_0_0_1px_var(--primary)] dark:bg-primary/[0.1]')}>
          <input {...register('categorySlug')} id={index === 0 ? id : `${id}-${category.slug}`} type="radio" value={category.slug} checked={selected === category.slug} onChange={() => select(category.slug)} className="size-5 shrink-0 accent-primary" />
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground transition-transform duration-300 ease-[var(--ease-out)] group-hover/category:scale-105"><Icon className="size-6" aria-hidden="true" /></span>
          <span className="min-w-0"><span className="block font-semibold">{categoryName(category.slug)}</span><span className="mt-1 block text-sm text-muted-foreground">{t(`category.scope.${category.slug}`)}</span></span>
        </label>;
      })}
    </div>
  </PostingField>
  </div>;
}

/**
 * Not sure which category? A few words ("rake the leaves out front") and the category they sound like, with "Use"
 * (blueprint 01 P2, a suggested category): plain word matching, instant and free. It also says when it's work we
 * don't offer (TV mounting, licensed trades). Nothing is chosen until they tap "Use".
 */
function CategorySuggestion({ data, selected, onUse }: { data: PostTaskPageData; selected: CategorySlug | undefined; onUse: (slug: CategorySlug, title: string) => void }) {
  const t = useTranslations('postTask.category.suggest');
  const id = useId();
  const [text, setText] = useState('');
  const intent = text.trim().length >= 3 ? readTaskIntent(text) : null;
  const match = intent?.category ? data.categories.find((category) => category.slug === intent.category) : undefined;
  return <section aria-labelledby={`${id}-label`} className="space-y-3 rounded-[1.375rem] border border-dashed border-foreground/15 p-4">
    <label id={`${id}-label`} htmlFor={`${id}-text`} className="flex items-center gap-2 font-medium"><Lightbulb aria-hidden="true" className="size-4 text-primary" />{t('label')}</label>
    <Input id={`${id}-text`} value={text} onChange={(event) => setText(event.target.value)} maxLength={200} autoComplete="off" aria-describedby={`${id}-result`} placeholder={t('placeholder')} />
    <div id={`${id}-result`} aria-live="polite" className="min-h-6 text-sm">
      {intent?.notOffered ? <p className="text-pretty text-muted-foreground">{t(`notOffered.${intent.notOffered}`)}</p>
        : match ? <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span>{t('soundsLike', { category: match.name })}</span>
          {selected === match.slug ? <span className="font-medium text-success">{t('chosen')}</span> : <Button type="button" size="sm" variant="outline" onClick={() => onUse(match.slug, intent?.title ?? '')}>{t('use', { category: match.name })}</Button>}
        </p>
          : intent ? <p className="text-muted-foreground">{t('none')}</p> : <p className="text-muted-foreground">{t('hint')}</p>}
    </div>
  </section>;
}
