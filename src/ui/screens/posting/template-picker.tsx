'use client';

import { useId, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Lightbulb } from 'lucide-react';
import { compactTaskDetails, type TaskDraftInput, type TaskTemplate } from '@/contracts';
import { Button } from '@/ui/primitives/button';

type Written = Pick<TaskDraftInput, 'title' | 'description' | 'details'>;

const sameDetails = (a: Written['details'], b: Written['details']) => {
  const left = compactTaskDetails(a ?? {});
  const right = compactTaskDetails(b ?? {});
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
};

/**
 * "Start from an example" (blueprint 01, P2 "draft templates per category"): the category's examples as chips.
 * Picking one fills the title, the description (a summary and the questions helpers ask first) and the details.
 * When the person already wrote something of their own it asks first; switching between untouched examples
 * doesn't. Undo brings back what they had before any example. Nothing posts.
 * `startedFrom`: the wizard opened from an example (`?template=`), so it says so (and Undo empties the fields).
 */
export function TemplatePicker({ templates, startedFrom }: { templates: readonly TaskTemplate[]; startedFrom?: TaskTemplate }) {
  const t = useTranslations('postTask');
  const id = useId();
  const { control, getValues, setValue, clearErrors } = useFormContext<TaskDraftInput>();
  const category = useWatch({ control, name: 'categorySlug' });
  const options = templates.filter((template) => template.categorySlug === category);
  const [confirming, setConfirming] = useState<TaskTemplate | null>(null);
  const [applied, setApplied] = useState<{ template: TaskTemplate; before: Written } | null>(
    startedFrom ? { template: startedFrom, before: { title: '', description: '', details: {} } } : null,
  );
  const [undone, setUndone] = useState(false);
  if (options.length === 0) return null;

  const label = (template: TaskTemplate) => t(`templates.${template.id}.label`);
  const exampleOf = (template: TaskTemplate): Written => ({
    title: t(`templates.${template.id}.title`),
    description: t(`templates.${template.id}.description`),
    details: { ...template.details },
  });
  const written = (): Written => ({ title: getValues('title') ?? '', description: getValues('description') ?? '', details: { ...(getValues('details') ?? {}) } });
  const isEmpty = (value: Written) => !value.title.trim() && !value.description.trim() && Object.keys(compactTaskDetails(value.details ?? {})).length === 0;
  const isUntouched = (value: Written, template: TaskTemplate) => {
    const example = exampleOf(template);
    return value.title === example.title && value.description === example.description && sameDetails(value.details, example.details);
  };
  const fill = (next: Written) => {
    setValue('title', next.title, { shouldDirty: true });
    setValue('description', next.description, { shouldDirty: true });
    setValue('details', next.details, { shouldDirty: true });
    clearErrors(['title', 'description', 'details']);
  };

  function apply(template: TaskTemplate, before: Written) {
    fill(exampleOf(template));
    setConfirming(null);
    setUndone(false);
    setApplied({ template, before });
  }
  function pick(template: TaskTemplate) {
    const current = applied && !undone ? applied : null;
    if (current?.template.id === template.id) return;
    const now = written();
    // Another untouched example: switch, and Undo still goes back to what they had before any example.
    if (current && isUntouched(now, current.template)) return apply(template, current.before);
    if (isEmpty(now)) return apply(template, now);
    setConfirming(template);
  }
  function undo() {
    if (!applied) return;
    fill(applied.before);
    setApplied(null);
    setUndone(true);
  }

  const showing = applied && !undone ? applied : null;
  return <section aria-labelledby={`${id}-heading`} className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card/70 p-4 shadow-card sm:p-5 dark:border-white/[0.06]">
    <div className="space-y-1">
      <h2 id={`${id}-heading`} className="flex items-center gap-2 text-lg font-semibold"><Lightbulb aria-hidden="true" className="size-5 text-primary" />{t('templates.heading')}</h2>
      <p className="text-sm text-muted-foreground">{t('templates.hint')}</p>
    </div>
    <ul className="flex flex-wrap gap-2">
      {options.map((template) => <li key={template.id}>
        <button
          type="button"
          onClick={() => pick(template)}
          aria-pressed={showing?.template.id === template.id}
          className="inline-flex min-h-11 items-center rounded-full border border-foreground/[0.1] bg-background px-4 text-sm font-medium transition-[background-color,border-color,color,transform,box-shadow] duration-200 ease-[var(--ease-out)] hover:border-foreground/25 hover:shadow-[0_6px_16px_-10px_rgb(23_18_14/0.35)] motion-safe:hover:-translate-y-px active:translate-y-0 aria-pressed:border-primary aria-pressed:bg-primary/[0.08] aria-pressed:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-white/[0.1] dark:bg-white/[0.03]"
        >
          {label(template)}
        </button>
      </li>)}
    </ul>
    {confirming && <div role="group" aria-labelledby={`${id}-confirm`} className="space-y-3 rounded-2xl border border-primary/20 bg-primary/[0.05] p-3.5 motion-safe:animate-in fade-in-0 slide-in-from-top-1">
      <p id={`${id}-confirm`} className="text-sm font-medium">{t('templates.replaceQuestion', { example: label(confirming) })}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" onClick={() => apply(confirming, written())}>{t('templates.replace')}</Button>
        <Button type="button" className="min-h-11" variant="outline" onClick={() => setConfirming(null)}>{t('templates.keep')}</Button>
      </div>
    </div>}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {showing ? t('templates.applied', { example: label(showing.template) }) : undone ? t('templates.undone') : ''}
      </p>
      {showing && <button type="button" onClick={undo} className="-ml-1 inline-flex min-h-11 items-center rounded-md px-1 text-sm font-semibold text-primary underline underline-offset-4">{t('templates.undo')}</button>}
    </div>
  </section>;
}
