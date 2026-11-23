import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { localeOrDefault } from '@/contracts';
import { routes } from '@/contracts/routes';
import { createCommunityPostAction, uploadCommunityPhotoAction } from '@/modules/community/actions';
import { communityViewerOf } from '@/modules/community/request-viewer';
import { getNewCommunityPostPage } from '@/modules/community/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { CommunityNewPostDialog } from '@/ui/screens/community/community-new-post-screen';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('community.newPost');
  return { title: t('title'), robots: { index: false } };
}

/**
 * A new post in a dialog over the page it was opened from (2026-11-22, owner: "do post with dialog"; the full page:
 * (app)/app/(main)/community/new). `?kind=` picks the kind, `?booking=` the booking a thanks is for (plan 10.12).
 */
function NewCommunityPostDialogPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <NewPost searchParams={searchParams} />
    </Suspense>
  );
}

async function NewPost({ searchParams }: { searchParams: SearchParams }) {
  const search = await searchParams;
  const kind = Array.isArray(search.kind) ? search.kind[0] : search.kind;
  const booking = Array.isArray(search.booking) ? search.booking[0] : search.booking;
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.newCommunityPost()));
  const [now, locale] = await Promise.all([requestNow(), getLocale()]);
  const data = await getNewCommunityPostPage(db, await communityViewerOf(viewer.user, localeOrDefault(locale)), kind, booking, now);
  // Nothing to post to (no home market): said in the dialog (2026-11-23), not by moving the page underneath to Home.
  if (!data) notFound();
  return <CommunityNewPostDialog data={data} handlers={{ onPost: createCommunityPostAction, onUploadPhoto: uploadCommunityPhotoAction }} />;
}

export default withClientMessages('[locale]/@modal/(.)app/community/new/page.tsx', NewCommunityPostDialogPage);
