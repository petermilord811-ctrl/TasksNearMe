'use client';

import { useId, useState, type DragEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { Check, FileText, Sparkles, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  RESUME_RULES,
  type ActionResult,
  type LanguageCode,
  type ResumeApplyInput,
  type ResumeImportHandlers,
  type ResumeReadResult,
  type ResumeSuggestions,
} from '@/contracts';
import { SuccessMark } from '@/ui/components/verify-flow/checks';
import { usePrefersReducedMotion } from '@/ui/motion/use-reduced-motion';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * "Import from resume" (owner, 2026-11-27: "By resume, configure user's profile ex: what user can do, what user can like,
 * what user can exclude"): the helper drops their resume, our server reads it and AI suggests their services, skills,
 * tools, languages, the work they enjoy and the work they don't do, a headline, an About text and their experience.
 * They keep what fits (everything starts kept) and add it to their profile; nothing is saved before that.
 */

type Step = 'upload' | 'reading' | 'review' | 'done';
type Failure = Extract<ResumeReadResult, { ok: false }>['code'];

export interface ResumeImportProps {
  handlers: ResumeImportHandlers;
  languageNames: Partial<Record<LanguageCode, string>>;
  /** The profile already has these (shown as "already on your profile"). */
  current: { headline: string; bio: string };
  trigger: ReactNode;
  /** Previews: open on a step with a result. */
  preview?: { step: Step; result?: ResumeReadResult; failure?: Failure };
}

export function ResumeImport({ handlers, languageNames, current, trigger, preview }: ResumeImportProps) {
  const t = useTranslations('helperProfileEditor.resume');
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(preview !== undefined);
  const [step, setStep] = useState<Step>(preview?.step ?? 'upload');
  const [failure, setFailure] = useState<Failure | undefined>(preview?.failure);
  const [result, setResult] = useState<Extract<ResumeReadResult, { ok: true }> | undefined>(preview?.result?.ok ? preview.result : undefined);
  const [kept, setKept] = useState<Kept>(() => (preview?.result?.ok ? keepAll(preview.result.suggestions) : emptyKept()));
  const [applying, setApplying] = useState(false);
  const [applyFailed, setApplyFailed] = useState(false);

  function reset() {
    setStep('upload');
    setFailure(undefined);
    setResult(undefined);
    setApplyFailed(false);
  }

  async function read(file: File) {
    setFailure(undefined);
    const typeOk = (RESUME_RULES.acceptedTypes as readonly string[]).includes(file.type) || RESUME_RULES.acceptedExtensions.some((ending) => file.name.toLowerCase().endsWith(ending));
    if (!typeOk) {
      setFailure('unsupported_type');
      return;
    }
    if (file.size > RESUME_RULES.maxMegabytes * 1024 * 1024) {
      setFailure('too_large');
      return;
    }
    const form = new FormData();
    form.set('file', file);
    setStep('reading');
    const answer = await handlers.onReadResume(form).catch((): ResumeReadResult => ({ ok: false, code: 'unknown' }));
    if (!answer.ok) {
      setFailure(answer.code);
      setStep('upload');
      return;
    }
    setResult(answer);
    setKept(keepAll(answer.suggestions));
    setStep('review');
  }

  async function apply() {
    if (!result) return;
    const s = result.suggestions;
    const input: ResumeApplyInput = {
      ...(kept.headline && s.headline ? { headline: s.headline } : {}),
      ...(kept.bio && s.bio ? { bio: s.bio } : {}),
      services: s.services.filter((service) => kept.services.has(service.categorySlug)).map((service) => ({ categorySlug: service.categorySlug, description: service.description })),
      skills: s.skills.filter((item) => kept.skills.has(item)),
      tools: s.tools.filter((item) => kept.tools.has(item)),
      languages: s.languages.filter((item) => kept.languages.has(item)),
      likes: s.likes.filter((item) => kept.likes.has(item)),
      excludes: s.excludes.filter((item) => kept.excludes.has(item)),
      experience: s.experience.filter((_, index) => kept.experience.has(index)),
    };
    setApplying(true);
    setApplyFailed(false);
    const answer = await handlers.onApplyResume(input).catch((): ActionResult => ({ ok: false, code: 'unknown' }));
    setApplying(false);
    if (!answer.ok) {
      setApplyFailed(true);
      return;
    }
    setStep('done');
    router.refresh();
  }

  const screens: Record<Step, ReactNode> = {
    upload: <UploadStep failure={failure} onFile={(file) => void read(file)} />,
    reading: <ReadingStep reduced={reduced} />,
    review: result ? <ReviewStep result={result} kept={kept} setKept={setKept} languageNames={languageNames} current={current} /> : null,
    done: <div className="flex flex-col items-center gap-4 py-8 text-center"><SuccessMark /><p className="font-display text-xl font-semibold">{t('done.title')}</p><p className="text-muted-foreground">{t('done.body')}</p></div>,
  };

  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setTimeout(reset, 250); }}>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    {/* The dialog itself takes focus (its title is read first), not the first suggestion, which would show a focus ring. */}
    <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" onOpenAutoFocus={(event) => { event.preventDefault(); (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true }); }}>
      <div className="space-y-1 px-6 pt-6 pb-4 pr-14">
        <DialogTitle className="flex items-center gap-2"><Sparkles aria-hidden="true" className="size-5 text-primary" />{t('title')}</DialogTitle>
        <DialogDescription>{step === 'review' ? t(result?.by === 'basic' ? 'review.basic' : 'review.description') : t('description')}</DialogDescription>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <LazyMotion features={domAnimation}>
          <AnimatePresence mode="wait" initial={false}>
            <m.div key={step} initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
              {screens[step]}
            </m.div>
          </AnimatePresence>
        </LazyMotion>
      </div>
      {(step === 'review' || step === 'done') && <div className="space-y-2 border-t px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {applyFailed && <p role="alert" className="text-sm text-destructive">{t('errors.apply')}</p>}
        {step === 'review'
          ? <Button size="lg" className="w-full" disabled={applying || countKept(kept) === 0} aria-busy={applying} onClick={() => void apply()}>{applying && <Spinner />}{t('review.apply', { count: countKept(kept) })}</Button>
          : <Button size="lg" className="w-full" onClick={() => { setOpen(false); toast.success(t('done.toast')); setTimeout(reset, 250); }}>{t('done.close')}</Button>}
      </div>}
    </DialogContent>
  </Dialog>;
}

