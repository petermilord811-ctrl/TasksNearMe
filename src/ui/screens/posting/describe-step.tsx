'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Check, LoaderCircle, Sparkles, Undo2 } from 'lucide-react';
import { findTaskTemplate, TASK_DESCRIPTION_MAX, TASK_TITLE_MAX, routes, type AiTaskDraft, type PostTaskHandlers, type PostTaskPageData, type TaskDetailsValue, type TaskDraftInput } from '@/contracts';
import { RichTextEditor } from '@/ui/components/rich-text/rich-text-editor';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { TemplatePicker } from './template-picker';

export interface DescribeStepProps {
  data: PostTaskPageData;
  handlers: PostTaskHandlers;
  /** Preview seed: a rewrite that has just come back (shown as applied, with Undo). */
  initialSuggestion?: AiTaskDraft;
  /** Rewrite the person's words with AI as soon as this step shows (the landing page asked for it). */
  autoDraft?: boolean;
  /** Called when that rewrite starts, so it runs only once. */
  onAutoDraftStarted?: () => void;
}

/** What a rewrite replaced, for Undo, and what it offers besides the text. */
interface Rewrite {
  before: { title: string; description: string; details: TaskDetailsValue };
  /** The text it wrote: once the person changes it, Undo would throw their changes away, so it goes. */
  text: string;
  /** A title the AI suggests when the person already has one of their own. */
  suggestedTitle?: string;
  questions: string[];
}

