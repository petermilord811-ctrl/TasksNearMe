import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { createCommunityPostAction, loadPortalPageAction, portalFreshAction, reactInCommunityAction, saveCommunityPostAction } from '@/modules/community/actions';
import { getPortal } from '@/modules/community/portal';
import { saveTaskAction } from '@/modules/offers/helper-actions';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PortalSkeleton } from '@/ui/components/portal/portal-skeleton';
import { PortalScreen } from '@/ui/screens/community/portal-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('portal');
  return { title: t('title'), robots: { index: false } };
}

/**
 * The neighborhood portal (completion plan 9.10): the community's posts and the open tasks near you in one place,
 * as a Feed or a List over one set of filters in the URL. Signed-in members of the market only.
 */
function CommunityPage({ searchParams }: PageProps<'/[locale]/app/community'>) {
  return (
    <Suspense fallback={<PortalSkeleton />}>
      <Portal searchParams={searchParams} />
    </Suspense>
  );
}

async function Portal({ searchParams }: Pick<PageProps<'/[locale]/app/community'>, 'searchParams'>) {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.community()));
  const [search, now] = await Promise.all([searchParams, requestNow()]);
  const data = await getPortal(db, { id: viewer.user.id, staff: staffActorOf(viewer.user) }, search, now);
  if (!data) redirect(routes.app.home());
  return (
    <PortalScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onReact: reactInCommunityAction,
        onSavePost: saveCommunityPostAction,
        ...(data.helps ? { onSaveTask: saveTaskAction } : {}),
        onPost: createCommunityPostAction,
        onMore: loadPortalPageAction,
        onCheckFresh: portalFreshAction,
      }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(main)/community/page.tsx', CommunityPage);
