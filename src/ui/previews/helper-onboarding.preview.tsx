import { useTranslations } from 'next-intl';
import { ACTION_ERROR_CODES, BACKGROUND_CHECK_STATUSES, IDENTITY_STATUSES, PAYOUT_ACCOUNT_STATUSES, routes, type AppShellHandlers, type HelperOnboardingPageData, type PreviewEntry } from '@/contracts';
import { fakeHandler, fakeOnboardingHandlers, onboardingAreaStep, onboardingIdentityCaptureApproved, onboardingBackgroundNotStarted, onboardingBackgroundPending, onboardingDone, onboardingIdentityProcessing, onboardingIdentityRetry, onboardingIdentityStep, onboardingPayoutActionNeeded, onboardingPayoutStep, onboardingProfileStep, onboardingServicesStep, priyaShell, samProfileDraft } from '@/fixtures';
import { HelperOnboardingScreen } from '@/ui/screens/helper/helper-onboarding-screen';
import { VerificationPanel } from '@/ui/screens/helper/verification-panel';
import { AppShell } from '@/ui/shells/app-shell';
import { ClickOnLoad } from './click-on-load';
import copy from '../../../messages/en/ui/helperOnboarding.json';
import verificationCopy from '../../../messages/en/ui/verification.json';

const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
function preview(variant: string, title: string, data: HelperOnboardingPageData): PreviewEntry {
  return { id: `screen-helper-onboarding/${variant}`, title, group: copy.screen.previews.group, layout: 'fullscreen', render: () => <AppShell viewer={priyaShell} handlers={shellHandlers} currentPath={routes.app.helperOnboarding(data.step)} layout="flow"><HelperOnboardingScreen data={data} handlers={fakeOnboardingHandlers} /></AppShell> };
}

function ProviderErrors() {
  const t = useTranslations('helperOnboarding');
  return <main className="mx-auto max-w-reading space-y-6 px-gutter py-8"><h1 className="text-2xl font-bold">{t('screen.previews.errors')}</h1><p>{t('screen.previews.errorHint')}</p>{ACTION_ERROR_CODES.map((code) => <VerificationPanel key={code} track="identity" verification={onboardingIdentityCaptureApproved.verification} categories={onboardingIdentityStep.categories} bookableCategories={[]} initialResult={{ ok: false, code }} handlers={{ ...fakeOnboardingHandlers, onStartIdentity: fakeHandler({ ok: false, code }, 1800) }} />)}</main>;
}

export const helperOnboardingPreviews: PreviewEntry[] = [
  preview('profile', copy.screen.steps.profile, onboardingProfileStep),
  {
    id: 'screen-helper-onboarding/profile-drafted', title: copy.screen.previews.profileDrafted, group: copy.screen.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={priyaShell} handlers={shellHandlers} currentPath={routes.app.helperOnboarding('profile')} layout="flow">
      <ClickOnLoad label={copy.forms.profile.ai.draft}>
        <HelperOnboardingScreen data={onboardingProfileStep} handlers={{ ...fakeOnboardingHandlers, onDraftProfile: async () => ({ ok: true, draft: samProfileDraft }) }} />
      </ClickOnLoad>
    </AppShell>,
  },
  preview('services', copy.screen.steps.services, onboardingServicesStep),
  preview('area', copy.screen.steps.area, onboardingAreaStep),
  preview('identity', copy.screen.steps.identity, onboardingIdentityStep),
  preview('identity-retry', copy.screen.previews.identityRetry, onboardingIdentityRetry),
  preview('identity-processing', copy.screen.previews.identityProcessing, onboardingIdentityProcessing),
  preview('payout', copy.screen.steps.payout, onboardingPayoutStep),
  preview('payout-action-needed', copy.screen.previews.payoutActionNeeded, onboardingPayoutActionNeeded),
  preview('background', copy.screen.steps.background, onboardingBackgroundNotStarted),
  preview('background-pending', copy.screen.previews.backgroundPending, onboardingBackgroundPending),
  preview('done', copy.screen.steps.done, onboardingDone),
  // The provider's double check (stage 2): our own photos are approved until it verifies.
  ...IDENTITY_STATUSES.filter((status) => status === 'verified' || status === 'canceled').map((status) => preview(`identity-${status}`, verificationCopy.statuses.identity[status], { ...onboardingIdentityStep, verification: { ...onboardingIdentityStep.verification, identity: { ...onboardingDone.verification.identity, status, ...(status === 'verified' ? {} : { capture: { stage: 'approved', canSubmit: false, prompt: 'smile' } }) } } })),
  ...PAYOUT_ACCOUNT_STATUSES.filter((status) => status === 'active' || status === 'pending' || status === 'restricted').map((status) => preview(`payout-${status}`, verificationCopy.statuses.payout[status], { ...onboardingPayoutStep, verification: { ...onboardingPayoutStep.verification, payout: { status } } })),
  ...BACKGROUND_CHECK_STATUSES.filter((status) => status !== 'not_started' && status !== 'pending').map((status) => preview(`background-${status.replaceAll('_', '-')}`, verificationCopy.statuses.background[status], { ...onboardingBackgroundNotStarted, verification: { ...onboardingBackgroundNotStarted.verification, background: { ...onboardingDone.verification.background, status, requiredFor: status === 'not_required' ? [] : onboardingBackgroundNotStarted.verification.background.requiredFor } } })),
  preview('done-not-bookable', copy.screen.previews.donePending, { ...onboardingIdentityStep, step: 'done' }),
  preview('area-remote', copy.screen.previews.remote, { ...onboardingAreaStep, values: { ...onboardingAreaStep.values, services: { services: [{ categorySlug: 'computer-help', pricingType: 'fixed', fromPriceCents: 4000, description: '' }] } } }),
  { id: 'helper-verification/action-errors', title: copy.screen.previews.errors, group: copy.screen.previews.group, layout: 'fullscreen', render: () => <ProviderErrors /> },
];
