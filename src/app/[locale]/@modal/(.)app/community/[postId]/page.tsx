import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { localeOrDefault } from '@/contracts';
import { routes } from '@/contracts/routes';
import { confirmPhoneChangeAction, startPhoneChangeAction } from '@/modules/accounts/account-actions';
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
import { communityViewerOf } from '@/modules/community/request-viewer';
import { draftCommunityAnswerAction } from '@/modules/assist/ai-actions';
import { withAnswerDraft } from '@/modules/assist/neighbors-ai';
import { getCommunityPost } from '@/modules/community/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { CommunityPostDialog } from '@/ui/screens/community/community-post-screen';

type Params = Promise<{ postId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('community');
  return { title: t('title'), robots: { index: false } };
}

/**
 * A Neighbors post in a dialog over the page it was opened from (2026-11-23, owner: "I hate to redirect to new pages
 * continually … if possible, use dialog"): the feed keeps its scroll and filters underneath. The full page:
 * (app)/app/(main)/community/[postId], for a link loaded directly.
 */
function CommunityPostDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <Post params={params} />
    </Suspense>
  );
}

async function Post({ params }: { params: Params }) {
  const [{ postId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.communityPost(postId)));
  const [now, locale] = await Promise.all([requestNow(), getLocale()]);
  const reader = await communityViewerOf(viewer.user, localeOrDefault(locale));
  const found = await getCommunityPost(db, reader, postId, now);
  if (!found) notFound();
  const data = await withAnswerDraft(db, viewer.user.id, found);
  // The signed-in shell's clock, as the full page has it (the dialog opens outside the shell).
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <CommunityPostDialog
        data={data}
        now={now.toISOString()}
        handlers={{
          onReact: reactInCommunityAction,
          onReply: replyToCommunityPostAction.bind(null, postId),
          onPin: pinCommunityAnswerAction.bind(null, postId),
          // Deleting the post closes the dialog over the page it opened on (CommunityItemActions); a reply stays.
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
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/community/[postId]/page.tsx', CommunityPostDialogPage);
