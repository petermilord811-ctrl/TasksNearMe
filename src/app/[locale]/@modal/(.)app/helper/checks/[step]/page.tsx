import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { isHelperCheckDialogStep, routes } from '@/contracts';
import { helperInviteFor } from '@/modules/beta/server';
import {
  onboardingAcceptIdentityNotice,
  onboardingCheckProgress,
  onboardingConfirmPhone,
  onboardingRefreshStatus,
  onboardingSearchHomeAddresses,
  onboardingStartIdentity,
  onboardingStartPhone,
  onboardingSubmitAddressProof,
  onboardingSubmitIdentityCapture,
} from '@/modules/verification/actions';
import { getOnboardingPageData, onboardingRedirect } from '@/modules/verification/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { HelperCheckDialogScreen } from '@/ui/screens/helper/helper-check-dialog';

type Params = Promise<{ step: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('becomeHelper');
}

/**
 * A helper's phone, home address or ID check in a dialog over the page (2026-11-23, owner: "I hate to redirect to new
 * pages continually … if possible, use dialog"; 2026-11-27: the ID too, any check in any order), from Verifications, the
 * verified-helper reminder and the verification checklist. Loaded directly, /app/helper/checks/[step] is the onboarding
 * step's page, the same flow on a page of its own.
 */
function HelperCheckDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <HelperCheck params={params} />
    </Suspense>
  );
}

async function HelperCheck({ params }: { params: Params }) {
  const [{ step }, viewer] = await Promise.all([params, getViewer()]);
  if (!isHelperCheckDialogStep(step)) notFound();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.helperCheck(step)));
  const userId = viewer.user.id;
  const now = await requestNow();
  const handlers = {
    onStartPhone: onboardingStartPhone,
    onConfirmPhone: onboardingConfirmPhone,
    onSearchAddresses: onboardingSearchHomeAddresses,
    onSubmitAddressProof: onboardingSubmitAddressProof,
    onCheckProgress: onboardingCheckProgress,
    onAcceptIdentityNotice: onboardingAcceptIdentityNotice,
    onSubmitIdentityCapture: onboardingSubmitIdentityCapture,
    onStartIdentity: onboardingStartIdentity,
    onRefreshStatus: onboardingRefreshStatus,
  };
  // Private beta: setup can wait for a helper invite, which its first page asks for.
  if (await helperInviteFor(db, userId)) return <HelperCheckDialogScreen data={{ step, elsewhere: 'profile' }} handlers={handlers} />;
  // A step that isn't open yet (or isn't offered here): where setup goes first, as on the step's own page.
  const goTo = await onboardingRedirect(db, userId, step, now);
  if (goTo && goTo !== step) return <HelperCheckDialogScreen data={{ step, elsewhere: goTo }} handlers={handlers} />;
  const data = await getOnboardingPageData(db, userId, step, now);
  if (!data) notFound();
  return <HelperCheckDialogScreen data={{ step, verification: data.verification }} handlers={handlers} />;
}

export default withClientMessages('[locale]/@modal/(.)app/helper/checks/[step]/page.tsx', HelperCheckDialogPage);
