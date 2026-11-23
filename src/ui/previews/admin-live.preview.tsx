import type { ReactNode } from 'react';
import { routes, type AdminLivePageData, type PreviewEntry } from '@/contracts';
import {
  ADMIN_NOW,
  adminLiveEmptyData,
  adminLiveEndedChatData,
  adminLiveRatedChatData,
  adminLiveJoinedChatData,
  adminLiveOthersChatData,
  adminLiveQueueData,
  adminLiveWaitingChatData,
  alexStaff,
  fakeAdminLiveHandlers,
  fakeHandler,
} from '@/fixtures';
import { AdminLiveScreen } from '@/ui/screens/admin/admin-live-screen';
import { AdminShell } from '@/ui/shells/admin-shell';
import liveCopy from '../../../messages/en/ui/adminLive.json';

/** The staff live chat console (2026-11-22): the queue, a chat to join, one under way, another agent's, one ended. */

const shellHandlers = { onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const c = liveCopy.previews;

function Shell({ data, children }: { data: AdminLivePageData; children: ReactNode }) {
  return <AdminShell viewer={{ ...alexStaff, liveWaiting: data.waiting.length }} handlers={shellHandlers} currentPath={routes.admin.liveChat()}>{children}</AdminShell>;
}

const entry = (id: string, title: string, data: AdminLivePageData): PreviewEntry => ({
  id: `screen-admin-live/${id}`,
  group: c.group,
  title,
  layout: 'fullscreen',
  render: () => <Shell data={data}><AdminLiveScreen data={data} handlers={fakeAdminLiveHandlers} now={ADMIN_NOW} /></Shell>,
});

export const adminLivePreviews: PreviewEntry[] = [
  entry('queue', c.queue, adminLiveQueueData),
  entry('waiting-chat', c.waitingChat, adminLiveWaitingChatData),
  entry('joined', c.joined, adminLiveJoinedChatData),
  entry('others', c.others, adminLiveOthersChatData),
  entry('ended', c.ended, adminLiveEndedChatData),
  // The member's rating after the chat (2026-11-23).
  entry('rated', c.rated, adminLiveRatedChatData),
  entry('empty', c.empty, adminLiveEmptyData),
  entry('read-only', c.readOnly, { ...adminLiveWaitingChatData, canWork: false, selected: { ...adminLiveWaitingChatData.selected!, canJoin: false } }),
];
