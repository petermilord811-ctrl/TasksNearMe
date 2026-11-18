'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
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
const AUTOSAVE_MS = 1500;

/**
 * The part the address names in its fragment (`#services`, `#area`, `#about`). Never in its path: a save refreshes the
 * page for the address, and another path is another page, which React starts over (keeping this one hidden).
 */
function partInUrl(): SetupPart | undefined {
  const name = window.location.hash.slice(1);
  return SETUP_PARTS.find((part) => part === name);
}

type Status = 'idle' | 'saving' | 'saved' | 'unsaved' | 'invalid' | 'agreement' | 'failed';
const NO_STATUS: Record<SetupPart, Status> = { services: 'idle', area: 'idle', about: 'idle' };

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
 * values it was typed over: it comes back only on top of those same saved values, never over newer ones. Kept under
 * the account's id (aa's sweep S4): two accounts can share a display name, and a tab can sign in as either.
 */
interface Draft<T> { values: T; base: string }
interface Unsaved { services?: Draft<HelperServicesInput>; area?: Draft<HelperAreaInput>; about?: Draft<HelperProfileInput> }
const storageKey = (userId: string) => `tnm:helper-setup:${userId}`;

/**
 * A part's values in one form, whoever wrote them (aa's sweep S4): text trimmed, empty fields left out, keys sorted,
 * services in one order, the helper agreement left out (it's recorded once, never part of the profile the page gets
 * back), and an area's fields for the other choice left out (the server keeps only the chosen one's). What the browser
 * saved and what the server sends back then compare equal, so text typed after a part saved comes back after a reload.
 */