interface Kept {
  headline: boolean;
  bio: boolean;
  services: Set<string>;
  skills: Set<string>;
  tools: Set<string>;
  languages: Set<string>;
  likes: Set<string>;
  excludes: Set<string>;
  experience: Set<number>;
}

const emptyKept = (): Kept => ({ headline: false, bio: false, services: new Set(), skills: new Set(), tools: new Set(), languages: new Set(), likes: new Set(), excludes: new Set(), experience: new Set() });

function keepAll(s: ResumeSuggestions): Kept {
  return {
    headline: Boolean(s.headline),
    bio: Boolean(s.bio),
    services: new Set(s.services.map((service) => service.categorySlug)),
    skills: new Set(s.skills),
    tools: new Set(s.tools),
    languages: new Set(s.languages),
    likes: new Set(s.likes),
    excludes: new Set(s.excludes),
    experience: new Set(s.experience.map((_, index) => index)),
  };
}

const countKept = (kept: Kept) =>
  Number(kept.headline) + Number(kept.bio) + kept.services.size + kept.skills.size + kept.tools.size + kept.languages.size + kept.likes.size + kept.excludes.size + kept.experience.size;

function UploadStep({ failure, onFile }: { failure?: Failure; onFile: (file: File) => void }) {
  const t = useTranslations('helperProfileEditor.resume');
  const id = useId();
  const [over, setOver] = useState(false);
  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };
  return <div className="space-y-4">
    <input id={id} type="file" accept={[...RESUME_RULES.acceptedTypes, ...RESUME_RULES.acceptedExtensions].join(',')} className="peer sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file); }} />
    <label
      htmlFor={id}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn('flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.5rem] border-2 border-dashed px-6 py-8 text-center transition-[border-color,background-color,transform] duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2', over ? 'scale-[1.01] border-primary bg-brand-soft/60' : 'border-foreground/15 bg-foreground/[0.02] hover:border-foreground/30')}
    >
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-card text-primary shadow-sm"><Upload className="size-5" /></span>
      <span className="font-medium">{t('upload.drop')}</span>
      <span className="text-sm text-muted-foreground">{t('upload.types', { megabytes: RESUME_RULES.maxMegabytes })}</span>
    </label>
    {failure && <p role="alert" className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{t(`errors.${failure}`, { megabytes: RESUME_RULES.maxMegabytes })}</p>}
    <p className="text-sm text-muted-foreground">{t('upload.privacy')}</p>
  </div>;
}

