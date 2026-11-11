import Link from 'next/link';
import { Check, CircleCheck, Clock, Gift, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type HelperOnboardingHandlers, type HelperOnboardingPageData, type OnboardingProgress } from '@/contracts';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Money } from '@/ui/components/money/money';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';
import { HelperAreaForm, HelperProfileForm, HelperServicesForm } from './helper-forms';
import { VerificationPanel } from './verification-panel';

function OnboardingStepper({ progress }: { progress: OnboardingProgress }) {
  const t = useTranslations('helperOnboarding');
  return <nav aria-label={t('screen.progressLabel')}>
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {progress.steps.map(({ step, state }, index) => {
        const content = <><span aria-hidden="true" className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border text-sm tabular-nums', state === 'current' && 'border-primary bg-primary text-primary-foreground', state === 'done' && 'border-primary/20 bg-secondary text-secondary-foreground')}>
          {state === 'done' ? <Check className="size-4" /> : state === 'locked' ? <Lock className="size-3.5" /> : index + 1}
        </span><span className="min-w-0"><span className="block text-sm font-medium">{t(`screen.steps.${step}`)}</span><span className="block text-xs text-muted-foreground">{t(`screen.states.${state}`)}</span></span></>;
        return <li key={step} aria-current={state === 'current' ? 'step' : undefined}>
          {state === 'done' ? <Link href={routes.app.helperOnboarding(step)} className="flex min-h-14 items-center gap-2 rounded-lg p-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{content}</Link> : <div className={cn('flex min-h-14 items-center gap-2 rounded-lg p-2', state === 'current' && 'bg-secondary/60')}>{content}</div>}
        </li>;
      })}
    </ol>
  </nav>;
}

function OnboardingDone({ data }: { data: HelperOnboardingPageData }) {
  const t = useTranslations('helperOnboarding');
  const remaining = data.progress.steps.filter(({ step, state }) => step !== 'done' && state !== 'done' && state !== 'skipped');
  return <section className="space-y-6 rounded-xl border bg-card p-card shadow-card">
    {data.progress.bookable ? <CircleCheck aria-hidden="true" className="size-10 text-primary" /> : <Clock aria-hidden="true" className="size-10 text-muted-foreground" />}
    <div className="space-y-2"><h2 className="text-xl font-semibold">{t(data.progress.bookable ? 'screen.doneReady' : 'screen.donePending')}</h2><p className="text-muted-foreground">{t(data.progress.bookable ? 'screen.doneReadyBody' : 'screen.donePendingBody')}</p></div>
    {data.progress.bookable && <><ul className="list-disc space-y-1 pl-5">{data.progress.bookableCategories.map((slug) => <li key={slug}>{data.categories.find((category) => category.slug === slug)?.name}</li>)}</ul><Link href={routes.app.findWork()} className={buttonVariants()}>{t('screen.findWork')}</Link></>}
    {remaining.length > 0 && <div className="space-y-2"><h3 className="text-lg font-semibold">{t('screen.remaining')}</h3><ul className="space-y-1">{remaining.map(({ step, state }) => <li key={step}>{state === 'locked' ? <p className="flex min-h-11 items-center gap-2 text-muted-foreground"><Lock aria-hidden="true" className="size-4" />{t('screen.lockedStep', { step: t(`screen.steps.${step}`) })}</p> : <Link href={routes.app.helperOnboarding(step)} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{t('screen.finishStep', { step: t(`screen.steps.${step}`) })}</Link>}</li>)}</ul></div>}
    {data.progress.bookable && data.welcomeReward && <aside className="space-y-2 rounded-xl bg-badge-reward p-4 text-badge-reward-foreground"><h3 className="flex items-center gap-2 text-lg font-semibold"><Gift aria-hidden="true" className="size-5" />{t('screen.rewardTitle')}</h3><p>{t.rich('screen.rewardBody', { amount: () => <Money cents={data.welcomeReward!.amountCents} />, minimum: () => <Money cents={data.welcomeReward!.minTaskPriceCents} />, days: data.welcomeReward.windowDays })}</p></aside>}
  </section>;
}

export function HelperOnboardingScreen({ data, handlers }: { data: HelperOnboardingPageData; handlers: HelperOnboardingHandlers }) {
  const t = useTranslations('helperOnboarding');
  const { step } = data;
  const remoteAllowed = data.values.services.services.some((service) => data.categories.some((category) => category.slug === service.categorySlug && category.remoteAllowed));
  const currentIndex = data.progress.steps.findIndex((entry) => entry.step === step);
  const next = currentIndex >= 0 ? data.progress.steps.slice(currentIndex + 1).find((entry) => entry.state !== 'skipped') : undefined;
  const provider = step === 'identity' || step === 'payout' || step === 'background';
  return <div className="mx-auto max-w-reading space-y-6 pb-24 sm:pb-0">
    <PageHeader title={t('screen.title')} description={t('screen.description')} />
    <OnboardingStepper progress={data.progress} />
    {(step === 'profile' || step === 'services' || step === 'area') && <section className="space-y-5 rounded-xl border bg-card p-card shadow-card">
      <div className="space-y-2"><h2 className="text-xl font-semibold">{t(`screen.titles.${step}`)}</h2><p className="text-muted-foreground">{t(`screen.descriptions.${step}`)}</p></div>
      {step === 'profile' && <HelperProfileForm key={step} values={data.values.profile} languageOptions={data.languageOptions} onSave={handlers.onSaveProfile} submitLabel={t('screen.saveContinue')} />}
      {step === 'services' && <HelperServicesForm key={step} values={data.values.services} categories={data.categories} onSave={handlers.onSaveServices} submitLabel={t('screen.saveContinue')} />}
      {step === 'area' && <HelperAreaForm key={step} values={data.values.area} areas={data.areas} remoteAllowed={remoteAllowed} onSave={handlers.onSaveArea} submitLabel={t('screen.saveContinue')} />}
    </section>}
    {provider && <><VerificationPanel key={step} track={step} verification={data.verification} categories={data.categories} bookableCategories={data.progress.bookableCategories} firstPayoutDays={data.firstPayoutDays} handlers={handlers} stickyAction />
      {step === 'background' && data.verification.background.requiredFor.length === 0 && <p className="rounded-xl border bg-card p-card">{t('screen.backgroundSkipped')}</p>}
      {next && next.state !== 'locked' && <div><Link href={routes.app.helperOnboarding(next.step)} className={buttonVariants({ variant: 'outline', className: 'w-full sm:w-auto' })}>{t('screen.continueStep', { step: t(`screen.steps.${next.step}`) })}</Link></div>}
    </>}
    {step === 'done' && <OnboardingDone data={data} />}
  </div>;
}
