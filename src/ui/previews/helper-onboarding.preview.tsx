import { BACKGROUND_CHECK_STATUSES, IDENTITY_STATUSES, PAYOUT_ACCOUNT_STATUSES, routes, type AppShellHandlers, type HelperOnboardingHandlers, type HelperOnboardingPageData, type PreviewEntry } from '@/contracts';
import { fakeHandler, fakeOnboardingHandlers, onboardingAreaDallas, onboardingAreaElsewhere, onboardingAreaStep, onboardingDoneHelping, onboardingBackgroundNotStarted, onboardingBackgroundPending, onboardingDone, onboardingIdentityProcessing, onboardingIdentityRetry, onboardingIdentityStep, onboardingPayoutActionNeeded, onboardingPayoutStep, onboardingProfileStep, onboardingServicesStep, onboardingSetupAbout, onboardingSetupAboutExamples, onboardingSetupAboutPhoto, onboardingSetupServicesChosen, priyaShell, samProfileDraft } from '@/fixtures';
import { HelperOnboardingScreen } from '@/ui/screens/helper/helper-onboarding-screen';
import { AppShell } from '@/ui/shells/app-shell';
import { ClickOnLoad } from './click-on-load';
import copy from '../../../messages/en/ui/helperOnboarding.json';
import verificationCopy from '../../../messages/en/ui/verification.json';

const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
function preview(variant: string, title: string, data: HelperOnboardingPageData, options: { click?: string; handlers?: Partial<HelperOnboardingHandlers> } = {}): PreviewEntry {
  const screen = <HelperOnboardingScreen data={data} handlers={{ ...fakeOnboardingHandlers, ...options.handlers }} />;
  return { id: `screen-helper-onboarding/${variant}`, title, group: copy.screen.previews.group, layout: 'fullscreen', render: () => <AppShell viewer={priyaShell} handlers={shellHandlers} currentPath={routes.app.helperOnboarding(data.step)} layout="flow">{options.click ? <ClickOnLoad label={options.click}>{screen}</ClickOnLoad> : screen}</AppShell> };
}


const nextPart = (part: keyof typeof copy.setup.parts) => copy.setup.next.replace('{part}', copy.setup.parts[part]);

export const helperOnboardingPreviews: PreviewEntry[] = [
  // The profile in one flow (plan 9.11): a new helper starts at What you do.
  preview('profile', copy.setup.previews.services, onboardingProfileStep),
  preview('setup-services-chosen', copy.setup.previews.servicesChosen, onboardingSetupServicesChosen),
  preview('setup-invalid', copy.setup.previews.invalid, onboardingProfileStep, { click: nextPart('area') }),
  preview('setup-save-failed', copy.setup.previews.saveFailed, onboardingSetupServicesChosen, { click: nextPart('area'), handlers: { onSaveServices: async () => ({ ok: false, code: 'unknown' }) } }),
  preview('setup-about', copy.setup.previews.about, onboardingSetupAbout),
  preview('profile-drafted', copy.screen.previews.profileDrafted, onboardingSetupAbout, { click: copy.forms.profile.ai.draft, handlers: { onDraftProfile: async () => ({ ok: true, draft: samProfileDraft }) } }),
  preview('setup-about-examples', copy.setup.previews.aboutExamples, onboardingSetupAboutExamples, { click: copy.setup.examples.use }),
  preview('setup-about-photo', copy.setup.previews.aboutPhoto, onboardingSetupAboutPhoto),
  preview('services', copy.screen.steps.services, onboardingServicesStep),
  preview('area', copy.setup.previews.area, onboardingAreaStep),
  // National (owner, 2026-11-14): a helper somewhere else in the US gives a ZIP and city, and waits for it to open.
  preview('area-elsewhere', copy.screen.previews.areaElsewhere, onboardingAreaElsewhere),
  preview('area-dallas', copy.screen.previews.areaAwaiting, onboardingAreaDallas),
  preview('done-helping', copy.screen.previews.doneAwaitingCity, onboardingDoneHelping),
  preview('identity', copy.screen.steps.identity, onboardingIdentityStep),
  preview('identity-retry', copy.screen.previews.identityRetry, onboardingIdentityRetry),
  preview('identity-processing', copy.screen.previews.identityProcessing, onboardingIdentityProcessing),
  preview('payout', copy.screen.steps.payout, onboardingPayoutStep),
  preview('payout-action-needed', copy.screen.previews.payoutActionNeeded, onboardingPayoutActionNeeded),
  preview('background', copy.screen.steps.background, onboardingBackgroundNotStarted),
  preview('background-pending', copy.screen.previews.backgroundPending, onboardingBackgroundPending),
  preview('done', copy.screen.steps.done, onboardingDone),
  // The provider's double check (stage 2): our own photos are approved until it verifies.
  ...IDENTITY_STATUSES.filter((status) => status === 'verified' || status === 'canceled').map((status) => preview(`identity-${status}`, verificationCopy.statuses.identity[status], { ...onboardingIdentityStep, verification: { ...onboardingIdentityStep.verification, identity: { ...onboardingDone.verification.identity, status, ...(status === 'verified' ? {} : { capture: { stage: 'approved', canSubmit: false, prompt: 'smile', doubleCheck: true } }) } } })),
  ...PAYOUT_ACCOUNT_STATUSES.filter((status) => status === 'active' || status === 'pending' || status === 'restricted').map((status) => preview(`payout-${status}`, verificationCopy.statuses.payout[status], { ...onboardingPayoutStep, verification: { ...onboardingPayoutStep.verification, payout: { status } } })),
  ...BACKGROUND_CHECK_STATUSES.filter((status) => status !== 'not_started' && status !== 'pending').map((status) => preview(`background-${status.replaceAll('_', '-')}`, verificationCopy.statuses.background[status], { ...onboardingBackgroundNotStarted, verification: { ...onboardingBackgroundNotStarted.verification, background: { ...onboardingDone.verification.background, status, requiredFor: status === 'not_required' ? [] : onboardingBackgroundNotStarted.verification.background.requiredFor } } })),
  preview('done-not-bookable', copy.screen.previews.donePending, { ...onboardingIdentityStep, step: 'done' }),
  preview('area-remote', copy.screen.previews.remote, { ...onboardingAreaStep, values: { ...onboardingAreaStep.values, services: { services: [{ categorySlug: 'computer-help', pricingType: 'fixed', fromPriceCents: 4000, description: '' }] } } }),
];