function ReadingStep({ reduced }: { reduced: boolean }) {
  const t = useTranslations('helperProfileEditor.resume');
  return <div className="flex flex-col items-center gap-5 py-10 text-center" role="status" aria-live="polite">
    <LazyMotion features={domAnimation}>
      <span aria-hidden="true" className="relative flex size-20 items-center justify-center rounded-3xl bg-brand-soft text-primary">
        <FileText className="size-9" />
        {!reduced && <m.span className="absolute -top-1 -right-1" animate={{ rotate: [0, 18, -8, 0], scale: [1, 1.15, 0.95, 1] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}><Sparkles className="size-6" /></m.span>}
      </span>
    </LazyMotion>
    <div className="space-y-1">
      <p className="font-display text-xl font-semibold">{t('reading.title')}</p>
      <p className="text-muted-foreground">{t('reading.body')}</p>
    </div>
  </div>;
}

/** A suggestion to keep or drop: a chip that's pressed while kept. */
function KeepChip({ label, kept, onToggle, tone = 'neutral' }: { label: string; kept: boolean; onToggle: () => void; tone?: 'neutral' | 'positive' | 'negative' }) {
  const on = { neutral: 'border-primary/40 bg-brand-soft/70', positive: 'border-success/40 bg-success/12', negative: 'border-destructive/30 bg-destructive/10' }[tone];
  return <button type="button" aria-pressed={kept} onClick={onToggle} className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', kept ? on : 'border-foreground/15 bg-card text-muted-foreground line-through decoration-foreground/30')}>
    {kept && <Check aria-hidden="true" className="size-3.5" />}{label}
  </button>;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-2.5">
    <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
    {children}
  </section>;
}

function ReviewStep({ result, kept, setKept, languageNames, current }: {
  result: Extract<ResumeReadResult, { ok: true }>;
  kept: Kept;
  setKept: (next: Kept | ((previous: Kept) => Kept)) => void;
  languageNames: Partial<Record<LanguageCode, string>>;
  current: { headline: string; bio: string };
}) {
  const t = useTranslations('helperProfileEditor.resume.review');
  const categories = useTranslations('helperCard.categories');
  const s = result.suggestions;
  const toggle = <K extends 'services' | 'skills' | 'tools' | 'languages' | 'likes' | 'excludes'>(key: K, value: string) =>
    setKept((previous) => {
      const next = new Set(previous[key]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...previous, [key]: next };
    });
  const chips = (key: 'skills' | 'tools' | 'likes' | 'excludes', items: string[], tone?: 'positive' | 'negative') =>
    items.length > 0 && <div className="flex flex-wrap gap-2">{items.map((item) => <KeepChip key={item} label={item} kept={kept[key].has(item)} tone={tone} onToggle={() => toggle(key, item)} />)}</div>;
  return <div className="space-y-6">
    {(s.headline || s.bio) && <Group title={t('intro')}>
      {s.headline && <ToggleCard kept={kept.headline} onToggle={() => setKept((previous) => ({ ...previous, headline: !previous.headline }))} label={t('headline')} replaces={current.headline ? t('replaces') : undefined}><p className="font-medium">{s.headline}</p></ToggleCard>}
      {s.bio && <ToggleCard kept={kept.bio} onToggle={() => setKept((previous) => ({ ...previous, bio: !previous.bio }))} label={t('bio')} replaces={current.bio ? t('replaces') : undefined}><p className="line-clamp-5 text-sm leading-6 whitespace-pre-line text-muted-foreground">{s.bio}</p></ToggleCard>}
    </Group>}
    {s.services.length > 0 && <Group title={t('services')}>
      <div className="space-y-2">{s.services.map((service) => <ToggleCard key={service.categorySlug} kept={kept.services.has(service.categorySlug)} onToggle={() => toggle('services', service.categorySlug)} label={categories(service.categorySlug)} badge={service.alreadyOffered ? t('alreadyOffered') : undefined}>
        <p className="text-sm text-muted-foreground">{service.reason}</p>
      </ToggleCard>)}</div>
    </Group>}
    {s.skills.length > 0 && <Group title={t('skills')}>{chips('skills', s.skills)}</Group>}
    {s.likes.length > 0 && <Group title={t('likes')}>{chips('likes', s.likes, 'positive')}</Group>}
    {s.excludes.length > 0 && <Group title={t('excludes')}>{chips('excludes', s.excludes, 'negative')}</Group>}
    {s.tools.length > 0 && <Group title={t('tools')}>{chips('tools', s.tools)}</Group>}
    {s.languages.length > 0 && <Group title={t('languages')}><div className="flex flex-wrap gap-2">{s.languages.map((code) => <KeepChip key={code} label={languageNames[code] ?? code} kept={kept.languages.has(code)} onToggle={() => toggle('languages', code)} />)}</div></Group>}
    {s.experience.length > 0 && <Group title={t('experience')}>
      <div className="space-y-2">{s.experience.map((entry, index) => <ToggleCard key={index} kept={kept.experience.has(index)} onToggle={() => setKept((previous) => {
        const next = new Set(previous.experience);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return { ...previous, experience: next };
      })} label={entry.title}>
        <p className="text-sm text-muted-foreground">{[entry.organization, years(entry, t('present'))].filter(Boolean).join(' · ')}</p>
      </ToggleCard>)}</div>
    </Group>}
  </div>;
}

function years(entry: { startYear?: number; endYear?: number; current?: boolean }, present: string): string {
  if (entry.startYear === undefined) return entry.current ? present : entry.endYear !== undefined ? String(entry.endYear) : '';
  return `${entry.startYear}–${entry.current ? present : (entry.endYear ?? '')}`;
}

/** A bigger suggestion (a headline, a service, a job) with a check box. */
function ToggleCard({ kept, onToggle, label, badge, replaces, children }: { kept: boolean; onToggle: () => void; label: string; badge?: string; replaces?: string; children: ReactNode }) {
  return <button type="button" aria-pressed={kept} onClick={onToggle} className={cn('flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', kept ? 'border-primary/40 bg-brand-soft/40' : 'border-foreground/12 bg-card opacity-70')}>
    <span aria-hidden="true" className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors', kept ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/25')}>{kept && <Check className="size-3.5" strokeWidth={3} />}</span>
    <span className="min-w-0 flex-1 space-y-1">
      <span className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{label}</span>{badge && <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs text-muted-foreground">{badge}</span>}{replaces && <span className="text-xs text-muted-foreground">{replaces}</span>}</span>
      {children}
    </span>
  </button>;
}
