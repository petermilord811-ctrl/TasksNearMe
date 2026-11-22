import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { createCommunityPostAction, uploadCommunityPhotoAction } from '@/modules/community/actions';
import { communityViewerOf } from '@/modules/community/request-viewer';
import { getNewCommunityPostPage } from '@/modules/community/service';
import { localeOrDefault } from '@/contracts';
import { requestNow } from '@/platform/clock';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { CommunityNewPostScreen } from '@/ui/screens/community/community-new-post-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('community.newPost');
  return { title: t('title'), robots: { index: false } };
}

/** A new community post (completion plan 7.7): `?kind=` picks the kind, `?booking=` the booking a thanks is for (plan 10.12). */
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
  const booking = Array.isArray(search.booking) ? search.booking[0] : search.booking;
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.newCommunityPost()));
  const [now, locale] = await Promise.all([requestNow(), getLocale()]);
  const data = await getNewCommunityPostPage(db, await communityViewerOf(viewer.user, localeOrDefault(locale)), kind, booking, now);
  if (!data) redirect(routes.app.home());
  return <CommunityNewPostScreen data={data} handlers={{ onPost: createCommunityPostAction, onUploadPhoto: uploadCommunityPhotoAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/community/new/page.tsx', NewCommunityPostPage);
