import { useTranslations } from 'next-intl';
import type { HelperOnboardingHandlers, HelperOnboardingPageData, HelperStandingView } from '@/contracts';
import { PageHeader } from '@/ui/components/layout/page-header';
import { PushPrompt } from '@/ui/components/push/push-device';
import { AddressFlow } from '@/ui/screens/verify/address-flow';
import { IdFlow } from '@/ui/screens/verify/id-flow';
import { PhoneFlow } from '@/ui/screens/verify/phone-flow';
import { VerificationHub } from '@/ui/screens/verify/verification-hub';
import { HelperProfileSetup } from './profile-setup';
import { HelperStandingPanel } from './helper-standing';

/**
 * Helper setup, one page per step (blueprint 06 §1). The profile's three parts are one flow (plan 9.11). The checks are
 * picked in any order on Verifications (owner, 2026-11-27): the phone, home address and ID steps are their flows on a
 * page of their own (the same flows open in a dialog from Verifications), and the payout, background and last steps are
 * Verifications itself, where the providers bring people back.
 */
export function HelperOnboardingScreen({ data, handlers, standing }: { data: HelperOnboardingPageData; handlers: HelperOnboardingHandlers; standing?: HelperStandingView }) {
  const t = useTranslations('helperOnboarding');
  const { step } = data;
  if (step === 'profile' || step === 'services' || step === 'area') {
    // The profile's flow is wider on desktop: About you shows the card clients will see beside the form.
    return <div className="mx-auto max-w-reading space-y-6 pb-24 sm:pb-0 lg:max-w-4xl">
      <PageHeader title={t('setup.title')} description={t('setup.description')} />
      <HelperProfileSetup data={data} handlers={handlers} />
      {standing && <HelperStandingPanel standing={standing} />}
    </div>;
  }
  if (step === 'phone') return <div className="py-2 sm:py-6"><PhoneFlow variant="page" verification={data.verification} handlers={handlers} /></div>;
  if (step === 'address') return <div className="py-2 sm:py-6"><AddressFlow variant="page" verification={data.verification} handlers={handlers} /></div>;
  if (step === 'identity') return <div className="py-2 sm:py-6"><IdFlow variant="page" verification={data.verification} handlers={handlers} /></div>;
  return <div className="space-y-6">
    <VerificationHub data={data} handlers={handlers} />
    {step === 'done' && data.progress.bookable && data.push && <div className="mx-auto w-full max-w-[44rem]"><PushPrompt push={data.push} onSave={handlers.onSavePushSubscription} kind="tasks" /></div>}
  </div>;
}
