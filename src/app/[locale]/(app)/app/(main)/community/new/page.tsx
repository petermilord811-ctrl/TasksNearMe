import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { createCommunityPostAction } from '@/modules/community/actions';
import { getNewCommunityPostPage } from '@/modules/community/service';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { CommunityNewPostScreen } from '@/ui/screens/community/community-new-post-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('community.newPost');
  return { title: t('title'), robots: { index: false } };
}

/** A new community post (completion plan 7.7): `?kind=` picks the kind. */
function NewCommunityPostPage({ searchParams }: PageProps<'/[locale]/app/community/new'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <NewPost searchParams={searchParams} />
    </Suspense>
  );
}

async function NewPost({ searchParams }: Pick<PageProps<'/[locale]/app/community/new'>, 'searchParams'>) {
  const search = await searchParams;
  const kind = Array.isArray(search.kind) ? search.kind[0] : search.kind;
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.newCommunityPost()));
  const data = await getNewCommunityPostPage(db, { id: viewer.user.id, staff: staffActorOf(viewer.user) }, kind);
  if (!data) redirect(routes.app.home());
  return <CommunityNewPostScreen data={data} handlers={{ onPost: createCommunityPostAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/community/new/page.tsx', NewCommunityPostPage);
