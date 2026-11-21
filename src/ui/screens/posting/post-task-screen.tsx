'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useWatch, type FieldErrors, type FieldPath, type DefaultValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Check, Lock, MessagesSquare, Repeat } from 'lucide-react';
import { createTaskDraftSchema, findTaskTemplate, POST_TASK_STEPS, routes, type ActionResult, type AddressSuggestion, type AiTaskDraft, type Photo, type PostTaskHandlers, type PostTaskPageData, type PostTaskStep, type TaskDraftInput } from '@/contracts';
import { BotCheckField, useBotCheck } from '@/ui/components/forms/bot-check';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { useKeepFocusAboveBar } from '@/ui/lib/keep-focus-above-bar';
import { newRequestKey } from '@/ui/lib/request-key';
import { cn } from '@/ui/lib/utils';
import { CategoryStep } from './category-step';
import { DescribeStep } from './describe-step';
import { DetailsStep } from './details-step';
import { PhotosStep } from './photos-step';
import { LocationStep } from './location-step';
import { ScheduleStep } from './schedule-step';
import { BudgetStep } from './budget-step';
import { ReviewStep } from './review-step';
import { draftStorageKey, readStoredDraft } from './draft-storage';

export interface PostTaskScreenProps {
  data: PostTaskPageData;
  handlers: PostTaskHandlers;
  /** Preview seeds; production callers only need data and handlers. */
  initialStep?: PostTaskStep;
  initialValues?: TaskDraftInput;
  initialPhotos?: Photo[];
  initialAddress?: AddressSuggestion;
  initialSuggestion?: AiTaskDraft;
  initialSuggestions?: AddressSuggestion[];
  initialResult?: ActionResult;
  /** Disable tab storage for isolated previews and tests. Defaults to true. */
  persistDraft?: boolean;
}

const stepFields: Record<PostTaskStep, FieldPath<TaskDraftInput>[]> = {
  category: ['categorySlug'], describe: ['title', 'description'], details: ['details'],
  photos: ['photoIds'], where: ['location'], when: ['schedule'], budget: ['budget', 'expenseAllowance'], review: [],
};

function stepForField(name: string): PostTaskStep | undefined {
  return POST_TASK_STEPS.find((step) => stepFields[step].some((field) => name === field || name.startsWith(`${field}.`)));
}

function resultFields(result?: ActionResult): string[] {
  return result && !result.ok ? Object.keys(result.fieldErrors ?? {}).filter((name) => result.fieldErrors?.[name]?.length) : [];
}

function firstErrorStep(names: string[]): PostTaskStep | undefined {
  return POST_TASK_STEPS.find((candidate) => names.some((name) => stepForField(name) === candidate));
}

function errorNames(errors: FieldErrors<TaskDraftInput>): string[] {
  const names: string[] = [];
  const visit = (node: unknown, prefix: string) => {
    if (!node || typeof node !== 'object') return;
    if ('message' in node || 'type' in node) { names.push(prefix); return; }
    for (const [key, value] of Object.entries(node)) if (key !== 'ref') visit(value, prefix ? `${prefix}.${key}` : key);
  };
  visit(errors, '');
  return names;
}

export function PostTaskScreen(props: PostTaskScreenProps) {
  // A different person or market starts a separate in-memory draft as well as a separate storage entry.
  return <PostTaskDraftScreen key={props.data.draftStorageKey ?? draftStorageKey(props.data.market.slug)} {...props} />;
}

