import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getAdminLivePage } from '@/modules/support/live-chat';
import { endLiveChatAction, joinLiveChatAction, liveReplyAction, liveTypingAction } from '@/modules/support/live-chat-actions';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { STAFF_SUPPORT_CHANNEL } from '@/platform/realtime/hub';
import { realtimeHub } from '@/platform/realtime/listener';
import { PageSkeleton } from '@/ui/components';
import { AdminLiveScreen } from '@/ui/screens/admin/admin-live-screen';
import { LiveRefresh } from './live-refresh';

export const metadata: Metadata = { title: 'Live chat', robots: { index: false } };

/**
 * Live chat (2026-11-22, owner: "I will support chatting (admins)"): members waiting for a person from TasksNearMe Help,
 * the chats under way, and the open one (`?case=`). The page refreshes on the staff channel's live notices (the admin
 * layout's RealtimeProvider), so a new chat, a join or a member's message shows at once.
 */
function AdminLivePage({ searchParams }: PageProps<'/[locale]/admin/live'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <AdminLive searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminLive({ searchParams }: Pick<PageProps<'/[locale]/admin/live'>, 'searchParams'>) {
  const [params, viewer] = await Promise.all([searchParams, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const now = await requestNow();
  const selected = typeof params.case === 'string' && params.case ? params.case : undefined;
  const data = await getAdminLivePage(db, staff, now, { ...(selected ? { selected } : {}), agentsOnline: realtimeHub().count(STAFF_SUPPORT_CHANNEL) });
  return <>
    <LiveRefresh />
    <AdminLiveScreen data={data} now={now.toISOString()} handlers={{ onJoin: joinLiveChatAction, onEnd: endLiveChatAction, onReply: liveReplyAction, onTyping: liveTypingAction }} />
  </>;
}

export default withClientMessages('[locale]/admin/(gated)/live/page.tsx', AdminLivePage);
