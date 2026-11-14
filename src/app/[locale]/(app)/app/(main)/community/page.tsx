import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { loadCommunityFeedPageAction, reactInCommunityAction } from '@/modules/community/actions';
import { getCommunityFeed } from '@/modules/community/service';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { CommunityFeedScreen } from '@/ui/screens/community/community-feed-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('community');
  return { title: t('title'), robots: { index: false } };
}

/** The community feed (completion plan 7.7): signed-in members of the market only. */
function CommunityPage({ searchParams }: PageProps<'/[locale]/app/community'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Feed searchParams={searchParams} />
    </Suspense>
  );
}

async function Feed({ searchParams }: Pick<PageProps<'/[locale]/app/community'>, 'searchParams'>) {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.community()));
  const [search, now] = await Promise.all([searchParams, requestNow()]);
  const data = await getCommunityFeed(db, { id: viewer.user.id, staff: staffActorOf(viewer.user) }, search, now);
  if (!data) redirect(routes.app.home());
  return <CommunityFeedScreen data={data} now={now.toISOString()} handlers={{ onReact: reactInCommunityAction, onMore: loadCommunityFeedPageAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/community/page.tsx', CommunityPage);
