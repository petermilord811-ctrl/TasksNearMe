import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { deleteOwnCommunityItemAction, moderateCommunityItemAction, pinCommunityAnswerAction, reactInCommunityAction, replyToCommunityPostAction, saveCommunityPostAction } from '@/modules/community/actions';
import { getCommunityPost } from '@/modules/community/service';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { CommunityPostScreen } from '@/ui/screens/community/community-post-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('community');
  return { title: t('title'), robots: { index: false } };
}

/** One community post and its replies (completion plan 7.7). */
function CommunityPostPage({ params }: PageProps<'/[locale]/app/community/[postId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Post params={params} />
    </Suspense>
  );
}

async function Post({ params }: Pick<PageProps<'/[locale]/app/community/[postId]'>, 'params'>) {
  const { postId } = await params;
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.communityPost(postId)));
  const staff = staffActorOf(viewer.user);
  const now = await requestNow();
  const data = await getCommunityPost(db, { id: viewer.user.id, staff }, postId, now);
  if (!data) notFound();
  return (
    <CommunityPostScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onReact: reactInCommunityAction,
        onReply: replyToCommunityPostAction.bind(null, postId),
        onPin: pinCommunityAnswerAction.bind(null, postId),
        onDelete: deleteOwnCommunityItemAction,
        onSavePost: saveCommunityPostAction,
        ...(staff ? { onModerate: moderateCommunityItemAction } : {}),
      }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(main)/community/[postId]/page.tsx', CommunityPostPage);
