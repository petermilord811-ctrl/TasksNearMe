import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ONBOARDING_STEPS, routes, type OnboardingStep } from '@/contracts';
import { draftHelperProfileAction } from '@/modules/assist/actions';
import {
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
} from '@/modules/verification/actions';
import { getOnboardingPageData, onboardingRedirect } from '@/modules/verification/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { savePushSubscriptionAction } from '@/modules/notifications/actions';
import { HelperOnboardingScreen } from '@/ui/screens/helper';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Become a helper', robots: { index: false } };

/** Helper onboarding, one step per page. Locked steps send people to the first step still to do. */
export default function HelperOnboardingPage({ params }: PageProps<'/[locale]/app/helper/onboarding/[step]'>) {
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
  const step = raw as OnboardingStep;
  const now = await requestNow();

  const goTo = await onboardingRedirect(db, viewer.user.id, step, now);
  if (goTo && goTo !== step) redirect(routes.app.helperOnboarding(goTo));
  const data = await getOnboardingPageData(db, viewer.user.id, step, now);
  if (!data) notFound();

  return (
    <HelperOnboardingScreen
      data={data}
      handlers={{
        onSaveProfile: onboardingSaveProfile,
        onDraftProfile: draftHelperProfileAction,
        onSaveServices: onboardingSaveServices,
        onSaveArea: onboardingSaveArea,
        onStartPhone: onboardingStartPhone,
        onConfirmPhone: onboardingConfirmPhone,
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
