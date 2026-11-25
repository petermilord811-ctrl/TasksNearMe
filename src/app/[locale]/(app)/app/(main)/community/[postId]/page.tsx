import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import {
  deleteFromPostPageAction,
  editCommunityItemAction,
  followCommunityPostAction,
  loadCommunityReactorsAction,
  moderateCommunityItemAction,
  pinCommunityAnswerAction,
  reactInCommunityAction,
  replyToCommunityPostAction,
  saveCommunityPostAction,
  translateCommunityItemAction,
  uploadCommunityPhotoAction,
} from '@/modules/community/actions';
import { confirmPhoneChangeAction, startPhoneChangeAction } from '@/modules/accounts/account-actions';
import { communityViewerOf } from '@/modules/community/request-viewer';
import { draftCommunityAnswerAction } from '@/modules/assist/ai-actions';
import { withAnswerDraft } from '@/modules/assist/neighbors-ai';
import { getCommunityPost } from '@/modules/community/service';
import { localeOrDefault } from '@/contracts';
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
  const [now, locale] = await Promise.all([requestNow(), getLocale()]);
  const reader = await communityViewerOf(viewer.user, localeOrDefault(locale));
  const found = await getCommunityPost(db, reader, postId, now);
  if (!found) notFound();
  // "Draft an answer with AI" (2026-11-24): a helper on an ask in a service they offer.
  const data = await withAnswerDraft(db, viewer.user.id, found);
  return (
    <CommunityPostScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onReact: reactInCommunityAction,
        onReply: replyToCommunityPostAction.bind(null, postId),
        onPin: pinCommunityAnswerAction.bind(null, postId),
        onDelete: deleteFromPostPageAction,
        onSavePost: saveCommunityPostAction,
        ...(reader.staff ? { onModerate: moderateCommunityItemAction } : {}),
        onEdit: editCommunityItemAction,
        onFollow: followCommunityPostAction,
        onUploadPhoto: uploadCommunityPhotoAction,
        onLoadReactors: loadCommunityReactorsAction,
        ...(data.canTranslate ? { onTranslate: translateCommunityItemAction } : {}),
        ...(data.viewer.answerDraft ? { onDraftAnswer: draftCommunityAnswerAction.bind(null, postId) } : {}),
        ...(data.viewer.replyBlocked === 'phone_required' ? { onStartPhoneChange: startPhoneChangeAction, onConfirmPhoneChange: confirmPhoneChangeAction } : {}),
      }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(main)/community/[postId]/page.tsx', CommunityPostPage);
