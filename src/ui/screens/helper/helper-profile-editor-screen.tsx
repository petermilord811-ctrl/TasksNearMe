'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, Camera, Check, Eye, EyeOff, Hammer, Languages, Laptop, Leaf, MapPin, MoreHorizontal, Package, Pause, Pencil, Play, Plus, ShieldCheck, Sparkles, Star, ThumbsDown, ThumbsUp, Wrench, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  routes,
  type ActionHandler,
  type ActionResult,
  type CategorySlug,
  type HelperProfileEditorData,
  type HelperProfileEditorHandlers,
  type HelperStandingView,
  type LanguageCode,
} from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { ProfilePhotoField } from '@/ui/components/forms/profile-photo-field';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { cn } from '@/ui/lib/utils';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/primitives/dropdown-menu';
import { HelperAreaForm, HelperProfileForm, HelperServicesForm, HelperToolsForm } from './helper-forms';
import { ExperienceForm, PreferencesForm } from './profile-lists-forms';
import { ResumeImport } from './resume-import';
import { WorkSamplesEditor } from './work-samples-editor';

/**
 * The helper's own profile, LinkedIn-style (owner, 2026-11-27: "Remove useless bunch of descriptions and make profile
 * page … simple as LinkedIn profile page"): a card with their photo, name, headline, area, rating and badges, and the
 * profile's sections as they'll read to clients, each with a pencil that opens its form in a dialog. "Import from
 * resume" fills it from their resume. Verifications are their own page.
 */

const categoryIcons: Record<CategorySlug, LucideIcon> = {
  'furniture-assembly': Hammer,
  'moving-help': Package,
  'yard-cleanup': Leaf,
  'light-cleaning': Sparkles,
  'computer-help': Laptop,
};

