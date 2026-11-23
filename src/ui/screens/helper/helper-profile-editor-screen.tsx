'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { CircleCheck, Eye, EyeOff, Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { routes, type HelperProfileEditorData, type HelperProfileEditorHandlers, type HelperStandingView } from '@/contracts';
import { HelperStandingPanel } from './helper-standing';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { ProfilePhotoField } from '@/ui/components/forms/profile-photo-field';
import { PageHeader } from '@/ui/components/layout/page-header';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { cn } from '@/ui/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/primitives/tabs';
import { HelperAreaForm, HelperProfileForm, HelperServicesForm, HelperToolsForm } from './helper-forms';
import { VerificationPanel } from './verification-panel';
import { WorkSamplesEditor } from './work-samples-editor';

const sections = ['profile', 'services', 'area', 'tools', 'work-samples', 'verification', 'visibility'] as const;
export type HelperEditorSection = (typeof sections)[number];
const desktopQuery = '(min-width: 768px)';
const subscribeDesktop = (onChange: () => void) => {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

function VisibilityEditor({ paused, onSetPaused }: { paused: boolean; onSetPaused: HelperProfileEditorHandlers['onSetPaused'] }) {
  const t = useTranslations('helperProfileEditor');
  const form = useForm({ values: { paused } });
  const isPaused = useWatch({ control: form.control, name: 'paused' });
  const action = useFormAction(form);
  async function toggle() {
    const next = !isPaused;
    const result = await action.run(onSetPaused, { paused: next });
    if (result?.ok) form.setValue('paused', next);
  }
  return <div className="space-y-4" aria-busy={action.pending}>
    <p className="font-medium">{t(isPaused ? 'screen.paused' : 'screen.visible')}</p>
    <p className="text-muted-foreground">{t('screen.visibilityExplanation')}</p>
    <Button type="button" variant="outline" disabled={action.pending} aria-busy={action.pending} onClick={() => void toggle()}>{action.pending ? <Spinner /> : isPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}{t(isPaused ? 'screen.resume' : 'screen.pause')}</Button>
    <FormFeedback result={action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : action.result} successMessage={t('screen.saved')} />
  </div>;
}

export function HelperProfileEditorScreen({ data, handlers, initialSection = 'profile', standing }: { data: HelperProfileEditorData; handlers: HelperProfileEditorHandlers; initialSection?: HelperEditorSection; standing?: HelperStandingView }) {
  const t = useTranslations('helperProfileEditor');
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(desktopQuery).matches, () => false);
  const remoteAllowed = data.values.services.services.some((service) => data.categories.some((category) => category.slug === service.categorySlug && category.remoteAllowed));
  // Without Claude, the written examples name the services and the area saved (plan 9.11).
  const exampleFacts = {
    firstName: data.person.firstName,
    services: data.values.services.services.map((service) => service.categorySlug),
    area: data.values.area.where === 'elsewhere' ? (data.values.area.homeCity ?? '') : (data.areas.find((area) => area.id === data.values.area.areaId)?.name ?? ''),
    languages: data.values.profile.languages,
  };
  const content: Record<HelperEditorSection, ReactNode> = {
    profile: <div className="space-y-6">
      <ProfilePhotoField initials={data.person.initials} photo={data.person.photo} maxPhotoMegabytes={data.maxPhotoMegabytes} note="helperEditor" onUpload={handlers.onUploadPhoto} onRemove={handlers.onRemovePhoto} />
      <div className="border-t pt-6"><HelperProfileForm values={data.values.profile} languageOptions={data.languageOptions} onSave={handlers.onSaveProfile} onDraft={data.profileDraft === 'ai' ? handlers.onDraftProfile : undefined} examples={data.profileDraft === 'template' ? exampleFacts : undefined} /></div>
    </div>,
    services: <HelperServicesForm values={data.values.services} categories={data.categories} onSave={handlers.onSaveServices} />,
    area: <HelperAreaForm values={data.values.area} areas={data.areas} remoteAllowed={remoteAllowed} onSave={handlers.onSaveArea} homeMarket={data.homeMarket} />,
    tools: <HelperToolsForm values={data.values.tools} onSave={handlers.onSaveTools} />,
    'work-samples': <WorkSamplesEditor samples={data.workSamples} categories={data.categories} maxWorkSamples={data.maxWorkSamples} maxPhotoMegabytes={data.maxPhotoMegabytes} handlers={handlers} />,
    verification: <div className="space-y-6"><VerificationBadges badges={data.badges} />{(['identity', 'payout', 'background'] as const).map((track) => <VerificationPanel key={track} track={track} verification={data.verification} categories={data.categories} bookableCategories={data.progress.bookableCategories} headingLevel={3} />)}</div>,
    visibility: <VisibilityEditor paused={data.paused} onSetPaused={handlers.onSetPaused} />,
  };
  // One section at a time on every screen (plan 9.11: the phone page was 13 screens with every form open).
  const [section, setSection] = useState<HelperEditorSection>(initialSection);
  const open = (next: HelperEditorSection) => {
    setSection(next);
    requestAnimationFrame(() => {
      const target = document.getElementById(`helper-section-title-${next}`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  };
  // Once every check is done and the gift card is earned, one line instead of the card and the checklist.
  const allDone = standing !== undefined && standing.steps.every((step) => step.state === 'done' || step.state === 'skipped' || step.state === 'later') && (!standing.giftCard || standing.giftCard.state !== 'open');
  return <div className="mx-auto max-w-reading space-y-6">
    <PageHeader title={t('screen.title')} description={t('screen.description')} />
    {/* Only a live profile has a public page: a draft or paused one would lead to "not found". */}
    {data.publicProfile
      ? <Link href={routes.helperProfile(data.handle)} className={buttonVariants({ variant: 'outline' })}><Eye aria-hidden="true" />{t('screen.viewPublic')}</Link>
      : <p className="flex items-start gap-2.5 text-sm text-muted-foreground"><EyeOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{t(data.paused ? 'screen.publicPaused' : 'screen.publicNotYet')}</span></p>}
    {standing && (allDone
      ? <p className="flex items-center gap-3 rounded-2xl border border-success/25 bg-success/10 px-4 py-3 text-sm"><CircleCheck aria-hidden="true" className="size-5 shrink-0 text-success" />{/* The words keep a reading width; on a phone the link goes under them instead of squeezing them (Spanish pass, 2026-11-21). */}<span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"><span className="min-w-48 flex-1">{t('screen.allChecksDone')}</span><button type="button" onClick={() => open('verification')} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t('screen.seeChecks')}</button></span></p>
      : <HelperStandingPanel standing={standing} />)}
    <Tabs value={section} onValueChange={(value) => setSection(value as HelperEditorSection)} className="gap-6">
      <TabsList aria-label={t('screen.sectionsLabel')} className="hidden w-full flex-wrap md:flex" variant="line">{sections.map((section) => <TabsTrigger key={section} value={section} aria-controls={`helper-section-${section}`}>{t(`screen.sections.${section}`)}</TabsTrigger>)}</TabsList>
      <nav aria-label={t('screen.sectionsLabel')} className="space-y-2 md:hidden"><p className="text-sm text-muted-foreground">{t('screen.sectionsPhoneHint')}</p><ul className="grid grid-cols-2 gap-2">{sections.map((item) => <li key={item}><a href={`${routes.app.helperProfile()}#helper-section-${item}`} aria-current={item === section ? 'true' : undefined} onClick={(event) => {
        event.preventDefault();
        open(item);
      }} className={cn('flex min-h-11 items-center rounded-lg border bg-card px-3 py-2 text-sm font-medium text-primary hover:bg-accent', item === section && 'border-primary/50 bg-brand-soft text-foreground')}>{t(`screen.sections.${item}`)}</a></li>)}</ul></nav>
      {/* Every section stays mounted (forms keep what was typed when switching); only the chosen one shows. */}
      {sections.map((item) => <TabsContent key={item} forceMount value={item} id={`helper-section-${item}`} role={desktop ? 'tabpanel' : 'region'} aria-labelledby={`helper-section-title-${item}`} className="space-y-5 rounded-xl border bg-card p-card shadow-card data-[state=inactive]:hidden">
        <h2 id={`helper-section-title-${item}`} tabIndex={-1} className="scroll-mt-24 text-xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{t(`screen.sections.${item}`)}</h2>
        {content[item]}
      </TabsContent>)}
    </Tabs>
  </div>;
}
