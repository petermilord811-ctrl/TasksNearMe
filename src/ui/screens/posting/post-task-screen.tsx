'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useWatch, type FieldErrors, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Check, Lock, Repeat } from 'lucide-react';
import { createTaskDraftSchema, POST_TASK_STEPS, routes, type ActionResult, type AddressSuggestion, type AiTaskDraft, type Photo, type PostTaskHandlers, type PostTaskPageData, type PostTaskStep, type TaskDraftInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
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
  const category = data.categories.find((item) => item.slug === data.initialCategory);
  const form = useForm<TaskDraftInput>({
    resolver: zodResolver(schema),
    // "Post again" starts from the earlier task's draft (plan 4.2).
    defaultValues: initialValues ?? data.repeat?.draft ?? {
      categorySlug: data.initialCategory,
      title: data.initialTitle ?? '', description: data.initialDescription ?? '', details: {}, photoIds: [],
      location: { mode: 'local', placeId: '' }, schedule: { date: '', flexible: false },
      budget: category?.defaultPricingType === 'hourly' ? { type: 'hourly', rateCents: 0, estimatedHours: category.minHours ?? 1, hoursCap: category.minHours ?? 1 } : { type: 'fixed', priceCents: 0 },
    },
    shouldFocusError: false,
  });
  const { control, reset, getValues, setError, setFocus, clearErrors, trigger, subscribe } = form;
  const values = useWatch({ control }) as TaskDraftInput;
  const [step, setStep] = useState<PostTaskStep>(
    firstErrorStep(resultFields(initialResult)) ?? initialStep ?? (data.repeat ? (data.repeat.addressDeleted ? 'where' : 'review') : data.initialCategory ? 'describe' : 'category'),
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
  const lock = useRef(false);
  const posted = useRef(false);
  const stepRef = useRef(step);
  const addressRef = useRef(address);
  const resolvePhotos = useRef(handlers.onResolvePhotos);
  const key = data.draftStorageKey ?? draftStorageKey(data.market.slug);
  const index = POST_TASK_STEPS.indexOf(step);

  useEffect(() => { resolvePhotos.current = handlers.onResolvePhotos; }, [handlers.onResolvePhotos]);

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
            const savedStep = saved.step === 'review' && !schema.safeParse(saved.values).success ? 'category' : saved.step;
            reset(saved.values); setStep(savedStep); setAddress(saved.address); setRestored(true);
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
  }, [getValues, key, persistDraft, reset, schema]);

  const saveDraft = useCallback(() => {
    if (!persistDraft || posted.current) return;
    try {
      // Only uploaded ids are persisted for photos; no File, blob URL, or image data.
      sessionStorage.setItem(key, JSON.stringify({ values: getValues(), step: stepRef.current, address: addressRef.current }, (_name, value: unknown) => typeof value === 'number' && !Number.isFinite(value) ? 0 : value));
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
      setFocusField(names.find((name) => stepForField(name) === firstStep));
    }
    setInvalid(true);
  }, []);

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
      setStep(POST_TASK_STEPS[index + 1] ?? 'review');
      heading.current?.focus();
    } else {
      const errors = fields.flatMap((name) => errorNames({ [name]: form.getFieldState(name).error } as FieldErrors<TaskDraftInput>));
      showErrors(empty.length ? [...empty] : errors.length ? errors : fields);
    }
    lock.current = false; setChecking(false);
  }

  async function post(valuesToPost: TaskDraftInput) {
    if (lock.current || posted.current) return;
    lock.current = true; setPending(true); setResult(undefined); setInvalid(false); clearErrors();
    let next: ActionResult;
    try { next = await handlers.onPost(valuesToPost); }
    catch { next = { ok: false, code: 'unknown' }; }
    if (next.ok) {
      posted.current = true;
      if (persistDraft) { try { sessionStorage.removeItem(key); } catch { setStorageFailed(true); } }
    }
    setResult(next); setPending(false); lock.current = false;
    if (!next.ok && next.code === 'validation_failed') showErrors(resultFields(next));
    if (next.ok && next.redirectTo) router.push(next.redirectTo);
  }

  const hasProhibited = !result?.ok && Object.values(result?.fieldErrors ?? {}).some((codes) => codes?.includes('prohibited'));
  const unknownFieldFailure = result && !result.ok && result.code === 'validation_failed' && !resultFields(result).some((name) => stepForField(name));
  return <FormProvider {...form}>
    <form noValidate aria-label={t('title')} aria-busy={pending} className="mx-auto flex min-h-[70dvh] w-full max-w-reading flex-col gap-6" onSubmit={(event) => {
      event.preventDefault();
      if (step !== 'review') { void nextStep(); return; }
      // A late Next click or a submit without the review button must never post.
      if (!postButton.current || (event.nativeEvent as SubmitEvent).submitter !== postButton.current) return;
      void form.handleSubmit(post, (errors) => showErrors(errorNames(errors)))(event);
    }}>
      <header className="space-y-3">
        <p aria-live="polite" aria-atomic="true" className="text-sm font-medium text-primary">{t('progress', { current: index + 1, total: POST_TASK_STEPS.length, step: t(`steps.${step}`) })}</p>
        <h1 ref={heading} tabIndex={-1} className="font-heading text-2xl font-bold outline-none md:text-3xl">{t('title')}</h1>
        <p className="text-muted-foreground">{t('intro')}</p>
        <ol aria-label={t('navigation')} className="grid grid-cols-8 gap-1.5">
          {POST_TASK_STEPS.map((item, itemIndex) => <li key={item} aria-current={item === step ? 'step' : undefined} className="min-w-0">
            <span className={cn('block h-1.5 rounded-full bg-foreground/[0.08] transition-colors duration-500 ease-[var(--ease-out)] dark:bg-white/[0.1]', itemIndex < index && 'bg-primary/70', itemIndex === index && 'bg-primary')} />
            <span className="sr-only">{t(`steps.${item}`)}</span>
          </li>)}
        </ol>
      </header>
      {data.repeat && <p className="flex items-start gap-2.5 rounded-2xl border border-primary/20 bg-primary/[0.06] p-3.5 text-sm">
        <Repeat aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>{t(data.repeat.addressDeleted ? 'repeat.addressDeleted' : 'repeat.ready', { title: data.repeat.fromTitle })}</span>
      </p>}
      <div aria-live="polite" className="text-sm text-muted-foreground">{storageFailed ? t('storageUnavailable') : restored ? t('restored') : t('saved')}</div>
      <div role="status" aria-live="polite" className={restoringPhotos || photoRestoreFailed ? 'flex items-center gap-2 text-sm text-muted-foreground' : 'sr-only'}>
        {restoringPhotos ? <><Spinner />{t('photos.loadingSaved')}</> : photoRestoreFailed ? t('photos.restoreFailed') : ''}
      </div>
      <FormFeedback result={unknownFieldFailure ? { ...result, fieldErrors: undefined } : result} />
      {invalid && !unknownFieldFailure && <p role="alert" className="text-sm text-destructive">{t('checkFields')}</p>}
      {hasProhibited && <Link href={routes.legal('prohibited-tasks')} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{t('prohibitedLink')}</Link>}
      <fieldset disabled={pending || !!result?.ok} className="min-w-0 flex-1 space-y-6">
        <legend className="mb-5 font-heading text-xl font-semibold">{t(`steps.${step}`)}</legend>
        {step === 'category' && <CategoryStep data={data} />}
        {step === 'describe' && <DescribeStep data={data} handlers={handlers} initialSuggestion={initialSuggestion} autoDraft={autoDraft} onAutoDraftStarted={autoDraftStarted} />}
        {step === 'details' && values.categorySlug && <DetailsStep category={values.categorySlug} />}
        {step === 'photos' && <PhotosStep data={data} handlers={handlers} photos={photos} onPhotosChange={setPhotos} onBusyChange={setUploading} />}
        {step === 'where' && <LocationStep data={data} handlers={handlers} selectedAddress={address} onAddressChange={setAddress} initialSuggestions={initialSuggestions} />}
        {step === 'when' && <ScheduleStep data={data} />}
        {step === 'budget' && <BudgetStep data={data} />}
        {step === 'review' && <ReviewStep data={data} handlers={handlers} values={values} photos={photos} selectedAddress={address} />}
      </fieldset>
      <footer className="app-glass sticky bottom-app-navigation z-20 -mx-4 mt-2 flex items-center gap-3 border-t border-foreground/[0.07] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-white/[0.06]">
        <Button type="button" variant="outline" disabled={index === 0 || pending || checking || uploading || !!result?.ok} onClick={() => { setInvalid(false); setResult(undefined); setFocusField(undefined); setStep(POST_TASK_STEPS[index - 1]!); heading.current?.focus(); }}><ArrowLeft aria-hidden="true" />{t('back')}</Button>
        <span className="hidden flex-1 items-center gap-2 text-sm text-muted-foreground sm:flex"><Lock aria-hidden="true" className="size-4" />{t('steps.review')}</span>
        {step === 'review' ? <Button key="post" ref={postButton} type="submit" className="ml-auto" disabled={pending || !!result?.ok} aria-busy={pending}>{pending ? <Spinner /> : <Check aria-hidden="true" />}{t(pending ? 'posting' : 'post')}</Button> : <Button key="next" type="button" className="ml-auto" onClick={(event) => { event.preventDefault(); void nextStep(); }} disabled={checking || uploading} aria-busy={checking}>{checking ? <Spinner /> : <ArrowRight aria-hidden="true" />}{t(checking ? 'checking' : 'next')}</Button>}
      </footer>
    </form>
  </FormProvider>;
}