function comparable(which: SetupPart, values: unknown): string {
  const tidy = (value: unknown): unknown => {
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.map(tidy);
    if (value === null || typeof value !== 'object') return value;
    const fields = Object.entries(value).map(([name, field]) => [name, tidy(field)] as const).filter(([, field]) => field !== undefined && field !== null && field !== '');
    return Object.fromEntries(fields.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  };
  const part = tidy(values) as Record<string, unknown>;
  if (which === 'about') delete part.acceptHelperAgreement;
  if (which === 'area') {
    if (part.where === 'elsewhere') delete part.areaId;
    else for (const field of ['homeZip', 'homeCity']) delete part[field];
  }
  if (which === 'services' && Array.isArray(part.services)) {
    const slug = (service: unknown) => String((service as { categorySlug?: unknown } | null)?.categorySlug ?? '');
    part.services = [...part.services].sort((a, b) => (slug(a) < slug(b) ? -1 : slug(a) > slug(b) ? 1 : 0));
  }
  return JSON.stringify(part);
}
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
 *
 * Each part saves on its own (aa's sweep S3): its own pending autosave, which a change in another part or Next there
 * never cancels, and its own status line. Save and continue first sends what every part still has waiting, waiting for
 * each, and stops on a part that can't save, so nothing typed is dropped when the drafts are cleared.
 */
export function HelperProfileSetup({ data, handlers }: { data: HelperOnboardingPageData; handlers: HelperOnboardingHandlers }) {
  const t = useTranslations('helperOnboarding.setup');
  const router = useRouter();
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const key = storageKey(data.userId);

  const [firstPart] = useState<SetupPart>(() => startingPart(data));
  const [part, setPart] = useState<SetupPart>(firstPart);
  const [saved, setSaved] = useState(() => savedParts(data));
  // Which parts are saved, for code that runs after an await (`saved` is the render's copy).
  const savedNow = useRef(saved);
  // Each part's own status: the line by the buttons speaks for the part on screen.
  const [statuses, setStatuses] = useState<Record<SetupPart, Status>>(NO_STATUS);
  const status = statuses[part];
  const setStatus = (which: SetupPart, next: Status) => setStatuses((current) => (current[which] === next ? current : { ...current, [which]: next }));
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult>();
  const [notice, setNotice] = useState<'restored' | { finishFirst: SetupPart } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const services = useForm<HelperServicesInput>({ resolver: zodResolver(createHelperServicesSchema(data.categories)), defaultValues: data.values.services });
  const area = useForm<HelperAreaInput>({ resolver: zodResolver(helperAreaInputSchema), defaultValues: { where: 'market', homeZip: '', homeCity: '', ...data.values.area } });
  const about = useForm<HelperProfileInput>({ resolver: zodResolver(helperProfileInputSchema), defaultValues: data.values.profile });
  const forms = { services, area, about } as const;

  // What each part last saved (`comparable`), to save only what changed.
  const lastSaved = useRef<Record<SetupPart, string>>({ services: comparable('services', data.values.services), area: comparable('area', { where: 'market', homeZip: '', homeCity: '', ...data.values.area }), about: comparable('about', data.values.profile) });
  const inFlight = useRef<Partial<Record<SetupPart, Promise<ActionResult>>>>({});
  // Each part's own autosave on its way: a change in another part, or Next there, never cancels it.
  const timers = useRef<Partial<Record<SetupPart, ReturnType<typeof setTimeout>>>>({});
  function cancelAutosave(which: SetupPart) {
    const waiting = timers.current[which];
    if (waiting !== undefined) clearTimeout(waiting);
    delete timers.current[which];
  }

  const servicesValues = useWatch({ control: services.control });
  const areaValues = useWatch({ control: area.control });
  const aboutValues = useWatch({ control: about.control });
  const valuesOf = (which: SetupPart) => forms[which].getValues() as HelperServicesInput | HelperAreaInput | HelperProfileInput;
  const changed = (which: SetupPart) => comparable(which, valuesOf(which)) !== lastSaved.current[which];
  const schemaOf = (which: SetupPart) => (which === 'services' ? createHelperServicesSchema(data.categories) : which === 'area' ? helperAreaInputSchema : helperProfileInputSchema);

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

  async function save(which: SetupPart, quiet: boolean): Promise<ActionResult> {
    const running = inFlight.current[which];
    if (running) await running;
    const values = valuesOf(which);
    const snapshot = comparable(which, values);
    const run = (async (): Promise<ActionResult> => {
      setStatus(which, 'saving');
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
        savedNow.current = { ...savedNow.current, [which]: true };
        setSaved(savedNow.current);
        const typedSince = changed(which);
        writeUnsaved(key, (current) => {
          const next = { ...current };
          if (typedSince) Object.assign(next, { [which]: { values: valuesOf(which), base: snapshot } });
          else delete next[which];
          return next;
        });
        // Typed again while it saved: that isn't saved yet, and goes up with the part's own autosave.
        setStatus(which, typedSince ? 'unsaved' : 'saved');
        if (typedSince && timers.current[which] === undefined) scheduleLatest.current(which);
      } else if (quiet) {
        setStatus(which, 'failed');
      } else {
        // On Next, the form shows the server's answer (FormFeedback) and the fields it names.
        setStatus(which, outcome.code === 'validation_failed' ? 'invalid' : 'idle');
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

  /**
   * Sends what a part has waiting, now (its autosave cancelled), after any save of it already on its way, and resolves
   * with how that went: ok at once when nothing's new (unless `force`), `invalid` when what's typed can't be saved yet.
   */
  async function flush(which: SetupPart, force = false): Promise<ActionResult | 'invalid'> {
    cancelAutosave(which);
    const running = inFlight.current[which];
    if (running) await running;
    if (!force && savedNow.current[which] && !changed(which)) return { ok: true, code: 'saved' };
    if (!schemaOf(which).safeParse(valuesOf(which)).success) return 'invalid';
    return save(which, false);
  }

  /** A part that's valid saves itself a moment after typing stops (Introduce yourself only once the agreement is accepted). */
  function schedule(which: SetupPart) {
    cancelAutosave(which);
    if (!changed(which)) {
      // Back to what's saved: nothing to send, nor to keep for a reload.
      writeUnsaved(key, (current) => {
        const next = { ...current };
        delete next[which];
        return next;
      });
      if (!inFlight.current[which]) setStatus(which, savedNow.current[which] ? 'saved' : 'idle');
      return;
    }
    writeUnsaved(key, (current) => ({ ...current, [which]: { values: valuesOf(which), base: lastSaved.current[which] } }));
    setStatus(which, 'unsaved');
    timers.current[which] = setTimeout(() => {
      delete timers.current[which];
      const values = valuesOf(which);
      if (!schemaOf(which).safeParse(values).success) {
        setStatus(which, 'invalid');
        return;
      }
      if (which === 'about' && data.agreementNeeded && (values as HelperProfileInput).acceptHelperAgreement !== true) {
        setStatus(which, 'agreement');
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
      SETUP_PARTS.forEach(cancelAutosave);
    };
    // The forms live as long as the page; `schedule` reads current values when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Shows a part. `move` (when people go to it) clears the notice, scrolls to the setup's top and focuses its heading. */
  function show(next: SetupPart, move = true) {
    setPart(next);
    setResult(undefined);
    // A part keeps its own status (a save that failed still says so); one with nothing to say yet says where it stands.
    setStatuses((current) => (current[next] !== 'idle' ? current : { ...current, [next]: changed(next) ? 'unsaved' : savedNow.current[next] ? 'saved' : 'idle' }));
    if (!move) return;
    setNotice(null);
    requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      top.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      heading.current?.focus({ preventScroll: true });
    });
  }

  function goTo(next: SetupPart) {
    show(next);
    window.history.pushState(null, '', `#${next}`);
  }

  // The address's fragment follows the part, so a reload lands on it and the browser's Back moves between parts.
  const showLatest = useRef(show);
  useEffect(() => {
    showLatest.current = show;
  });
  useEffect(() => {
    const follow = () => showLatest.current(partInUrl() ?? firstPart);
    window.addEventListener('popstate', follow);
    // A reload or a link naming another part opens it, once the page has hydrated.
    const named = partInUrl();
    const frame = named && named !== firstPart ? requestAnimationFrame(() => showLatest.current(named, false)) : undefined;
    return () => {
      window.removeEventListener('popstate', follow);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function next() {
    if (pending) return;
    // This part saves now; another part's own autosave goes on.
    cancelAutosave(part);
    const form = forms[part] as unknown as UseFormReturn<FieldValues>;
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (part === 'about' && data.agreementNeeded && about.getValues('acceptHelperAgreement') !== true) {
      about.setError('acceptHelperAgreement', { type: 'manual', message: 'must_accept' }, { shouldFocus: valid });
      setStatus(part, 'agreement');
      return;
    }
    if (!valid) {
      setStatus(part, 'invalid');
      return;
    }
    const others = SETUP_PARTS.filter((which) => which !== 'about');
    if (part === 'about') {
      // Everything before Introduce yourself has to be saved first.
      const missing = others.find((which) => !savedNow.current[which]);
      if (missing) {
        goTo(missing);
        setNotice({ finishFirst: missing });
        return;
      }
    }
    setPending(true);
    if (part === 'about') {
      // Save and continue clears every draft: first what the other parts still have waiting goes up, each awaited. A
      // part that can't save stops here and opens with its errors.
      for (const which of others) {
        const sent = await flush(which);
        if (sent !== 'invalid' && sent.ok) continue;
        setPending(false);
        goTo(which);
        if (sent === 'invalid') {
          setNotice({ finishFirst: which });
          void (forms[which] as unknown as UseFormReturn<FieldValues>).trigger();
        } else setResult(sent);
        return;
      }
    }
    // Introduce yourself always saves (the agreement, and where to go next); the others when something's new.
    const sent = await flush(part, part === 'about');
    setPending(false);
    const outcome: ActionResult = sent === 'invalid' ? { ok: false, code: 'validation_failed' } : sent;
    if (!outcome.ok) {
      setResult(outcome);
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