export function HelperProfileEditorScreen({ data, handlers, standing }: { data: HelperProfileEditorData; handlers: HelperProfileEditorHandlers; standing?: HelperStandingView }) {
  const t = useTranslations('helperProfileEditor.page');
  const categoryName = useTranslations('helperCard.categories');
  const { values } = data;
  const languageNames = Object.fromEntries(data.languageOptions.map((option) => [option.code, option.name])) as Partial<Record<LanguageCode, string>>;
  const remoteAllowed = values.services.services.some((service) => data.categories.some((category) => category.slug === service.categorySlug && category.remoteAllowed));
  const exampleFacts = {
    firstName: data.person.firstName,
    services: values.services.services.map((service) => service.categorySlug),
    area: data.areaLabel ?? '',
    languages: values.profile.languages,
  };
  const { skills, likes, excludes } = values.preferences;
  const experience = values.experience.experience;
  const checksLeft = standing ? standing.steps.filter((step) => step.state !== 'done' && step.state !== 'skipped' && step.state !== 'later').length : 0;

  return <div className="mx-auto w-full max-w-[52rem] space-y-4 pb-24 sm:pb-10">
    <TopCard data={data} handlers={handlers} languageNames={languageNames} />

    {checksLeft > 0 && <Link href={routes.app.helperVerification()} className="group flex items-center gap-4 rounded-[1.5rem] border border-primary/20 bg-brand-soft/50 px-5 py-4 transition-colors hover:bg-brand-soft">
      <ShieldCheck aria-hidden="true" className="size-6 shrink-0 text-primary" />
      <span className="min-w-0 flex-1"><span className="block font-medium">{t('checksLeft', { count: checksLeft })}</span><span className="block text-sm text-muted-foreground">{t('checksLeftHint')}</span></span>
      <span className="text-sm font-medium text-primary">{t('finish')}</span>
    </Link>}

    <Section title={t('about')} edit={<EditDialog title={t('editIntro')} label={t('editSection', { section: t('about') })}>{(wrap) => <HelperProfileForm values={values.profile} languageOptions={data.languageOptions} onSave={wrap(handlers.onSaveProfile)} onDraft={data.profileDraft === 'ai' ? handlers.onDraftProfile : undefined} examples={data.profileDraft === 'template' ? exampleFacts : undefined} />}</EditDialog>}>
      {values.profile.bio
        ? <p className="text-[0.9375rem] leading-7 whitespace-pre-line">{values.profile.bio}</p>
        : <Empty>{t('aboutEmpty')}</Empty>}
      {values.profile.languages.length > 0 && <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Languages aria-hidden="true" className="size-4" />{values.profile.languages.map((code) => languageNames[code] ?? code).join(' · ')}</p>}
    </Section>

    <Section title={t('services')} edit={<EditDialog title={t('services')} label={t('editSection', { section: t('services') })} wide>{(wrap) => <HelperServicesForm values={values.services} categories={data.categories} onSave={wrap(handlers.onSaveServices)} />}</EditDialog>}>
      {values.services.services.length > 0
        ? <ul className="divide-y divide-foreground/[0.06]">{values.services.services.map((service) => {
          const Icon = categoryIcons[service.categorySlug];
          const price = service.pricingType === 'fixed' && service.fromPriceCents !== undefined
            ? t('price.fixed', { amount: formatMoney(service.fromPriceCents) })
            : service.pricingType === 'hourly' && service.hourlyRateCents !== undefined
              ? service.minHours !== undefined ? t('price.hourlyMinimum', { amount: formatMoney(service.hourlyRateCents), hours: formatHours(service.minHours) }) : t('price.hourly', { amount: formatMoney(service.hourlyRateCents) })
              : '';
          return <li key={service.categorySlug} className="flex items-start gap-4 py-3.5 first:pt-0 last:pb-0">
            <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: `color-mix(in oklab, var(--cat-${service.categorySlug}) 15%, transparent)`, color: `var(--cat-${service.categorySlug})` }}><Icon className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="font-medium">{categoryName(service.categorySlug)}</span>{price && <span className="text-sm font-semibold tabular-nums">{price}</span>}</span>
              {service.description && <span className="mt-0.5 block text-sm leading-6 text-muted-foreground">{service.description}</span>}
            </span>
          </li>;
        })}</ul>
        : <Empty>{t('servicesEmpty')}</Empty>}
    </Section>

    <Section title={t('skills')} edit={<EditDialog title={t('skillsAndPreferences')} label={t('editSection', { section: t('skills') })}>{(wrap) => <PreferencesForm values={values.preferences} onSave={wrap(handlers.onSavePreferences)} />}</EditDialog>}>
      {skills.length + likes.length + excludes.length === 0 && <Empty>{t('skillsEmpty')}</Empty>}
      {skills.length > 0 && <ChipRow items={skills} />}
      {(likes.length > 0 || excludes.length > 0) && <div className={cn('grid gap-4 sm:grid-cols-2', skills.length > 0 && 'mt-5')}>
        {likes.length > 0 && <div className="space-y-2"><p className="flex items-center gap-1.5 text-sm font-medium"><ThumbsUp aria-hidden="true" className="size-4 text-success" />{t('likes')}</p><ChipRow items={likes} tone="positive" /></div>}
        {excludes.length > 0 && <div className="space-y-2"><p className="flex items-center gap-1.5 text-sm font-medium"><ThumbsDown aria-hidden="true" className="size-4 text-muted-foreground" />{t('excludes')}</p><ChipRow items={excludes} tone="negative" /></div>}
      </div>}
    </Section>

    <Section title={t('experience')} edit={<EditDialog title={t('experience')} label={t('editSection', { section: t('experience') })}>{(wrap) => <ExperienceForm values={values.experience} onSave={wrap(handlers.onSaveExperience)} />}</EditDialog>}>
      {experience.length > 0
        ? <ol className="space-y-4">{experience.map((entry, index) => <li key={index} className="flex gap-4">
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-foreground/[0.05] text-foreground/70"><Briefcase className="size-5" /></span>
          <span className="min-w-0 flex-1 border-b border-foreground/[0.06] pb-4 last:border-0">
            <span className="block font-medium">{entry.title}</span>
            {entry.organization && <span className="block text-sm">{entry.organization}</span>}
            {(entry.startYear !== undefined || entry.current || entry.endYear !== undefined) && <span className="block text-sm text-muted-foreground tabular-nums">{entry.startYear ?? ''}{entry.startYear !== undefined ? '–' : ''}{entry.current ? t('present') : (entry.endYear ?? '')}</span>}
            {entry.summary && <span className="mt-1 block text-sm leading-6 text-muted-foreground">{entry.summary}</span>}
          </span>
        </li>)}</ol>
        : <Empty>{t('experienceEmpty')}</Empty>}
    </Section>

    <div className="grid gap-4 md:grid-cols-2">
      <Section title={t('tools')} edit={<EditDialog title={t('tools')} label={t('editSection', { section: t('tools') })}>{(wrap) => <HelperToolsForm values={values.tools} onSave={wrap(handlers.onSaveTools)} />}</EditDialog>}>
        {values.tools.tools.length > 0 ? <ChipRow items={values.tools.tools} icon={<Wrench aria-hidden="true" className="size-3.5" />} /> : <Empty>{t('toolsEmpty')}</Empty>}
      </Section>
      <Section title={t('area')} edit={<EditDialog title={t('area')} label={t('editSection', { section: t('area') })} wide>{(wrap) => <HelperAreaForm values={values.area} areas={data.areas} remoteAllowed={remoteAllowed} onSave={wrap(handlers.onSaveArea)} homeMarket={data.homeMarket} liveMap={false} />}</EditDialog>}>
        <p className="flex items-center gap-2 font-medium"><MapPin aria-hidden="true" className="size-4 text-muted-foreground" />{data.areaLabel ?? t('areaEmpty')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('radius', { miles: values.area.serviceRadiusMiles })}{values.area.remoteOk ? ` · ${t('remote')}` : ''}</p>
      </Section>
    </div>

    <Section title={t('workSamples')} edit={<EditDialog title={t('workSamples')} label={t('editSection', { section: t('workSamples') })} icon={data.workSamples.length === 0 ? 'add' : 'edit'} wide>{() => <WorkSamplesEditor samples={data.workSamples} categories={data.categories} maxWorkSamples={data.maxWorkSamples} maxPhotoMegabytes={data.maxPhotoMegabytes} handlers={handlers} />}</EditDialog>}>
      {data.workSamples.length > 0
        // eslint-disable-next-line @next/next/no-img-element -- the helper's own work photos, already sized
        ? <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">{data.workSamples.slice(0, 8).map((sample) => <li key={sample.id}><img src={sample.photo.src} alt={sample.photo.alt} className="aspect-square w-full rounded-2xl border object-cover" /></li>)}</ul>
        : <Empty>{t('workSamplesEmpty')}</Empty>}
    </Section>
  </div>;
}