function PostTaskDraftScreen({ data, handlers, initialStep, initialValues, initialPhotos = [], initialAddress, initialSuggestion, initialSuggestions, initialResult, persistDraft = true }: PostTaskScreenProps) {
  const t = useTranslations('postTask');
  const router = useRouter();
  const schema = useMemo(() => createTaskDraftSchema(data), [data]);
  // Started from an example (`?template=`): its category, words and details, on the describe step.
  const template = data.repeat ? undefined : findTaskTemplate(data.initialTemplate);
  const category = data.categories.find((item) => item.slug === (template?.categorySlug ?? data.initialCategory));
  // "Post again" starts from the earlier task's draft (plan 4.2).
  const openingValues: DefaultValues<TaskDraftInput> = initialValues ?? data.repeat?.draft ?? {
    categorySlug: template?.categorySlug ?? data.initialCategory,
    title: template ? t(`templates.${template.id}.title`) : data.initialTitle ?? '',
    description: template ? t(`templates.${template.id}.description`) : data.initialDescription ?? '',
    details: template ? { ...template.details } : {}, photoIds: [],
    location: { mode: 'local', placeId: '' }, schedule: { date: '', flexible: false },
    budget: category?.defaultPricingType === 'hourly' ? { type: 'hourly', rateCents: 0, estimatedHours: category.minHours ?? 1, hoursCap: category.minHours ?? 1 } : { type: 'fixed', priceCents: 0 },
  };
  // What the page opened with: a restored draft's reset(saved) makes the saved values the form's defaults, so "Start
  // over" (J-C9) resets to these instead.
  const opening = useRef(openingValues);
  const form = useForm<TaskDraftInput>({
    resolver: zodResolver(schema),
    defaultValues: openingValues,
    shouldFocusError: false,
  });
  const { control, reset, getValues, setError, setFocus, clearErrors, trigger, subscribe } = form;
  const values = useWatch({ control }) as TaskDraftInput;
  const [step, setStep] = useState<PostTaskStep>(
    firstErrorStep(resultFields(initialResult)) ?? initialStep ?? (data.repeat ? (data.repeat.addressDeleted ? 'where' : 'review') : template || data.initialCategory ? 'describe' : 'category'),
  );
  const [photos, setPhotos] = useState(initialPhotos);
  const [address, setAddress] = useState(initialAddress ?? data.repeat?.address);
  const [result, setResult] = useState(initialResult);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [restored, setRestored] = useState(false);
  const [restoringPhotos, setRestoringPhotos] = useState(false);
  const [photoRestoreFailed, setPhotoRestoreFailed] = useState(false);
  // "Draft it with AI" from the landing page: the describe step drafts once, the first time it shows.
  const [autoDraft, setAutoDraft] = useState(Boolean(data.autoDraft && data.aiDraftingEnabled && data.initialDescription));
  const autoDraftStarted = useCallback(() => {
    setAutoDraft(false);
    // A reload or Back must not start another draft (each one is a paid AI call and counts toward the hourly limit).
    const url = new URL(window.location.href);
    if (!url.searchParams.has('ai')) return;
    url.searchParams.delete('ai');
    window.history.replaceState(window.history.state, '', url);
  }, []);
  const [invalid, setInvalid] = useState(!!initialResult && !initialResult.ok && initialResult.code === 'validation_failed');
  const [focusField, setFocusField] = useState<string | undefined>(resultFields(initialResult).find((name) => stepForField(name) === step));
  const heading = useRef<HTMLHeadingElement>(null);
  const postButton = useRef<HTMLButtonElement>(null);
  // A field that focus reaches behind the sticky Back and Next bar, or whose hint is, comes clear of it, also when a
  // keyboard that shrinks the page opens (journeys on a phone, J-C-m).
  const formRef = useRef<HTMLFormElement>(null);
  const barRef = useRef<HTMLElement>(null);
  useKeepFocusAboveBar(formRef, barRef);
  const lock = useRef(false);
  const posted = useRef(false);
  // This post's key (bad connections pass, J-N1): kept with the draft, so a repeat after an answer that never arrived
  // returns the task the first post made. A new one after Start over, or with the next draft.
  const requestKey = useRef<string | null>(null);
  const stepRef = useRef(step);
  const addressRef = useRef(address);
  const resolvePhotos = useRef(handlers.onResolvePhotos);
  const key = data.draftStorageKey ?? draftStorageKey(data.market.slug);
  const index = POST_TASK_STEPS.indexOf(step);
  // The phone's Back and Forward move between steps (journeys on a phone, J-C9): each step the person moves on to is a
  // history entry (?step=). Only this field is given: Next copies its own tree into it, which a copy of history.state
  // would stop (its __NA marks a router write, app-router.js), and then the router keeps the address.
  const stepsPushed = useRef(0);
  const recordStep = useCallback((next: PostTaskStep, push: boolean) => {
    const url = new URL(window.location.href);
    url.searchParams.set('step', next);
    if (push) window.history.pushState({ postTaskStep: next }, '', url);
    else window.history.replaceState({ postTaskStep: next }, '', url);
  }, []);

  useEffect(() => { resolvePhotos.current = handlers.onResolvePhotos; }, [handlers.onResolvePhotos]);
  // The schema is rebuilt from `data` on every refresh (a live notice, coming back to the tab): the restore below reads
  // it through a ref, so it runs once per draft, not again over what the person did since (sweep 2026-11-20, PT9).
  const schemaRef = useRef(schema);
  useEffect(() => { schemaRef.current = schema; }, [schema]);

  useEffect(() => {
    let active = true;
    // Hydrate browser-only storage after the server and client have rendered the same defaults.
    void Promise.resolve().then(() => {
      if (!active) return;
      setRestoringPhotos(false); setPhotoRestoreFailed(false);
      if (persistDraft) {
        try {
          const raw = sessionStorage.getItem(key);
          const saved = raw ? readStoredDraft(raw) : undefined;
          if (saved) {
            const savedStep = saved.step === 'review' && !schemaRef.current.safeParse(saved.values).success ? 'category' : saved.step;
            reset(saved.values); setStep(savedStep); setAddress(saved.address); setRestored(true);
            requestKey.current = saved.requestKey ?? null;
            stepRef.current = savedStep; addressRef.current = saved.address;
            setPhotos((current) => current.filter((photo) => saved.values.photoIds.includes(photo.id)));
            const resolve = resolvePhotos.current;
            if (resolve && saved.values.photoIds.length) {
              setRestoringPhotos(true); setPhotoRestoreFailed(false);
              void Promise.resolve().then(() => resolve({ photoIds: saved.values.photoIds })).then(
                (resolved) => {
                  if (!active) return;
                  // Keep uploads added while the query was pending, and don't restore photos the person removed.
                  const currentIds = getValues('photoIds');
                  setPhotos((current) => [...current, ...resolved.filter((photo) => !current.some((item) => item.id === photo.id))].filter((photo) => currentIds.includes(photo.id)));
                  setRestoringPhotos(false);
                },
                () => { if (active) { setRestoringPhotos(false); setPhotoRestoreFailed(true); } },
              );
            }
          }
        } catch { setStorageFailed(true); }
      }
      setReady(true);
    });
    return () => { active = false; };
  }, [getValues, key, persistDraft, reset]);

  // Nothing left to load once the person removed the saved photos still loading (the query may still be under way).
  const loadingSavedPhotos = restoringPhotos && (values.photoIds ?? []).length > 0;

  const saveDraft = useCallback(() => {
    if (!persistDraft || posted.current) return;
    try {
      // Only uploaded ids are persisted for photos; no File, blob URL, or image data.
      sessionStorage.setItem(key, JSON.stringify({ values: getValues(), step: stepRef.current, address: addressRef.current, ...(requestKey.current ? { requestKey: requestKey.current } : {}) }, (_name, value: unknown) => typeof value === 'number' && !Number.isFinite(value) ? 0 : value));
    } catch { void Promise.resolve().then(() => setStorageFailed(true)); }
  }, [getValues, key, persistDraft]);

  useEffect(() => {
    stepRef.current = step; addressRef.current = address;
    if (ready) saveDraft();
  }, [step, address, ready, saveDraft]);
  useEffect(() => {
    if (!ready) return;
    return subscribe({ formState: { values: true }, callback: () => saveDraft() });
  }, [ready, subscribe, saveDraft]);

  // A field showing an error is checked again as it changes: the form only checks on Next, so a field filled after a
  // refused Next kept "Fill in this field" (the owner's screenshot, 2026-11-21). Money inputs clear their own errors.
  useEffect(() => subscribe({
    formState: { values: true },
    callback: ({ name }) => {
      if (!name) return;
      const field = name as FieldPath<TaskDraftInput>;
      const error = form.getFieldState(field).error;
      if (!error || error.type === 'money-input') return;
      void trigger(field).then(() => {
        // Emptied again: say so plainly, as Next does (the contract reports an empty text as too short).
        if ((field === 'title' || field === 'description') && !String(getValues(field) ?? '').trim()) setError(field, { type: 'required', message: 'required' });
      });
    },
  }), [form, subscribe, trigger, getValues, setError]);

  // Once the saved draft is back: this entry records its step, and Back and Forward show theirs.
  useEffect(() => {
    if (!ready) return;
    recordStep(stepRef.current, false);
    const onPopState = () => {
      const wanted = new URL(window.location.href).searchParams.get('step');
      if (!wanted || !(POST_TASK_STEPS as readonly string[]).includes(wanted)) return;
      const target = wanted as PostTaskStep;
      stepsPushed.current = POST_TASK_STEPS.indexOf(target) < POST_TASK_STEPS.indexOf(stepRef.current) ? Math.max(0, stepsPushed.current - 1) : stepsPushed.current + 1;
      setInvalid(false); setResult(undefined); setFocusField(undefined); setStep(target); heading.current?.focus();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [ready, recordStep]);

  // "Start over" from a kept draft: the page as it opened, before anything was typed.
  const startOver = useCallback(() => {
    try { sessionStorage.removeItem(key); } catch { /* Storage blocked: nothing was kept either. */ }
    requestKey.current = null;
    const fresh: PostTaskStep = data.repeat ? (data.repeat.addressDeleted ? 'where' : 'review') : template || data.initialCategory ? 'describe' : 'category';
    reset(opening.current); setPhotos([]); setAddress(data.repeat?.address); setResult(undefined); setInvalid(false); setFocusField(undefined); setRestored(false);
    setStep(fresh); stepRef.current = fresh; stepsPushed.current = 0; recordStep(fresh, false);
    heading.current?.focus();
  }, [key, reset, recordStep, data.repeat, data.initialCategory, template]);

  useEffect(() => {
    if (!form.formState.isDirty) return;
    const confirmLeave = (event: BeforeUnloadEvent) => { if (!posted.current) event.preventDefault(); };
    window.addEventListener('beforeunload', confirmLeave);
    return () => window.removeEventListener('beforeunload', confirmLeave);
  }, [form.formState.isDirty]);

  const showErrors = useCallback((names: string[]) => {
    const firstStep = firstErrorStep(names);
    if (firstStep) {
      setStep(firstStep);
      recordStep(firstStep, false);
      setFocusField(names.find((name) => stepForField(name) === firstStep));
    }
    setInvalid(true);
  }, [recordStep]);

  useEffect(() => {
    if (!result || result.ok || !result.fieldErrors) return;
    const names = Object.keys(result.fieldErrors).filter((name) => stepForField(name) && result.fieldErrors?.[name]?.length);
    for (const name of names) setError(name as FieldPath<TaskDraftInput>, { type: 'server', message: result.fieldErrors[name]![0] });
  }, [result, step, setError]);

  useEffect(() => {
    if (!focusField) return;
    setFocus(focusField as FieldPath<TaskDraftInput>);
  }, [step, focusField, setFocus]);

  async function nextStep() {
    if (lock.current || uploading) return;
    lock.current = true; setChecking(true); setInvalid(false); setResult(undefined); setFocusField(undefined);
    const fields = stepFields[step];
    const moneyErrors = errorNames(form.formState.errors).filter((name) => form.getFieldState(name as FieldPath<TaskDraftInput>).error?.type === 'money-input');
    if (step === 'budget' && moneyErrors.length) {
      showErrors(moneyErrors); lock.current = false; setChecking(false); return;
    }
    const valid = await trigger(fields);
    // The contract reports empty strings as too_short. Present an empty required field plainly.
    const empty = step === 'describe' ? (['title', 'description'] as const).filter((name) => !getValues(name).trim()) : [];
    for (const name of empty) setError(name, { type: 'required', message: 'required' });
    if (valid && !empty.length) {
      const following = POST_TASK_STEPS[index + 1] ?? 'review';
      setStep(following); recordStep(following, true); stepsPushed.current += 1;
      heading.current?.focus();
    } else {
      const errors = fields.flatMap((name) => errorNames({ [name]: form.getFieldState(name).error } as FieldErrors<TaskDraftInput>));
      showErrors(empty.length ? [...empty] : errors.length ? errors : fields);
    }
    lock.current = false; setChecking(false);
  }

  // The bot check before "Post": its answer goes with the task, and a turned-down check shows by the widget.
  const check = useBotCheck(data.botCheck, 'post_task');

  async function post(valuesToPost: TaskDraftInput) {
    if (lock.current || posted.current) return;
    lock.current = true; setPending(true); setResult(undefined); setInvalid(false); clearErrors();
    let next: ActionResult;
    // The key goes into the stored draft before the post leaves, so even a reload after a lost answer repeats it.
    requestKey.current ??= newRequestKey();
    saveDraft();
    // "Ask for help" (plan 9.10): the post it started from, so the post and the new task link to each other.
    try { next = await handlers.onPost({ ...valuesToPost, requestKey: requestKey.current, ...(check.token ? { botCheck: check.token } : {}), ...(data.fromPost ? { fromPostId: data.fromPost.id } : {}) }); }
    catch { next = { ok: false, code: 'unknown' }; }
    if (next.ok) {
      posted.current = true;
      if (persistDraft) { try { sessionStorage.removeItem(key); } catch { setStorageFailed(true); } }
    } else check.reset();
    setResult(next); setPending(false); lock.current = false;
    if (!next.ok && next.code === 'validation_failed' && !next.fieldErrors?.botCheck) showErrors(resultFields(next));
    if (next.ok && next.redirectTo) router.push(next.redirectTo);
  }

  const hasProhibited = !result?.ok && Object.values(result?.fieldErrors ?? {}).some((codes) => codes?.includes('prohibited'));
  const botCheckRefused = Boolean(result && !result.ok && result.fieldErrors?.botCheck);
  const unknownFieldFailure = !botCheckRefused && result && !result.ok && result.code === 'validation_failed' && !resultFields(result).some((name) => stepForField(name));
  return <FormProvider {...form}>
    <form ref={formRef} noValidate aria-label={t('title')} aria-busy={pending} className="mx-auto flex min-h-[70dvh] w-full max-w-reading flex-col gap-6" onSubmit={(event) => {
      event.preventDefault();
      if (step !== 'review') { void nextStep(); return; }
      // A late Next click or a submit without the review button must never post.
      if (!postButton.current || (event.nativeEvent as SubmitEvent).submitter !== postButton.current) return;
      void form.handleSubmit(post, (errors) => showErrors(errorNames(errors)))(event);
    }}>
      <header className="space-y-3">
        <p aria-live="polite" aria-atomic="true" className="text-sm font-medium text-primary">{t('progress', { current: index + 1, total: POST_TASK_STEPS.length, step: t(`steps.${step}`) })}</p>
        <h1 ref={heading} tabIndex={-1} className="font-heading text-2xl font-bold outline-none md:text-3xl">{t('title')}</h1>
        {/* The intro on the first step only: after that, every step's form starts right under the progress. */}
        {index === 0 && <p className="text-muted-foreground">{t('intro')}</p>}
        <ol aria-label={t('navigation')} className="grid grid-cols-8 gap-1.5">
          {POST_TASK_STEPS.map((item, itemIndex) => <li key={item} aria-current={item === step ? 'step' : undefined} className="min-w-0">
            <span className={cn('block h-1.5 rounded-full transition-colors duration-500 ease-[var(--ease-out)]', itemIndex < index ? 'bg-primary/70' : itemIndex === index ? 'bg-primary' : 'bg-foreground/[0.08] dark:bg-white/[0.1]')} />
            <span className="sr-only">{t(`steps.${item}`)}</span>
          </li>)}
        </ol>
        <div aria-live="polite" className="text-xs text-muted-foreground">{storageFailed ? t('storageUnavailable') : restored ? null : t('saved')}</div>
        {/* A draft kept from earlier says so, with the way to a fresh start (J-C9). */}
        {restored && !storageFailed && <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-secondary/70 px-3 py-2 text-sm text-foreground dark:bg-secondary/40">
          <span>{t('keptDraft')}</span>
          <button type="button" onClick={startOver} disabled={pending || uploading} className="inline-flex min-h-11 items-center rounded-sm font-medium text-primary underline underline-offset-4 disabled:opacity-50">{t('startOver')}</button>
        </p>}
      </header>
      {data.fromPost && <p className="flex items-start gap-2.5 rounded-2xl border border-primary/20 bg-primary/[0.06] p-3.5 text-sm">
        <MessagesSquare aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>{t('fromPost', { title: data.fromPost.title })}</span>
      </p>}
      {data.repeat && <p className="flex items-start gap-2.5 rounded-2xl border border-primary/20 bg-primary/[0.06] p-3.5 text-sm">
        <Repeat aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>{t(data.repeat.addressDeleted ? 'repeat.addressDeleted' : 'repeat.ready', { title: data.repeat.fromTitle })}</span>
      </p>}
      <div role="status" aria-live="polite" className={loadingSavedPhotos || photoRestoreFailed ? 'flex items-center gap-2 text-sm text-muted-foreground' : 'sr-only'}>
        {loadingSavedPhotos ? <><Spinner />{t('photos.loadingSaved')}</> : photoRestoreFailed ? t('photos.restoreFailed') : ''}
      </div>
      {!botCheckRefused && <FormFeedback result={unknownFieldFailure ? { ...result, fieldErrors: undefined } : result} />}
      {invalid && !unknownFieldFailure && <p role="alert" className="text-sm text-destructive">{t('checkFields')}</p>}
      {hasProhibited && <Link href={routes.legal('prohibited-tasks')} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{t('prohibitedLink')}</Link>}
      <fieldset disabled={pending || !!result?.ok} className="min-w-0 flex-1 space-y-6">
        <legend className="sr-only">{t(`steps.${step}`)}</legend>
        {step === 'category' && <CategoryStep data={data} />}
        {step === 'describe' && <DescribeStep data={data} handlers={handlers} initialSuggestion={initialSuggestion} autoDraft={autoDraft} onAutoDraftStarted={autoDraftStarted} />}
        {step === 'details' && values.categorySlug && <DetailsStep category={values.categorySlug} />}
        {step === 'photos' && <PhotosStep data={data} handlers={handlers} photos={photos} onPhotosChange={setPhotos} onBusyChange={setUploading} />}
        {step === 'where' && <LocationStep data={data} handlers={handlers} selectedAddress={address} onAddressChange={setAddress} initialSuggestions={initialSuggestions} />}
        {step === 'when' && <ScheduleStep data={data} />}
        {step === 'budget' && <BudgetStep data={data} />}
        {step === 'review' && <ReviewStep data={data} handlers={handlers} values={values} photos={photos} selectedAddress={address} />}
        {step === 'review' && data.botCheck && <BotCheckField check={check} result={result} />}
      </fieldset>
      <footer ref={barRef} className="app-glass sticky bottom-app-navigation z-20 -mx-4 mt-2 flex items-center gap-3 border-t border-foreground/[0.07] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-white/[0.06]">
        <Button type="button" variant="outline" disabled={index === 0 || pending || checking || uploading || !!result?.ok} onClick={() => {
          // Back through history when this wizard went forward, so this button and the phone's Back agree (J-C9).
          if (stepsPushed.current > 0) { window.history.back(); return; }
          const previous = POST_TASK_STEPS[index - 1]!;
          setInvalid(false); setResult(undefined); setFocusField(undefined); setStep(previous); recordStep(previous, false); heading.current?.focus();
        }}><ArrowLeft aria-hidden="true" />{t('back')}</Button>
        <span className="hidden flex-1 items-center gap-2 text-sm text-muted-foreground sm:flex"><Lock aria-hidden="true" className="size-4" />{t('steps.review')}</span>
        {step === 'review' ? <Button key="post" ref={postButton} type="submit" className="ml-auto" disabled={pending || !!result?.ok} aria-busy={pending}>{pending ? <Spinner /> : <Check aria-hidden="true" />}{t(pending ? 'posting' : 'post')}</Button> : <Button key="next" type="button" className="ml-auto" onClick={(event) => { event.preventDefault(); void nextStep(); }} disabled={checking || uploading} aria-busy={checking}>{checking ? <Spinner /> : <ArrowRight aria-hidden="true" />}{t(checking ? 'checking' : 'next')}</Button>}
      </footer>
    </form>
  </FormProvider>;
}