/** "Help me describe this" (blueprint 02 J1 step 2) and the description are one field: AI rewrites it in place. */
export function DescribeStep({ data, handlers, initialSuggestion, autoDraft = false, onAutoDraftStarted }: DescribeStepProps) {
  const t = useTranslations('postTask');
  const errors = useTranslations('forms');
  const id = useId();
  const { register, control, getValues, setValue, formState } = useFormContext<TaskDraftInput>();
  const category = useWatch({ control, name: 'categorySlug' });
  const title = useWatch({ control, name: 'title' }) ?? '';
  const description = useWatch({ control, name: 'description' }) ?? '';
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<'unavailable' | 'rate_limited' | 'prohibited'>();
  const [rewrite, setRewrite] = useState<Rewrite>();
  const [notice, setNotice] = useState<'rewritten' | 'undone' | 'titleUsed'>();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const latestRewrite = useRef<() => Promise<void>>(async () => {});
  const words = description.trim();
  const canRewrite = data.aiDraftingEnabled && Boolean(category) && words.length >= 3;

  /** The rewrite in the form: the text, a title when there's none yet, the details it found; Undo keeps what was there. */
  function applyRewrite(draft: AiTaskDraft) {
    const before = { title: getValues('title') ?? '', description: getValues('description') ?? '', details: { ...(getValues('details') as TaskDetailsValue) } };
    const keepTitle = before.title.trim().length >= 8;
    const validate = { shouldDirty: true, shouldValidate: Boolean(formState.errors.description || formState.errors.title) };
    setValue('description', draft.description, validate);
    if (!keepTitle) setValue('title', draft.title, validate);
    setValue('details', { ...before.details, ...draft.details }, { shouldDirty: true });
    setRewrite({ before, text: draft.description, ...(keepTitle && draft.title.trim() !== before.title.trim() ? { suggestedTitle: draft.title } : {}), questions: draft.openQuestions });
    setNotice('rewritten');
  }

  async function rewriteWithAi() {
    const text = (getValues('description') ?? '').trim();
    if (inFlight.current || text.length < 3 || !category) return;
    inFlight.current = true;
    setPending(true);
    setFailure(undefined);
    setNotice(undefined);
    try {
      const result = await handlers.onDraftWithAi({ categorySlug: category, text });
      // A changed category, or words typed meanwhile, win over a late answer.
      if (!mounted.current || getValues('categorySlug') !== category || (getValues('description') ?? '').trim() !== text) return;
      if (result.ok) applyRewrite(result.draft);
      else setFailure(result.code);
    } catch {
      if (mounted.current) setFailure('unavailable');
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }

  function undo() {
    if (!rewrite) return;
    const validate = { shouldDirty: true, shouldValidate: Boolean(formState.errors.description || formState.errors.title) };
    setValue('description', rewrite.before.description, validate);
    setValue('title', rewrite.before.title, validate);
    setValue('details', rewrite.before.details, { shouldDirty: true });
    setRewrite(undefined);
    setNotice('undone');
  }

  function takeSuggestedTitle() {
    if (!rewrite?.suggestedTitle) return;
    setValue('title', rewrite.suggestedTitle, { shouldDirty: true, shouldValidate: Boolean(formState.errors.title) });
    setRewrite({ ...rewrite, suggestedTitle: undefined });
    setNotice('titleUsed');
  }

  useEffect(() => {
    latestRewrite.current = rewriteWithAi;
  });
  // The landing page's "Draft it with AI": rewrite once, as soon as there's a category and words (after paint, so the
  // step shows first; a timer, so a double-run effect in development doesn't rewrite twice).
  const canAutoDraft = autoDraft && canRewrite;
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!canAutoDraft || autoStarted.current) return;
    const timer = window.setTimeout(() => {
      if (autoStarted.current) return;
      autoStarted.current = true;
      onAutoDraftStarted?.();
      void latestRewrite.current();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canAutoDraft, onAutoDraftStarted]);
  // Previews: a rewrite that has just come back.
  const seeded = useRef(false);
  useEffect(() => {
    if (!initialSuggestion || seeded.current) return;
    seeded.current = true;
    applyRewrite(initialSuggestion);
  });

  const canUndo = Boolean(rewrite) && description === rewrite?.text;
  const descriptionError = formState.errors.description;
  // The field's own hint and count (the AI hint describes its button): on a phone with the keyboard open, all of what
  // describes the field has to fit above the Back and Next bar (focus-not-obscured.spec).
  const describedBy = [`${id}-description-hint`, `${id}-description-count`, descriptionError ? `${id}-description-error` : ''].filter(Boolean).join(' ');

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
      {rewrite?.suggestedTitle && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-primary/[0.05] px-3 py-1 text-sm dark:bg-primary/[0.1]">
        <span className="min-w-0 flex-1 break-words py-2"><Sparkles aria-hidden="true" className="mr-1.5 inline size-4 align-[-3px] text-primary" />{t('describe.suggestedTitle', { title: rewrite.suggestedTitle })}</span>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 text-primary" onClick={takeSuggestedTitle}>{t('describe.useTitle')}</Button>
      </div>}
    </Field>
    <Field className="gap-2" data-invalid={!!descriptionError}>
      <FieldLabel htmlFor={`${id}-description`}>{t('describe.description')}</FieldLabel>
      <Controller name="description" control={control} render={({ field }) => <RichTextEditor
        id={`${id}-description`}
        name={field.name}
        value={field.value ?? ''}
        onChange={field.onChange}
        onBlur={field.onBlur}
        textareaRef={field.ref}
        maxLength={TASK_DESCRIPTION_MAX}
        readOnly={pending}
        invalid={!!descriptionError}
        describedBy={describedBy}
        previewHeadingLevel={3}
        labels={{ toolbar: t('describe.editor.toolbar'), bold: t('describe.editor.bold'), italic: t('describe.editor.italic'), heading: t('describe.editor.heading'), bullets: t('describe.editor.bullets'), numbers: t('describe.editor.numbers'), preview: t('describe.editor.preview'), emptyPreview: t('describe.editor.emptyPreview') }}
        footerStart={data.aiDraftingEnabled ? <Button type="button" variant="ghost" size="sm" className="min-h-11 gap-2 rounded-full px-3 font-semibold text-primary hover:bg-primary/[0.07] hover:text-primary" onClick={() => void rewriteWithAi()} disabled={pending || !canRewrite} aria-busy={pending} aria-describedby={`${id}-ai-hint`}>
          {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <Sparkles aria-hidden="true" className="size-4" />}
          {t(pending ? 'describe.rewriting' : 'describe.rewrite')}
        </Button> : undefined}
        footerEnd={<span id={`${id}-description-count`} className="text-sm tabular-nums text-muted-foreground">{t('describe.counter', { count: description.length, max: TASK_DESCRIPTION_MAX })}</span>}
      />} />
      <FieldDescription id={`${id}-description-hint`}>{t('describe.descriptionHint')}</FieldDescription>
      {data.aiDraftingEnabled && <FieldDescription id={`${id}-ai-hint`}>{t('describe.aiHint')}</FieldDescription>}
      {descriptionError && <FieldError id={`${id}-description-error`}>
        {errors(`fieldErrors.${errors.has(`fieldErrors.${descriptionError.message}`) ? descriptionError.message : 'invalid'}`)}
        {descriptionError.message === 'prohibited' && <a href={routes.legal('prohibited-tasks')} className="mt-2 flex min-h-11 items-center font-medium underline underline-offset-4">{t('describe.prohibitedLink')}</a>}
      </FieldError>}
      {failure && <div role="alert" className="text-sm text-destructive"><p>{t(`describe.errors.${failure}`)}</p>{failure === 'prohibited' && <a href={routes.legal('prohibited-tasks')} className="flex min-h-11 items-center font-medium underline underline-offset-4">{t('describe.prohibitedLink')}</a>}</div>}
      {rewrite && <div className="motion-safe:animate-in fade-in-0 slide-in-from-top-1 space-y-2 rounded-2xl border border-primary/15 bg-primary/[0.04] p-3 sm:p-4 dark:border-primary/25 dark:bg-primary/[0.08]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="flex min-w-0 flex-1 items-start gap-2 text-sm font-medium"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{t('describe.rewrittenNote')}</p>
          {canUndo && <Button type="button" variant="outline" size="sm" className="min-h-11 gap-1.5" onClick={undo}><Undo2 aria-hidden="true" className="size-4" />{t('describe.undo')}</Button>}
        </div>
        {!!rewrite.questions.length && <fieldset className="space-y-1"><legend className="mb-1 text-sm font-semibold">{t('describe.questions')}</legend>{rewrite.questions.map((question, index) => <label key={index} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />{question}</label>)}</fieldset>}
      </div>}
      <p role="status" aria-live="polite" className="sr-only">{pending ? t('describe.rewriting') : notice ? t(`describe.${notice}`) : ''}</p>
    </Field>
  </div>;
}