function TopCard({ data, handlers, languageNames }: { data: HelperProfileEditorData; handlers: HelperProfileEditorHandlers; languageNames: Partial<Record<LanguageCode, string>> }) {
  const t = useTranslations('helperProfileEditor.page');
  const router = useRouter();
  const [pausing, setPausing] = useState(false);
  const { person, stats, values } = data;
  async function togglePause() {
    setPausing(true);
    const result = await handlers.onSetPaused({ paused: !data.paused }).catch((): ActionResult => ({ ok: false, code: 'unknown' }));
    setPausing(false);
    if (result.ok) {
      toast.success(t(data.paused ? 'resumed' : 'pausedNow'));
      router.refresh();
    } else toast.error(t('pauseFailed'));
  }
  return <article className="overflow-hidden rounded-[1.75rem] border bg-card shadow-card">
    <div aria-hidden="true" className="relative h-24 overflow-hidden sm:h-32">
      <div className="absolute inset-0 bg-[image:var(--iridescent)] opacity-80" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_10%_0%,transparent_40%,var(--card)_140%)]" />
    </div>
    <div className="px-5 pb-6 sm:px-8">
      <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-14">
        <EditDialog
          title={t('photo')}
          label={t('changePhoto')}
          trigger={<button type="button" className="group relative rounded-full ring-4 ring-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <InitialsAvatar initials={person.initials} photo={person.photo} size="xl" />
            <span aria-hidden="true" className="absolute right-0.5 bottom-0.5 flex size-8 items-center justify-center rounded-full border-2 border-card bg-foreground text-background transition-transform group-hover:scale-105"><Camera className="size-4" /></span>
            <span className="sr-only">{t('changePhoto')}</span>
          </button>}
        >
          {() => <ProfilePhotoField initials={person.initials} photo={person.photo} maxPhotoMegabytes={data.maxPhotoMegabytes} note="helperEditor" onUpload={handlers.onUploadPhoto} onRemove={handlers.onRemovePhoto} />}
        </EditDialog>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="mb-1 size-10 rounded-full" aria-label={t('more')}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={pausing} onSelect={() => void togglePause()}>{data.paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}{t(data.paused ? 'resumeProfile' : 'pauseProfile')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-3 space-y-1.5">
        <h1 className="font-display text-[1.625rem] leading-tight font-semibold tracking-[-0.025em] break-words sm:text-[1.875rem]">{person.displayName}</h1>
        <p className={cn('text-[0.9375rem] leading-6 sm:text-[1.0625rem]', values.profile.headline ? 'text-foreground/85' : 'text-muted-foreground italic')}>{values.profile.headline || t('headlineEmpty')}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {data.areaLabel && <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="size-3.5" />{data.areaLabel}</span>}
          {stats && stats.ratingCount > 0 && stats.ratingAverage !== undefined && <span className="inline-flex items-center gap-1 text-foreground"><Star aria-hidden="true" className="size-3.5 fill-current text-amber-500" />{t('rating', { rating: stats.ratingAverage.toFixed(1), count: stats.ratingCount })}</span>}
          {stats && stats.completedCount > 0 && <span>{t('jobs', { count: stats.completedCount })}</span>}
        </p>
      </div>
      {(data.badges.idVerifiedAt || data.badges.backgroundCheckedAt || data.badges.addressVerifiedAt) && <div className="mt-3"><VerificationBadges badges={data.badges} compact /></div>}
      {!data.publicProfile && <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-foreground/[0.05] px-3 py-1 text-sm text-muted-foreground"><EyeOff aria-hidden="true" className="size-3.5" />{t(data.paused ? 'statusPaused' : 'statusDraft')}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <ResumeImport
          handlers={handlers}
          languageNames={languageNames}
          current={{ headline: values.profile.headline, bio: values.profile.bio }}
          trigger={<Button className="rounded-full"><Sparkles aria-hidden="true" />{t('importResume')}</Button>}
        />
        {data.publicProfile && <Link href={routes.helperProfile(data.handle)} className={buttonVariants({ variant: 'outline', className: 'rounded-full' })}><Eye aria-hidden="true" />{t('viewPublic')}</Link>}
      </div>
    </div>
  </article>;
}

function Section({ title, edit, children }: { title: string; edit?: ReactNode; children: ReactNode }) {
  return <section className="rounded-[1.5rem] border bg-card p-5 shadow-card sm:p-7">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="font-display text-xl font-semibold tracking-[-0.015em]">{title}</h2>
      {edit}
    </div>
    {children}
  </section>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[0.9375rem] text-muted-foreground">{children}</p>;
}

function ChipRow({ items, tone = 'neutral', icon }: { items: string[]; tone?: 'neutral' | 'positive' | 'negative'; icon?: ReactNode }) {
  const look = { neutral: 'bg-foreground/[0.06]', positive: 'bg-success/12', negative: 'bg-foreground/[0.04] text-muted-foreground' }[tone];
  return <ul className="flex flex-wrap gap-2">{items.map((item) => <li key={item} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm', look)}>{icon}{tone === 'positive' && <Check aria-hidden="true" className="size-3.5 text-success" />}{item}</li>)}</ul>;
}

/**
 * A section's form in a dialog, opened by its pencil (or a given trigger). `children` gets `wrap`, which turns a save
 * handler into one that closes the dialog and says "Saved" when it worked (the page refreshes from the save itself).
 */
function EditDialog({ title, label, trigger, icon = 'edit', wide = false, children }: {
  title: string;
  label: string;
  trigger?: ReactNode;
  icon?: 'edit' | 'add';
  wide?: boolean;
  children: (wrap: <I>(handler: ActionHandler<I>) => ActionHandler<I>) => ReactNode;
}) {
  const t = useTranslations('helperProfileEditor.page');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrap = <I,>(handler: ActionHandler<I>): ActionHandler<I> => async (input: I) => {
    const result = await handler(input);
    if (result.ok) {
      setOpen(false);
      toast.success(t('saved'));
      router.refresh();
    }
    return result;
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>{trigger ?? <Button variant="ghost" size="icon" className="size-10 rounded-full" aria-label={label}>{icon === 'add' ? <Plus aria-hidden="true" /> : <Pencil aria-hidden="true" />}</Button>}</DialogTrigger>
    <DialogContent className={cn('max-h-[92dvh] overflow-y-auto', wide ? 'sm:max-w-2xl' : 'sm:max-w-xl')}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription className="sr-only">{label}</DialogDescription>
      {open && children(wrap)}
    </DialogContent>
  </Dialog>;
}
