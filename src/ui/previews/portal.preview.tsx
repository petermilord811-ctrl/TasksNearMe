import type { ReactNode } from 'react';
import type { AppShellHandlers, CommunityPostHandlers, PortalHandlers, PortalPageData, PreviewEntry } from '@/contracts';
import { routes } from '@/contracts/routes';
import {
  fakeHandler,
  jordanShell,
  mayaShell,
  PORTAL_NOW,
  portalBlockedData,
  portalEmptyData,
  portalFeedData,
  portalFilteredEmptyData,
  portalHelperData,
  portalLaunchData,
  portalStaffSamplesData,
  portalUnansweredData,
  communityPhotos,
  portalListByDayData,
  portalListData,
  portalLongThreadData,
  portalNewData,
  portalPostWithTaskData,
  portalSavedData,
  portalSpanishData,
  portalStaffData,
  portalTaskDiscussion,
  portalTasksData,
} from '@/fixtures';
import { TaskDiscussionLink } from '@/ui/components/community/task-discussion-link';
import { PortalSkeleton } from '@/ui/components/portal/portal-skeleton';
// The rail's sponsored cards (the route imports these styles in the app).
import '@/ui/components/ads/ads.css';
import { CommunityPostScreen } from '@/ui/screens/community/community-post-screen';
import { PortalScreen } from '@/ui/screens/community/portal-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/portal.json';

const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const handlers: PortalHandlers = {
  onReact: fakeHandler({ ok: true, code: 'updated' }),
  onSavePost: fakeHandler({ ok: true, code: 'updated' }),
  onPost: fakeHandler({ ok: true, code: 'sent' }),
  onReply: async () => ({ ok: true, code: 'sent', sparks: 2 }),
  onUploadPhoto: async () => ({ ok: true, photo: communityPhotos.boxes }),
  onEdit: fakeHandler({ ok: true, code: 'updated' }),
  onFollow: fakeHandler({ ok: true, code: 'updated' }),
  onDelete: fakeHandler({ ok: true, code: 'updated' }),
  onLoadReactors: async () => ({ helpful: ['Priya S.', 'Nate O.'], thanks: ['Ana P.'] }),
  onSetArea: fakeHandler({ ok: true, code: 'updated' }),
  onDismissAnnouncement: fakeHandler({ ok: true, code: 'updated' }),
  onShowSamples: fakeHandler({ ok: true, code: 'updated' }),
};
const helperHandlers: PortalHandlers = { ...handlers, onSaveTask: fakeHandler({ ok: true, code: 'updated' }) };
const postHandlers: CommunityPostHandlers = {
  onReact: fakeHandler({ ok: true, code: 'updated' }),
  onReply: fakeHandler({ ok: true, code: 'sent' }),
  onPin: fakeHandler({ ok: true, code: 'updated' }),
  onDelete: fakeHandler({ ok: true, code: 'updated' }),
  onSavePost: fakeHandler({ ok: true, code: 'updated' }),
};
const p = copy.previews;

function page(id: string, title: string, path: string, render: () => ReactNode, viewer = mayaShell): PreviewEntry {
  return { id: `screen-portal/${id}`, group: p.group, title, layout: 'fullscreen', render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={path}>{render()}</AppShell> };
}
const screen = (data: PortalPageData, portalHandlers = handlers) => <PortalScreen data={data} handlers={portalHandlers} now={PORTAL_NOW} />;

/** The neighborhood portal (completion plan 9.10): every state, at 360 and 1280 (the rail shows from 1280). */
export const portalPreviews: PreviewEntry[] = [
  page('feed', p.feed, routes.app.community(), () => screen(portalFeedData)),
  page('feed-new', p.feedNew, routes.app.community({ sort: 'new' }), () => screen(portalNewData)),
  page('list', p.list, routes.app.community({ view: 'list' }), () => screen(portalListData)),
  page('list-by-day', p.listByDay, routes.app.community({ view: 'list', group: 'day', sort: 'new' }), () => screen(portalListByDayData)),
  page('helper', p.helper, routes.app.community(), () => screen(portalHelperData, helperHandlers), jordanShell),
  page('tasks', p.tasks, routes.app.community({ type: 'task', area: 'mueller' }), () => screen(portalTasksData)),
  page('saved', p.saved, routes.app.community({ saved: true }), () => screen(portalSavedData)),
  page('filtered-empty', p.filteredEmpty, routes.app.community({ type: 'thanks', area: 'windsor-park', time: '7d' }), () => screen(portalFilteredEmptyData)),
  page('empty', p.empty, routes.app.community(), () => screen(portalEmptyData)),
  page('blocked', p.blocked, routes.app.community(), () => screen(portalBlockedData)),
  page('staff', p.staff, routes.app.community(), () => screen(portalStaffData)),
  page('loading', p.loading, routes.app.community(), () => <PortalSkeleton />),
  page('spanish', p.spanish, routes.app.community(), () => screen(portalSpanishData)),
  page('launch', p.launch, routes.app.community(), () => screen(portalLaunchData)),
  page('unanswered', p.unanswered, routes.app.community({ unanswered: true }), () => screen(portalUnansweredData)),
  page('staff-samples', p.staffSamples, routes.app.community(), () => screen(portalStaffSamplesData)),
  page('long-thread', p.longThread, routes.app.communityPost(portalLongThreadData.post.id), () => <CommunityPostScreen data={portalLongThreadData} handlers={postHandlers} now={PORTAL_NOW} />),
  page('post-with-task', p.postWithTask, routes.app.communityPost(portalPostWithTaskData.post.id), () => <CommunityPostScreen data={portalPostWithTaskData} handlers={postHandlers} now={PORTAL_NOW} />),
  { id: 'portal-parts/task-discussion', group: p.group, title: p.taskDiscussion, render: () => <div className="mx-auto max-w-2xl"><TaskDiscussionLink discussion={portalTaskDiscussion} /></div> },
];
