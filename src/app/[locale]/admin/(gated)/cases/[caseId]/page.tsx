import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { savedRepliesFor } from '@/modules/support/saved-replies';
import { getAdminCase, staffActorOf } from '@/modules/support/staff';
import {
  addCaseNoteAction,
  assignCaseAction,
  closeCaseAction,
  moderateQuestionAction, moderateThanksAction,
  moderateReviewAction,
  previewResolutionAction,
  reopenCaseAction,
  resolveCaseAction,
  revealCaseConversationAction,
  setCaseStatusAction,
  staffEmailContactAction,
  staffReplyAction,
} from '@/modules/support/staff-actions';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminCaseScreen } from '@/ui/screens/admin';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Case', robots: { index: false } };

/** One case for staff. Moves are bound to the version this page shows (stale pages get version_conflict). */
function AdminCasePage({ params }: PageProps<'/[locale]/admin/cases/[caseId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <AdminCase params={params} />
    </Suspense>
  );
}

async function AdminCase({ params }: Pick<PageProps<'/[locale]/admin/cases/[caseId]'>, 'params'>) {
  const [{ caseId }, viewer] = await Promise.all([params, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const now = await requestNow();
  const found = await getAdminCase(db, staff, caseId, now);
  if (!found) notFound();
  const { data, version } = found;
  // Saved replies to start from, for whoever can reply.
  const savedReplies = data.actions.includes('reply') ? await savedRepliesFor(db, data.case.queue) : [];
  return (
    <AdminCaseScreen
      data={savedReplies.length > 0 ? { ...data, savedReplies } : data}
      now={now.toISOString()}
      handlers={{
        onAssign: assignCaseAction.bind(null, caseId, version),
        onSetStatus: setCaseStatusAction.bind(null, caseId, version),
        onReply: staffReplyAction.bind(null, caseId),
        onEmailContact: staffEmailContactAction.bind(null, caseId),
        onAddNote: addCaseNoteAction.bind(null, caseId),
        onResolve: resolveCaseAction.bind(null, caseId, version),
        onClose: closeCaseAction.bind(null, caseId, version),
        onReopen: reopenCaseAction.bind(null, caseId, version),
        onRevealConversation: revealCaseConversationAction.bind(null, caseId),
        onPreviewResolution: previewResolutionAction.bind(null, caseId),
        onModerateReview: moderateReviewAction.bind(null, caseId),
        onModerateQuestion: moderateQuestionAction.bind(null, caseId),
        onModerateThanks: moderateThanksAction.bind(null, caseId),
      }}
    />
  );
}

export default withClientMessages('[locale]/admin/(gated)/cases/[caseId]/page.tsx', AdminCasePage);
