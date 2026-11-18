import type { ReactNode } from 'react';
import type { AppShellHandlers, CommunityNewPostHandlers, CommunityPostHandlers, PreviewEntry } from '@/contracts';
import { routes } from '@/contracts/routes';
import {
  communityNewPostPageData,
  communityNewThanksData,
  communityPostHelperViewData,
  communityPostPageData,
  communityPostStaffData,
  fakeHandler,
  jordanShell,
  mayaShell,
} from '@/fixtures';
import { CommunityNewPostScreen } from '@/ui/screens/community/community-new-post-screen';
import { CommunityPostScreen } from '@/ui/screens/community/community-post-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/community.json';

const now = '2026-11-17T15:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const postHandlers: CommunityPostHandlers = {
  onReact: fakeHandler({ ok: true, code: 'updated' }),
  onReply: fakeHandler({ ok: true, code: 'sent' }),
  onPin: fakeHandler({ ok: true, code: 'updated' }),
  onDelete: fakeHandler({ ok: true, code: 'updated' }),
  onModerate: fakeHandler({ ok: true, code: 'updated' }),
};
const newHandlers: CommunityNewPostHandlers = { onPost: fakeHandler({ ok: true, code: 'sent' }) };
const p = copy.previews;

function page(id: string, title: string, path: string, render: () => ReactNode, viewer = mayaShell): PreviewEntry {
  return { id: `screen-community/${id}`, group: p.group, title, layout: 'fullscreen', render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={path}>{render()}</AppShell> };
}

export const communityPreviews: PreviewEntry[] = [
  page('post', p.post, routes.app.communityPost(communityPostPageData.post.id), () => <CommunityPostScreen data={communityPostPageData} handlers={postHandlers} now={now} />),
  page('post-helper', p.post, routes.app.communityPost(communityPostHelperViewData.post.id), () => <CommunityPostScreen data={communityPostHelperViewData} handlers={postHandlers} now={now} />, jordanShell),
  page('post-staff', p.postStaff, routes.app.communityPost(communityPostStaffData.post.id), () => <CommunityPostScreen data={communityPostStaffData} handlers={postHandlers} now={now} />),
  page('new', p.newPost, routes.app.newCommunityPost(), () => <CommunityNewPostScreen data={communityNewPostPageData} handlers={newHandlers} />),
  page('new-thanks', p.newThanks, routes.app.newCommunityPost('thanks'), () => <CommunityNewPostScreen data={communityNewThanksData} handlers={newHandlers} />),
];
