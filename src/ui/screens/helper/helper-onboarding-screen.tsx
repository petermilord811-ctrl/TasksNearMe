import Link from 'next/link';
import { CircleCheck, Clock, Lock, MapPinned } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, WELCOME_GIFT_CHECKS, type HelperOnboardingHandlers, type HelperOnboardingPageData, type HelperStandingView, type OnboardingStep } from '@/contracts';
import { PageHeader } from '@/ui/components/layout/page-header';
import { PushPrompt } from '@/ui/components/push/push-device';
import { WelcomeGiftCardView, WelcomeGiftStrip } from '@/ui/components/rewards/welcome-gift-card';
import { buttonVariants } from '@/ui/primitives/button';
import { AddressStep } from './address-step';
import { HelperAreaForm, HelperProfileForm, HelperServicesForm } from './helper-forms';
import { IdentityCaptureStep } from './identity-capture';
import { PhoneStep } from './phone-step';
import { OnboardingStepper } from './onboarding-stepper';
import { VerificationPanel } from './verification-panel';
import { HelperStandingPanel } from './helper-standing';

/**
 * A helper outside every city we're open in (owner, 2026-11-14): their checks are done, and we'll tell them the
 * moment their city opens; meanwhile their profile can be ready.
 */
function AwaitingCityNotice({ data }: { data: HelperOnboardingPageData }) {
  const t = useTranslations('helperOnboarding.screen.awaitingCity');
  if (!data.awaitingCity) return null;
  const { city, state } = data.awaitingCity;
  // Every check we can do now is done (the home address waits for the city).
  const checksDone = data.progress.steps.every(({ step, state: stepState }) => step === 'done' || stepState === 'done' || stepState === 'skipped' || stepState === 'later');
  return <aside aria-labelledby="awaiting-city-title" className="flex gap-3 rounded-xl bg-secondary/70 p-4 text-secondary-foreground dark:bg-secondary/40">
    <MapPinned aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary" />
    <div className="space-y-2">
      <h2 id="awaiting-city-title" className="text-xl font-semibold">{t(checksDone ? 'verifiedTitle' : 'title', { city, state })}</h2>
      <p>{t('body', { city })}</p>
      <div className="flex flex-wrap gap-x-4">
        <Link href={routes.app.helperProfile()} className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{t('profile')}</Link>
        <Link href={routes.app.helperOnboarding('area')} className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{t('changeCity')}</Link>
      </div>
    </div>
  </aside>;
}

/** The onboarding steps that earn the welcome gift card (the stepper marks them). */
const GIFT_STEPS: readonly OnboardingStep[] = WELCOME_GIFT_CHECKS;

function OnboardingDone({ data, onSavePushSubscription }: { data: HelperOnboardingPageData; onSavePushSubscription?: HelperOnboardingHandlers['onSavePushSubscription'] }) {
  const t = useTranslations('helperOnboarding');
  const remaining = data.progress.steps.filter(({ step, state }) => step !== 'done' && state !== 'done' && state !== 'skipped' && state !== 'later');
  return <section className="space-y-6 rounded-xl border bg-card p-card shadow-card">
    {/* Outside the cities we're open in, the notice is the page's news; the generic heading would say "a few steps left". */}
    {data.awaitingCity ? <AwaitingCityNotice data={data} /> : <>
      {data.progress.bookable ? <CircleCheck aria-hidden="true" className="size-10 text-primary" /> : <Clock aria-hidden="true" className="size-10 text-muted-foreground" />}
      <div className="space-y-2"><h2 className="text-xl font-semibold">{t(data.progress.bookable ? 'screen.doneReady' : 'screen.donePending')}</h2><p className="text-muted-foreground">{t(data.progress.bookable ? 'screen.doneReadyBody' : 'screen.donePendingBody')}</p></div>
    </>}
    {data.progress.bookable && <PushPrompt push={data.push} onSave={onSavePushSubscription} kind="tasks" />}
    {data.progress.bookable && <><ul className="list-disc space-y-1 pl-5">{data.progress.bookableCategories.map((slug) => <li key={slug}>{data.categories.find((category) => category.slug === slug)?.name}</li>)}</ul><Link href={routes.app.findWork()} className={buttonVariants()}>{t('screen.findWork')}</Link></>}
    {remaining.length > 0 && <div className="space-y-2"><h3 className="text-lg font-semibold">{t('screen.remaining')}</h3><ul className="space-y-1">{remaining.map(({ step, state }) => <li key={step}>{state === 'locked' ? <p className="flex min-h-11 items-center gap-2 text-muted-foreground"><Lock aria-hidden="true" className="size-4" />{t('screen.lockedStep', { step: t(`screen.steps.${step}`) })}</p> : <Link href={routes.app.helperOnboarding(step)} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{t('screen.finishStep', { step: t(`screen.steps.${step}`) })}</Link>}</li>)}</ul></div>}
    {/* The $50 welcome gift card: earned the moment the phone, ID and background checks have all passed. */}
    {data.welcomeReward && <WelcomeGiftCardView card={data.welcomeReward} headingLevel={3} />}
  </section>;
}

