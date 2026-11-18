'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, useWatch, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleAlert, CloudCheck, Eye } from 'lucide-react';
import {
  createHelperServicesSchema, helperAreaInputSchema, helperProfileInputSchema, routes,
  type ActionResult, type HelperAreaInput, type HelperOnboardingHandlers, type HelperOnboardingPageData, type HelperProfileInput,
  type HelperServicesInput, type OnboardingStep,
} from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { ProfilePhotoField } from '@/ui/components/forms/profile-photo-field';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { cn } from '@/ui/lib/utils';
import { AreaFields, ProfileDraftPanel, ProfileFields } from './helper-forms';
import { ProfileCardPreview } from './profile-card-preview';
import { ExamplesPanel } from './setup-examples';
import { SetupServices } from './setup-services';

/** The profile's three parts, in the order setup asks for them (plan 9.11). */
export const SETUP_PARTS = ['services', 'area', 'about'] as const;
export type SetupPart = (typeof SETUP_PARTS)[number];
/** Each part's onboarding step (its address). */
const STEP_OF: Record<SetupPart, OnboardingStep> = { services: 'services', area: 'area', about: 'profile' };
const PART_OF: Partial<Record<OnboardingStep, SetupPart>> = { services: 'services', area: 'area', profile: 'about' };
const AUTOSAVE_MS = 1500;
const SETUP_PATH = /\/app\/helper\/onboarding\/(profile|services|area)$/;

type Status = 'idle' | 'saving' | 'saved' | 'unsaved' | 'invalid' | 'agreement' | 'failed';

/** The part a page opens: its own, or for `profile` the first part not saved yet (Introduce yourself once all are). */
export function startingPart(data: Pick<HelperOnboardingPageData, 'step' | 'progress'>): SetupPart {
  if (data.step === 'services' || data.step === 'area') return data.step;
  const saved = savedParts(data);
  return SETUP_PARTS.find((part) => !saved[part]) ?? 'about';
}

function savedParts(data: Pick<HelperOnboardingPageData, 'progress'>): Record<SetupPart, boolean> {
  const done = (step: OnboardingStep) => data.progress.steps.some((entry) => entry.step === step && entry.state === 'done');
  return { services: done('services'), area: done('area'), about: done('profile') };
}

/**
 * Text typed and not saved yet, kept in this tab (not shared across accounts on the device), per part, with the saved
 * values it was typed over: it comes back only on top of those same saved values, never over newer ones.
 */
interface Draft<T> { values: T; base: string }
interface Unsaved { services?: Draft<HelperServicesInput>; area?: Draft<HelperAreaInput>; about?: Draft<HelperProfileInput> }
const storageKey = (person: HelperOnboardingPageData['person']) => `tnm:helper-setup:${person.displayName}`;
function readUnsaved(key: string): Unsaved {
  try {
    return JSON.parse(window.sessionStorage.getItem(key) ?? '{}') as Unsaved;
  } catch {
    return {};
  }
}
function writeUnsaved(key: string, change: (current: Unsaved) => Unsaved) {
  try {
    const next = change(readUnsaved(key));
    if (Object.keys(next).length === 0) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage off (private mode): the parts still save as they go.
  }
}

/** Puts the server's field errors on the part's fields, focusing the first. */
function showFieldErrors<T extends FieldValues>(form: UseFormReturn<T>, result: ActionResult) {
  if (result.ok || !result.fieldErrors) return;
  let first = true;
  for (const [name, codes] of Object.entries(result.fieldErrors)) {
    const code = codes?.[0];
    if (!code) continue;
    form.setError(name as Path<T>, { type: 'server', message: code }, { shouldFocus: first });
    first = false;
  }
}

/**
 * Helper setup's profile in one flow (plan 9.11): What you do, Where you help and Introduce yourself, one part at a time,
 * with Back and Next that keep everything typed. A part saves itself a moment after typing stops once it's valid, and
 * on Next; text not saved yet stays in this tab across a reload. Save and continue goes on to the checks.
 */
