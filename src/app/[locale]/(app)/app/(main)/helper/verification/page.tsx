import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { appPageMetadata } from '@/i18n/metadata';
import { helperInviteFor } from '@/modules/beta/server';
import { onboardingStartBackgroundCheck, onboardingStartPayout } from '@/modules/verification/actions';
import { getOnboardingPageData } from '@/modules/verification/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { VerificationHub } from '@/ui/screens/verify/verification-hub';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('helperVerification');
}

/**
 * Verifications (owner, 2026-11-27: "not able to pick preferred verification. change it."): every check on one page, in
 * any order. The ID, home address and phone open in a dialog over it (routes.app.helperCheck); payouts and the
 * background check go to their providers, which bring people back to their onboarding step (the same list).
 */
function HelperVerificationPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Verifications />
    </Suspense>
  );
}

async function Verifications() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.helperVerification()));
  // Private beta: setup can wait for a helper invite, which setup's first page asks for.
  if (await helperInviteFor(db, viewer.user.id)) redirect(routes.app.helperOnboarding());
  const data = await getOnboardingPageData(db, viewer.user.id, 'done', await requestNow());
  if (!data) notFound();
  return <VerificationHub data={data} handlers={{ onStartPayout: onboardingStartPayout, onStartBackgroundCheck: onboardingStartBackgroundCheck }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/helper/verification/page.tsx', HelperVerificationPage);
