'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { CATEGORY_DETAIL_FIELDS, findTaskTemplate, TASK_DESCRIPTION_MAX, TASK_TITLE_MAX, routes, type AiTaskDraft, type PostTaskHandlers, type PostTaskPageData, type TaskDraftInput } from '@/contracts';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Textarea } from '@/ui/primitives/textarea';
import { TemplatePicker } from './template-picker';

export interface DescribeStepProps {
  data: PostTaskPageData;
  handlers: PostTaskHandlers;
  initialSuggestion?: AiTaskDraft;
  /** Draft with AI from the person's words as soon as this step shows (the landing page asked for it). */
  autoDraft?: boolean;
  /** Called when that draft starts, so it runs only once. */
  onAutoDraftStarted?: () => void;
}

export function DescribeStep({ data, handlers, initialSuggestion, autoDraft = false, onAutoDraftStarted }: DescribeStepProps) {
  const t = useTranslations('postTask');
  const errors = useTranslations('forms');
  const id = useId();
  const { register, control, getValues, setValue, formState } = useFormContext<TaskDraftInput>();
  const category = useWatch({ control, name: 'categorySlug' });
  const title = useWatch({ control, name: 'title' }) ?? '';
  const description = useWatch({ control, name: 'description' }) ?? '';
  const [text, setText] = useState(data.initialDescription ?? '');
  const [suggestion, setSuggestion] = useState(initialSuggestion);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<'unavailable' | 'rate_limited' | 'prohibited'>();
  const [notice, setNotice] = useState<'used' | 'kept'>();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const latestDraft = useRef<() => Promise<void>>(async () => {});

  async function draftWithAi() {
    if (inFlight.current || !text.trim() || !category) return;
    inFlight.current = true;
    setPending(true);
    setFailure(undefined);
    setNotice(undefined);
    try {
      const result = await handlers.onDraftWithAi({ categorySlug: category, text: text.trim() });
      if (!mounted.current || getValues('categorySlug') !== category) return;
      if (result.ok) setSuggestion(result.draft);
      else setFailure(result.code);
    } catch {
      if (mounted.current) setFailure('unavailable');
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }

  useEffect(() => {
    latestDraft.current = draftWithAi;
  });
  // The landing page's "Draft it with AI": draft once, as soon as there's a category and words (after paint, so
  // the step shows first; a timer, so a double-run effect in development doesn't draft twice).
  const canAutoDraft = autoDraft && data.aiDraftingEnabled && Boolean(category) && Boolean(text.trim());
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!canAutoDraft || autoStarted.current) return;
    const timer = window.setTimeout(() => {
      if (autoStarted.current) return;
      autoStarted.current = true;
      onAutoDraftStarted?.();
      void latestDraft.current();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canAutoDraft, onAutoDraftStarted]);

  function useSuggestion() {
    if (!suggestion) return;
    setValue('title', suggestion.title, { shouldDirty: true, shouldValidate: true });
    setValue('description', suggestion.description, { shouldDirty: true, shouldValidate: true });
    setValue('details', suggestion.details, { shouldDirty: true });
    setSuggestion(undefined);
    setNotice('used');
  }

  return <div className="space-y-6">
    {/* "Post again" already brings a whole task; everywhere else, the category's examples to start from. */}
    {!data.repeat && <TemplatePicker templates={data.templates ?? []} startedFrom={findTaskTemplate(data.initialTemplate)} />}
    <Field className="gap-2" data-invalid={!!formState.errors.title}>
      <FieldLabel htmlFor={`${id}-title`}>{t('describe.title')}</FieldLabel>
      <Input {...register('title')} id={`${id}-title`} maxLength={TASK_TITLE_MAX} aria-invalid={!!formState.errors.title} aria-describedby={`${id}-title-hint ${id}-title-count${formState.errors.title ? ` ${id}-title-error` : ''}`} />
      <div className="flex items-start justify-between gap-3">
        <FieldDescription id={`${id}-title-hint`}>{t('describe.titleHint')}</FieldDescription>
        <span id={`${id}-title-count`} className="shrink-0 text-sm tabular-nums text-muted-foreground">{t('describe.counter', { count: title.length, max: TASK_TITLE_MAX })}</span>
      </div>
      {formState.errors.title && <FieldError id={`${id}-title-error`}>{errors(`fieldErrors.${errors.has(`fieldErrors.${formState.errors.title.message}`) ? formState.errors.title.message : 'invalid'}`)}</FieldError>}
    </Field>
    <Field className="gap-2" data-invalid={!!formState.errors.description}>
      <FieldLabel htmlFor={`${id}-description`}>{t('describe.description')}</FieldLabel>
      <Textarea {...register('description')} id={`${id}-description`} rows={5} maxLength={TASK_DESCRIPTION_MAX} aria-invalid={!!formState.errors.description} aria-describedby={`${id}-description-hint ${id}-description-count${formState.errors.description ? ` ${id}-description-error` : ''}`} />
      <div className="flex items-start justify-between gap-3">
        <FieldDescription id={`${id}-description-hint`}>{t('describe.descriptionHint')}</FieldDescription>
        <span id={`${id}-description-count`} className="shrink-0 text-sm tabular-nums text-muted-foreground">{t('describe.counter', { count: description.length, max: TASK_DESCRIPTION_MAX })}</span>
      </div>
      {formState.errors.description && <FieldError id={`${id}-description-error`}>
        {errors(`fieldErrors.${errors.has(`fieldErrors.${formState.errors.description.message}`) ? formState.errors.description.message : 'invalid'}`)}
        {formState.errors.description.message === 'prohibited' && <a href={routes.legal('prohibited-tasks')} className="mt-2 flex min-h-11 items-center font-medium underline underline-offset-4">{t('describe.prohibitedLink')}</a>}
      </FieldError>}
    </Field>
    {data.aiDraftingEnabled && <section aria-labelledby={`${id}-ai-title`} className="space-y-4 rounded-[1.375rem] border border-primary/15 bg-primary/[0.04] p-4 sm:p-5 dark:border-primary/25 dark:bg-primary/[0.08]">
      <div className="space-y-2">
        <h2 id={`${id}-ai-title`} className="flex items-center gap-2 text-lg font-semibold"><Sparkles aria-hidden="true" className="size-5 text-primary" />{t('describe.aiTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('describe.aiHint')}</p>
      </div>
      <Field className="gap-2">
        <FieldLabel htmlFor={`${id}-ai-input`}>{t('describe.aiInput')}</FieldLabel>
        <Textarea id={`${id}-ai-input`} rows={3} value={text} onChange={(event) => setText(event.target.value)} disabled={pending} aria-describedby={`${id}-ai-hint`} />
        <FieldDescription id={`${id}-ai-hint`}>{t('describe.aiInputHint')}</FieldDescription>
      </Field>
      <Button type="button" variant="outline" onClick={draftWithAi} disabled={pending || !text.trim()} aria-busy={pending}>
        {pending && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
        {t(pending ? 'describe.drafting' : 'describe.draft')}
      </Button>
      {failure && <div role="alert" className="text-sm text-destructive"><p>{t(`describe.errors.${failure}`)}</p>{failure === 'prohibited' && <a href={routes.legal('prohibited-tasks')} className="flex min-h-11 items-center font-medium underline underline-offset-4">{t('describe.prohibitedLink')}</a>}</div>}
      {suggestion && <section aria-labelledby={`${id}-suggestion-title`} className="motion-safe:animate-in fade-in-0 slide-in-from-bottom-2 space-y-4 rounded-2xl border border-foreground/[0.07] dark:border-white/[0.06] bg-card p-4 shadow-card">
        <h3 id={`${id}-suggestion-title`} className="font-semibold">{t('describe.suggestion')}</h3>
        <p className="break-words font-semibold">{suggestion.title}</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{suggestion.description}</p>
        <dl className="space-y-2 text-sm">
          {CATEGORY_DETAIL_FIELDS[category]?.filter((field) => suggestion.details[field.key] !== undefined).map((field) => {
            const value = suggestion.details[field.key];
            const display = typeof value === 'boolean' ? t(value ? 'describe.yes' : 'describe.no') : field.kind === 'choice' && t.has(`details.${category}.${field.key}.options.${value}`) ? t(`details.${category}.${field.key}.options.${value}`) : String(value);
            return <div key={field.key} className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted-foreground">{t(`details.${category}.${field.key}.label`)}</dt><dd className="break-words font-medium">{display}</dd></div>;
          })}
        </dl>
        {!!suggestion.openQuestions.length && <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">{t('describe.questions')}</legend>{suggestion.openQuestions.map((question, index) => <label key={index} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />{question}</label>)}</fieldset>}
        <div className="flex flex-wrap gap-3"><Button type="button" onClick={useSuggestion}>{t('describe.use')}</Button><Button type="button" variant="outline" onClick={() => { setSuggestion(undefined); setNotice('kept'); }}>{t('describe.keep')}</Button></div>
      </section>}
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{notice ? t(`describe.${notice}`) : pending ? t('describe.drafting') : ''}</p>
    </section>}
  </div>;
}
