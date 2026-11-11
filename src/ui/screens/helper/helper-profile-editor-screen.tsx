'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { Eye, Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { routes, type HelperProfileEditorData, type HelperProfileEditorHandlers } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { PageHeader } from '@/ui/components/layout/page-header';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
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

export function HelperProfileEditorScreen({ data, handlers, initialSection = 'profile' }: { data: HelperProfileEditorData; handlers: HelperProfileEditorHandlers; initialSection?: HelperEditorSection }) {
  const t = useTranslations('helperProfileEditor');
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(desktopQuery).matches, () => false);
  const remoteAllowed = data.values.services.services.some((service) => data.categories.some((category) => category.slug === service.categorySlug && category.remoteAllowed));
  const content: Record<HelperEditorSection, ReactNode> = {
    profile: <HelperProfileForm values={data.values.profile} languageOptions={data.languageOptions} onSave={handlers.onSaveProfile} />,
    services: <HelperServicesForm values={data.values.services} categories={data.categories} onSave={handlers.onSaveServices} />,
    area: <HelperAreaForm values={data.values.area} areas={data.areas} remoteAllowed={remoteAllowed} onSave={handlers.onSaveArea} />,
    tools: <HelperToolsForm values={data.values.tools} onSave={handlers.onSaveTools} />,
    'work-samples': <WorkSamplesEditor samples={data.workSamples} categories={data.categories} maxWorkSamples={data.maxWorkSamples} maxPhotoMegabytes={data.maxPhotoMegabytes} handlers={handlers} />,
    verification: <div className="space-y-6"><VerificationBadges badges={data.badges} />{(['identity', 'payout', 'background'] as const).map((track) => <VerificationPanel key={track} track={track} verification={data.verification} categories={data.categories} bookableCategories={data.progress.bookableCategories} headingLevel={3} />)}</div>,
    visibility: <VisibilityEditor paused={data.paused} onSetPaused={handlers.onSetPaused} />,
  };
  return <div className="mx-auto max-w-reading space-y-6">
    <PageHeader title={t('screen.title')} description={t('screen.description')} />
    <Link href={routes.helperProfile(data.handle)} className={buttonVariants({ variant: 'outline' })}><Eye aria-hidden="true" />{t('screen.viewPublic')}</Link>
    <Tabs defaultValue={initialSection} className="gap-6">
      <TabsList aria-label={t('screen.sectionsLabel')} className="hidden w-full flex-wrap md:flex" variant="line">{sections.map((section) => <TabsTrigger key={section} value={section} aria-controls={`helper-section-${section}`}>{t(`screen.sections.${section}`)}</TabsTrigger>)}</TabsList>
      <nav aria-label={t('screen.sectionsLabel')} className="md:hidden"><ul className="grid grid-cols-2 gap-2">{sections.map((section) => <li key={section}><a href={`${routes.app.helperProfile()}#helper-section-${section}`} onClick={(event) => {
        event.preventDefault();
        const target = document.getElementById(`helper-section-title-${section}`);
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: 'start' });
      }} className="flex min-h-11 items-center rounded-lg border bg-card px-3 py-2 text-sm font-medium text-primary hover:bg-accent">{t(`screen.sections.${section}`)}</a></li>)}</ul></nav>
      {sections.map((section) => <TabsContent key={section} forceMount value={section} id={`helper-section-${section}`} role={desktop ? 'tabpanel' : 'region'} aria-labelledby={`helper-section-title-${section}`} className="space-y-5 rounded-xl border bg-card p-card shadow-card md:data-[state=inactive]:hidden">
        <h2 id={`helper-section-title-${section}`} tabIndex={-1} className="scroll-mt-6 text-xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{t(`screen.sections.${section}`)}</h2>
        {content[section]}
      </TabsContent>)}
    </Tabs>
  </div>;
}
