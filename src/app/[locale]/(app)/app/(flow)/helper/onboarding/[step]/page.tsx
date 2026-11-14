import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ONBOARDING_STEPS, routes, type OnboardingStep } from '@/contracts';
import { draftHelperProfileAction } from '@/modules/assist/actions';
import {
  onboardingAcceptIdentityNotice,
  onboardingConfirmPhone,
  onboardingRefreshStatus,
  onboardingSaveArea,
  onboardingSaveProfile,
  onboardingSaveServices,
  onboardingSearchHomeAddresses,
  onboardingStartBackgroundCheck,
  onboardingStartIdentity,
  onboardingStartPayout,
  onboardingStartPhone,
  onboardingSubmitAddressProof,
  onboardingSubmitIdentityCapture,
} from '@/modules/verification/actions';
import { getOnboardingPageData, onboardingRedirect } from '@/modules/verification/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { savePushSubscriptionAction } from '@/modules/notifications/actions';
import { HelperOnboardingScreen } from '@/ui/screens/helper';
import { requestNow } from '@/platform/clock';
import { verificationSteps } from '@/modules/badges/standing';
import { redeemHelperInvite } from '@/modules/beta/actions';
import { helperInviteFor } from '@/modules/beta/server';
import { HelperInviteScreen } from '@/ui/screens/beta';

export const metadata: Metadata = { title: 'Become a helper', robots: { index: false } };

/** Helper onboarding, one step per page. Locked steps send people to the first step still to do. */
function HelperOnboardingPage({ params }: PageProps<'/[locale]/app/helper/onboarding/[step]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Onboarding params={params} />
    </Suspense>
  );
}

async function Onboarding({ params }: Pick<PageProps<'/[locale]/app/helper/onboarding/[step]'>, 'params'>) {
  const [{ step: raw }, viewer] = await Promise.all([params, getViewer()]);
  if (!(ONBOARDING_STEPS as readonly string[]).includes(raw)) notFound();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.helperOnboarding()));
  // Private beta: starting helper setup can wait for a helper invite (src/modules/beta).
  const helperInvite = await helperInviteFor(db, viewer.user.id);
  if (helperInvite) return <HelperInviteScreen data={helperInvite} handlers={{ onRedeem: redeemHelperInvite }} />;
  const step = raw as OnboardingStep;
  const now = await requestNow();

  const goTo = await onboardingRedirect(db, viewer.user.id, step, now);
  if (goTo && goTo !== step) redirect(routes.app.helperOnboarding(goTo));
  const data = await getOnboardingPageData(db, viewer.user.id, step, now);
  if (!data) notFound();
  // The profile's first page (completion plan 6.5): the welcome gift card and the checks above the profile step.
  return (
    <HelperOnboardingScreen
      data={data}
      standing={{ steps: verificationSteps(data.progress), ...(data.welcomeReward ? { giftCard: data.welcomeReward } : {}) }}
      handlers={{
        onSaveProfile: onboardingSaveProfile,
        onDraftProfile: draftHelperProfileAction,
        onSaveServices: onboardingSaveServices,
        onSaveArea: onboardingSaveArea,
        onStartPhone: onboardingStartPhone,
        onConfirmPhone: onboardingConfirmPhone,
        onAcceptIdentityNotice: onboardingAcceptIdentityNotice,
        onSubmitIdentityCapture: onboardingSubmitIdentityCapture,
        onStartIdentity: onboardingStartIdentity,
        onSearchAddresses: onboardingSearchHomeAddresses,
        onSubmitAddressProof: onboardingSubmitAddressProof,
        onStartPayout: onboardingStartPayout,
        onStartBackgroundCheck: onboardingStartBackgroundCheck,
        onRefreshStatus: onboardingRefreshStatus,
        onSavePushSubscription: savePushSubscriptionAction,
      }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(flow)/helper/onboarding/[step]/page.tsx', HelperOnboardingPage);
