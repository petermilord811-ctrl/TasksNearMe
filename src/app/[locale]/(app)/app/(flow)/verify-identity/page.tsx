import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { onboardingRefreshStatus, startPosterIdentityAction } from '@/modules/verification/actions';
import { getPosterIdentityPage } from '@/modules/verification/poster-identity';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { PosterIdentityScreen } from '@/ui/screens/verify';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('verifyIdentity');
}

/**
 * A client's ID check, when risk asks for one (blueprint 01 P2): posting and paying send the person here
 * with `next`, and "Continue" goes back there once the check passes.
 */
function VerifyIdentityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <VerifyIdentity searchParams={searchParams} />
    </Suspense>
  );
}

async function VerifyIdentity({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [viewer, search] = await Promise.all([getViewer(), searchParams]);
  const next = typeof search.next === 'string' ? search.next : undefined;
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.verifyIdentity(next)));
  const data = await getPosterIdentityPage(db, viewer.user.id, next, await requestNow());
  return <PosterIdentityScreen data={data} handlers={{ onStartIdentity: startPosterIdentityAction, onRefreshStatus: onboardingRefreshStatus }} />;
}

export default withClientMessages('[locale]/(app)/app/(flow)/verify-identity/page.tsx', VerifyIdentityPage);