export function HelperOnboardingScreen({ data, handlers, standing }: { data: HelperOnboardingPageData; handlers: HelperOnboardingHandlers; standing?: HelperStandingView }) {
  const t = useTranslations('helperOnboarding');
  const { step } = data;
  const remoteAllowed = data.values.services.services.some((service) => data.categories.some((category) => category.slug === service.categorySlug && category.remoteAllowed));
  const currentIndex = data.progress.steps.findIndex((entry) => entry.step === step);
  const next = currentIndex >= 0 ? data.progress.steps.slice(currentIndex + 1).find((entry) => entry.state !== 'skipped' && entry.state !== 'later') : undefined;
  // The ID step's first stage is our own capture; the provider's double check follows once it's approved.
  const capture = data.verification.identity.capture;
  const capturing = step === 'identity' && capture !== undefined && (capture.stage === 'needed' || capture.stage === 'in_review');
  const provider = (step === 'identity' && !capturing) || step === 'payout' || step === 'background';
  return <div className="mx-auto max-w-reading space-y-6 pb-24 sm:pb-0">
    <PageHeader title={t('screen.title')} description={t('screen.description')} />
    <OnboardingStepper progress={data.progress} step={step} giftSteps={data.welcomeReward ? GIFT_STEPS : undefined} />
    {/* The three checks and the gift card they earn, on every step between the profile's first page and the end. */}
    {data.welcomeReward && step !== 'profile' && step !== 'done' && <WelcomeGiftStrip card={data.welcomeReward} />}
    {/* The profile's first page: the welcome gift card and every verification step ahead (completion plan 6.5). */}
    {step === 'profile' && standing && <HelperStandingPanel standing={standing} />}
    {(step === 'profile' || step === 'services' || step === 'area') && <section className="space-y-5 rounded-xl border bg-card p-card shadow-card">
      <div className="space-y-2"><h2 className="text-xl font-semibold">{t(`screen.titles.${step}`)}</h2><p className="text-muted-foreground">{t(`screen.descriptions.${step}`)}</p></div>
      {step === 'profile' && <HelperProfileForm key={step} values={data.values.profile} languageOptions={data.languageOptions} onSave={handlers.onSaveProfile} onDraft={data.aiDraftingEnabled ? handlers.onDraftProfile : undefined} submitLabel={t('screen.saveContinue')} agreementNeeded={data.agreementNeeded} />}
      {step === 'services' && <HelperServicesForm key={step} values={data.values.services} categories={data.categories} onSave={handlers.onSaveServices} submitLabel={t('screen.saveContinue')} />}
      {step === 'area' && <HelperAreaForm key={step} values={data.values.area} areas={data.areas} remoteAllowed={remoteAllowed} onSave={handlers.onSaveArea} submitLabel={t('screen.saveContinue')} homeMarket={data.homeMarket} awaitingCity={data.awaitingCity} />}
    </section>}
    {(step === 'phone' || step === 'address') && <>
      {step === 'phone' ? <PhoneStep verification={data.verification} handlers={handlers} /> : <AddressStep verification={data.verification} handlers={handlers} />}
      {next && next.state !== 'locked' && <div><Link href={routes.app.helperOnboarding(next.step)} className={buttonVariants({ variant: 'outline', className: 'w-full sm:w-auto' })}>{t('screen.continueStep', { step: t(`screen.steps.${next.step}`) })}</Link></div>}
    </>}
    {capturing && <IdentityCaptureStep key="identity-capture" verification={data.verification} handlers={handlers} />}
    {provider && <><VerificationPanel key={step} track={step} verification={data.verification} categories={data.categories} bookableCategories={data.progress.bookableCategories} firstPayoutDays={data.firstPayoutDays} handlers={handlers} stickyAction />
      {step === 'background' && data.verification.background.requiredFor.length === 0 && <p className="rounded-xl border bg-card p-card">{t('screen.backgroundSkipped')}</p>}
      {next && next.state !== 'locked' && <div><Link href={routes.app.helperOnboarding(next.step)} className={buttonVariants({ variant: 'outline', className: 'w-full sm:w-auto' })}>{t('screen.continueStep', { step: t(`screen.steps.${next.step}`) })}</Link></div>}
    </>}
    {step === 'done' && <OnboardingDone data={data} onSavePushSubscription={handlers.onSavePushSubscription} />}
  </div>;
}