export function HelperProfileSetup({ data, handlers }: { data: HelperOnboardingPageData; handlers: HelperOnboardingHandlers }) {
  const t = useTranslations('helperOnboarding.setup');
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const key = storageKey(data.person);

  const [part, setPart] = useState<SetupPart>(() => startingPart(data));
  const [saved, setSaved] = useState(() => savedParts(data));
  const [status, setStatus] = useState<Status>('idle');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult>();
  const [notice, setNotice] = useState<'restored' | { finishFirst: SetupPart } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const services = useForm<HelperServicesInput>({ resolver: zodResolver(createHelperServicesSchema(data.categories)), defaultValues: data.values.services });
  const area = useForm<HelperAreaInput>({ resolver: zodResolver(helperAreaInputSchema), defaultValues: { where: 'market', homeZip: '', homeCity: '', ...data.values.area } });
  const about = useForm<HelperProfileInput>({ resolver: zodResolver(helperProfileInputSchema), defaultValues: data.values.profile });
  const forms = { services, area, about } as const;

  // What each part last saved, to save only what changed.
  const lastSaved = useRef<Record<SetupPart, string>>({ services: JSON.stringify(data.values.services), area: JSON.stringify({ where: 'market', homeZip: '', homeCity: '', ...data.values.area }), about: JSON.stringify(data.values.profile) });
  const inFlight = useRef<Partial<Record<SetupPart, Promise<ActionResult | null>>>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const servicesValues = useWatch({ control: services.control });
  const areaValues = useWatch({ control: area.control });
  const aboutValues = useWatch({ control: about.control });
  const valuesOf = (which: SetupPart) => forms[which].getValues() as HelperServicesInput | HelperAreaInput | HelperProfileInput;
  const changed = (which: SetupPart) => JSON.stringify(valuesOf(which)) !== lastSaved.current[which];

  // Text typed and not saved before a reload comes back once, after the page has hydrated.
  useEffect(() => {
    const unsaved = readUnsaved(key);
    const fits = (which: SetupPart) => unsaved[which] !== undefined && unsaved[which]!.base === lastSaved.current[which];
    if (fits('services')) services.reset(unsaved.services!.values, { keepDefaultValues: true });
    if (fits('area')) area.reset(unsaved.area!.values, { keepDefaultValues: true });
    if (fits('about')) about.reset(unsaved.about!.values, { keepDefaultValues: true });
    // After the first paint (a notice, not part of the server's page).
    if (SETUP_PARTS.some(fits)) requestAnimationFrame(() => setNotice('restored'));
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The address follows the part, so a reload or a link lands on it; the browser's Back moves between parts.
  const urlPart = PART_OF[(pathname.match(SETUP_PATH)?.[1] ?? '') as OnboardingStep];
  const [seenUrlPart, setSeenUrlPart] = useState(urlPart);
  if (urlPart !== seenUrlPart) {
    setSeenUrlPart(urlPart);
    if (urlPart && urlPart !== part) setPart(urlPart);
  }
  useEffect(() => {
    // On arrival at /profile showing another part, the address says which part this is.
    if (urlPart && urlPart !== part) window.history.replaceState(window.history.state, '', pathname.replace(SETUP_PATH, `/app/helper/onboarding/${STEP_OF[part]}`));
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(which: SetupPart, quiet: boolean): Promise<ActionResult | null> {
    const running = inFlight.current[which];
    if (running) await running;
    const values = valuesOf(which);
    const snapshot = JSON.stringify(values);
    const run = (async (): Promise<ActionResult | null> => {
      setStatus('saving');
      let outcome: ActionResult;
      try {
        outcome = which === 'services'
          ? await handlers.onSaveServices(values as HelperServicesInput)
          : which === 'area'
            ? await handlers.onSaveArea(values as HelperAreaInput)
            : await handlers.onSaveProfile(values as HelperProfileInput);
      } catch {
        outcome = { ok: false, code: 'unknown' };
      }
      if (outcome.ok) {
        lastSaved.current[which] = snapshot;
        setSaved((current) => ({ ...current, [which]: true }));
        writeUnsaved(key, (current) => {
          const next = { ...current };
          if (JSON.stringify(valuesOf(which)) === snapshot) delete next[which];
          else Object.assign(next, { [which]: { values: valuesOf(which), base: snapshot } });
          return next;
        });
        setStatus('saved');
      } else if (quiet) {
        setStatus('failed');
      } else {
        // On Next, the form shows the server's answer (FormFeedback) and the fields it names.
        setStatus(outcome.code === 'validation_failed' ? 'invalid' : 'idle');
        showFieldErrors(forms[which] as unknown as UseFormReturn<FieldValues>, outcome);
      }
      return outcome;
    })();
    inFlight.current[which] = run;
    try {
      return await run;
    } finally {
      if (inFlight.current[which] === run) delete inFlight.current[which];
    }
  }

  /** A part that's valid saves itself a moment after typing stops (Introduce yourself only once the agreement is accepted). */
  function schedule(which: SetupPart) {
    if (timer.current) clearTimeout(timer.current);
    if (!changed(which)) return;
    writeUnsaved(key, (current) => ({ ...current, [which]: { values: valuesOf(which), base: lastSaved.current[which] } }));
    setStatus('unsaved');
    timer.current = setTimeout(() => {
      const values = valuesOf(which);
      const schema = which === 'services' ? createHelperServicesSchema(data.categories) : which === 'area' ? helperAreaInputSchema : helperProfileInputSchema;
      if (!schema.safeParse(values).success) {
        setStatus('invalid');
        return;
      }
      if (which === 'about' && data.agreementNeeded && (values as HelperProfileInput).acceptHelperAgreement !== true) {
        setStatus('agreement');
        return;
      }
      void save(which, true);
    }, AUTOSAVE_MS);
  }
  // Every change to a part (typing, a toggle, a draft filled in) schedules its autosave, with this render's handlers.
  const scheduleLatest = useRef(schedule);
  useEffect(() => {
    scheduleLatest.current = schedule;
  });
  useEffect(() => {
    const subscriptions = SETUP_PARTS.map((which) => (forms[which] as unknown as UseFormReturn<FieldValues>).watch(() => scheduleLatest.current(which)));
    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      if (timer.current) clearTimeout(timer.current);
    };
    // The forms live as long as the page; `schedule` reads current values when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(next: SetupPart) {
    setPart(next);
    setResult(undefined);
    setNotice(null);
    setStatus(changed(next) ? 'unsaved' : saved[next] ? 'saved' : 'idle');
    if (SETUP_PATH.test(pathname)) window.history.pushState(null, '', pathname.replace(SETUP_PATH, `/app/helper/onboarding/${STEP_OF[next]}`));
    requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      top.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      heading.current?.focus({ preventScroll: true });
    });
  }

  async function next() {
    if (pending) return;
    if (timer.current) clearTimeout(timer.current);
    const form = forms[part] as unknown as UseFormReturn<FieldValues>;
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (part === 'about' && data.agreementNeeded && about.getValues('acceptHelperAgreement') !== true) {
      about.setError('acceptHelperAgreement', { type: 'manual', message: 'must_accept' }, { shouldFocus: valid });
      setStatus('agreement');
      return;
    }
    if (!valid) {
      setStatus('invalid');
      return;
    }
    if (part === 'about') {
      // Everything before Introduce yourself has to be saved first.
      const missing = SETUP_PARTS.find((which) => which !== 'about' && !saved[which]);
      if (missing) {
        goTo(missing);
        setNotice({ finishFirst: missing });
        return;
      }
    }
    setPending(true);
    const outcome = part === 'about' || changed(part) || !saved[part] ? await save(part, false) : { ok: true as const, code: 'saved' as const };
    setPending(false);
    if (!outcome?.ok) {
      setResult(outcome ?? undefined);
      return;
    }
    if (part === 'about') {
      writeUnsaved(key, () => ({}));
      router.push(outcome.redirectTo ?? routes.app.helperOnboarding('done'));
      return;
    }
    goTo(SETUP_PARTS[SETUP_PARTS.indexOf(part) + 1]!);
  }

  const index = SETUP_PARTS.indexOf(part);
  const chosenArea = data.areas.find((option) => option.id === areaValues.areaId);
  const areaName = areaValues.where === 'elsewhere' ? (areaValues.homeCity ?? '') : (chosenArea?.name ?? '');
  const chosenServices = (servicesValues.services ?? []).filter((service): service is HelperServicesInput['services'][number] => Boolean(service?.categorySlug));
  const remoteAllowed = chosenServices.some((service) => data.categories.some((category) => category.slug === service.categorySlug && category.remoteAllowed));
  const preview = <ProfileCardPreview person={data.person} headline={aboutValues.headline ?? ''} area={areaName} services={chosenServices} />;
  // What the draft replaced, for Undo.
  const [beforeDraft, setBeforeDraft] = useState<{ headline: string; bio: string }>();
  const fill = (draft: { headline: string; bio: string }) => {
    about.setValue('headline', draft.headline, { shouldDirty: true, shouldValidate: true });
    about.setValue('bio', draft.bio, { shouldDirty: true, shouldValidate: true });
  };
  const keepBefore = () => setBeforeDraft((kept) => kept ?? { headline: about.getValues('headline'), bio: about.getValues('bio') });
  const undoDraft = () => {
    if (beforeDraft) fill(beforeDraft);
    setBeforeDraft(undefined);
  };

  const statusLine: Record<Exclude<Status, 'idle'>, ReactNode> = {
    saving: <><Spinner aria-hidden="true" className="size-4" />{t('status.saving')}</>,
    saved: <><CloudCheck aria-hidden="true" className="size-4 text-success" />{t('status.saved')}</>,
    unsaved: <>{t('status.unsaved')}</>,
    invalid: <><CircleAlert aria-hidden="true" className="size-4 text-destructive" />{t('status.invalid')}</>,
    agreement: <><CircleAlert aria-hidden="true" className="size-4 text-destructive" />{t('status.agreement')}</>,
    failed: <><CircleAlert aria-hidden="true" className="size-4 text-destructive" />{t('status.failed')}</>,
  };

  return <div ref={top} className="scroll-mt-24 space-y-5">
    {/* Where you are: three parts, then the checks. */}
    <nav aria-label={t('partsLabel')} className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">{t('partOf', { number: index + 1, total: SETUP_PARTS.length })}</p>
      <ol className="grid grid-cols-3 gap-2">
        {SETUP_PARTS.map((which, position) => {
          const state = which === part ? 'current' : saved[which] ? 'done' : 'todo';
          const reachable = state === 'done' || position < index;
          const content = <>
            <span aria-hidden="true" className={cn('h-1.5 rounded-full bg-muted transition-colors duration-300', state === 'done' && 'bg-primary/60', state === 'current' && 'bg-primary')} />
            <span className={cn('flex min-w-0 items-start gap-1 text-left text-xs leading-tight font-medium sm:text-sm', state === 'current' ? 'text-foreground' : 'text-muted-foreground')}>
              {state === 'done' && <Check aria-hidden="true" className="mt-px size-3.5 shrink-0 text-primary" />}
              <span className="min-w-0 break-words">{t(`parts.${which}`)}</span>
            </span>
          </>;
          return <li key={which} aria-current={state === 'current' ? 'step' : undefined} className="min-w-0">
            {reachable && which !== part
              ? <button type="button" onClick={() => goTo(which)} className="grid min-h-11 w-full content-start gap-2 rounded-md pt-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{content}</button>
              : <div className="grid min-h-11 content-start gap-2 pt-1">{content}</div>}
          </li>;
        })}
      </ol>
      <p className="text-sm text-muted-foreground">{t('after')}</p>
    </nav>

    <div className={cn('gap-6', part === 'about' && 'lg:grid lg:grid-cols-[minmax(0,1fr)_18rem]')}>
      <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-5 rounded-[1.75rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
        <div className="space-y-2">
          <h2 id={`${id}-title`} ref={heading} tabIndex={-1} className="text-xl font-semibold outline-none">{t(`parts.${part}`)}</h2>
          <p className="text-muted-foreground">{t(`intros.${part}`)}</p>
          {notice && <p role="status" className="rounded-xl bg-secondary/70 px-3 py-2 text-sm text-secondary-foreground dark:bg-secondary/40">{notice === 'restored' ? t('restored') : t('finishFirst', { part: t(`parts.${notice.finishFirst}`) })}</p>}
        </div>
        <form noValidate onSubmit={(event) => { event.preventDefault(); void next(); }} aria-busy={pending} className="space-y-6">
          <fieldset disabled={pending} className="min-w-0 space-y-6">
            <legend className="sr-only">{t(`parts.${part}`)}</legend>
            {part === 'services' && <SetupServices form={services} categories={data.categories} defaults={data.serviceDefaults} />}
            {part === 'area' && <AreaFields form={area} areas={data.areas} remoteAllowed={remoteAllowed} homeMarket={data.homeMarket} awaitingCity={data.awaitingCity} />}
            {part === 'about' && <>
              <ProfilePhotoField initials={data.person.initials} photo={data.person.photo} maxPhotoMegabytes={data.maxPhotoMegabytes} note="helperEditor" onUpload={handlers.onUploadPhoto} onRemove={handlers.onRemovePhoto} />
              {data.profileDraft === 'ai'
                ? <ProfileDraftPanel onDraft={handlers.onDraftProfile} disabled={pending} onDrafted={(draft) => { keepBefore(); fill(draft); }} onUndo={undoDraft} />
                : <ExamplesPanel facts={{ firstName: data.person.firstName, services: chosenServices.map((service) => service.categorySlug), area: areaName, languages: aboutValues.languages?.filter((code): code is NonNullable<typeof code> => Boolean(code)) ?? [] }} disabled={pending} onUse={(draft) => { keepBefore(); fill(draft); }} onUndo={undoDraft} />}
              <ProfileFields form={about} languageOptions={data.languageOptions} agreementNeeded={data.agreementNeeded} />
              {/* Phones: the card on request, above the button. */}
              <div className="lg:hidden">
                <button type="button" aria-expanded={previewOpen} aria-controls={`${id}-preview`} onClick={() => setPreviewOpen((open) => !open)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <Eye aria-hidden="true" className="size-4" />{t(previewOpen ? 'about.previewHide' : 'about.previewShow')}<ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', previewOpen && 'rotate-180')} />
                </button>
                {previewOpen && <div id={`${id}-preview`} className="mt-3 space-y-2"><p className="text-sm text-muted-foreground">{t('about.previewHint')}</p>{preview}</div>}
              </div>
            </>}
          </fieldset>
          <FormFeedback result={result} successMessage="" />
          <div className="fixed inset-x-0 bottom-app-navigation z-20 border-t bg-card/95 px-gutter pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <div className="mx-auto flex max-w-reading flex-wrap items-center gap-3 sm:mx-0 sm:max-w-none">
              {index > 0 && <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => goTo(SETUP_PARTS[index - 1]!)}><ArrowLeft aria-hidden="true" />{t('back')}</Button>}
              <Button type="submit" className="min-h-11 flex-1 sm:flex-none" disabled={pending} aria-busy={pending}>
                {pending && <Spinner />}
                {part === 'about' ? t('finish') : t('next', { part: t(`parts.${SETUP_PARTS[index + 1]!}`) })}
                {!pending && part !== 'about' && <ArrowRight aria-hidden="true" />}
              </Button>
              <p aria-live="polite" className="flex min-h-5 basis-full items-center gap-1.5 text-sm text-muted-foreground sm:basis-auto">{status !== 'idle' && statusLine[status]}</p>
            </div>
          </div>
        </form>
      </section>
      {part === 'about' && <aside aria-label={t('about.preview')} className="hidden lg:block">
        <div className="sticky top-24 space-y-2">
          <p className="text-sm font-medium">{t('about.preview')}</p>
          <p className="text-sm text-muted-foreground">{t('about.previewHint')}</p>
          {preview}
        </div>
      </aside>}
    </div>
  </div>;
}
