import type { ReactNode } from 'react';
import { routes, type AppShellHandlers, type NeighborGroupsData, type NeighborGroupView, type PortalHandlers, type PreviewEntry } from '@/contracts';
import {
  adminCaseGroupMessage,
  adminCaseGroupMessageRemoved,
  fakeHandler,
  fakeNeighborGroupHandlers,
  GROUPS_NOW,
  groupViewAdmin,
  groupViewEmpty,
  groupViewMuted,
  groupViewStates,
  inviteExpired,
  inviteWrongArea,
  mayaShell,
  neighborGroupsEmpty,
  neighborGroupsLimit,
  neighborGroupsNoArea,
  neighborGroupsSome,
  neighborGroupsUnread,
  neighborGroupsWithInvite,
  portalWithGroupsData,
} from '@/fixtures';
import { NeighborGroupPanel, type NeighborGroupTab } from '@/ui/components/community/neighbor-group-sheet';
import { NeighborGroupsCard } from '@/ui/components/portal/neighbor-groups-card';
import { AdminReportedGroupMessage } from '@/ui/screens/admin/admin-reported-group-message';
import { PortalScreen } from '@/ui/screens/community/portal-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/neighborGroups.json';

/** Building and street groups (2026-11-24): the card on Neighbors, its dialogs, and a group in every state. */

const p = copy.previews;
const GROUP = 'Neighbor groups';
const handlers = fakeNeighborGroupHandlers();
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const portalHandlers: PortalHandlers = {
  onReact: fakeHandler({ ok: true, code: 'updated' }),
  onSavePost: fakeHandler({ ok: true, code: 'updated' }),
  onPost: fakeHandler({ ok: true, code: 'sent' }),
  onReply: fakeHandler({ ok: true, code: 'sent' }),
  onSetArea: fakeHandler({ ok: true, code: 'updated' }),
  groups: handlers,
};

const card = (id: string, title: string, data: NeighborGroupsData, extra: { dialog?: 'create' | 'join' } = {}): PreviewEntry => ({
  id: `neighbor-groups/${id}`,
  group: GROUP,
  title,
  render: () => <div className="mx-auto max-w-2xl"><NeighborGroupsCard data={data} handlers={handlers} now={GROUPS_NOW} {...(extra.dialog ? { initialDialog: extra.dialog } : {})} /></div>,
});

/** The card as the rail's first card on wide screens, at the rail's width. */
const railCard = (id: string, title: string, data: NeighborGroupsData): PreviewEntry => ({
  id: `neighbor-groups/${id}`,
  group: GROUP,
  title,
  render: () => <div className="w-[17.5rem]"><NeighborGroupsCard data={data} handlers={handlers} now={GROUPS_NOW} layout="rail" /></div>,
});

/** A group as its sheet shows it, framed at a phone sheet's height (the sheet itself opens over the page). */
const panel = (id: string, title: string, view: NeighborGroupView, tab: NeighborGroupTab = 'chat'): PreviewEntry => ({
  id: `neighbor-groups/${id}`,
  group: GROUP,
  title,
  render: () => <Frame><NeighborGroupPanel view={view} handlers={handlers} initialTab={tab} onReload={() => {}} onClose={() => {}} /></Frame>,
});

const Frame = ({ children }: { children: ReactNode }) => <div className="mx-auto flex h-[720px] max-w-lg flex-col overflow-hidden rounded-2xl border bg-background">{children}</div>;

export const neighborGroupPreviews: PreviewEntry[] = [
  card('card-empty', p.cardEmpty, neighborGroupsEmpty),
  card('card-some', p.cardSome, neighborGroupsSome),
  card('card-unread', p.cardUnread, neighborGroupsUnread),
  card('card-no-area', p.cardNoArea, neighborGroupsNoArea),
  card('card-limit', p.cardLimit, neighborGroupsLimit),
  railCard('card-rail', p.cardRail, neighborGroupsUnread),
  railCard('card-rail-empty', p.cardRailEmpty, neighborGroupsEmpty),
  card('create', p.create, neighborGroupsSome, { dialog: 'create' }),
  card('join-valid', p.joinValid, neighborGroupsWithInvite),
  card('join-expired', p.joinExpired, { ...neighborGroupsSome, invite: inviteExpired }),
  card('join-wrong-area', p.joinWrongArea, { ...neighborGroupsSome, invite: inviteWrongArea }),
  panel('stream', p.stream, groupViewAdmin),
  panel('stream-states', p.streamStates, groupViewStates),
  panel('stream-empty', p.streamEmpty, groupViewEmpty),
  panel('muted', p.muted, groupViewMuted),
  panel('admin-members', p.adminMembers, groupViewAdmin, 'members'),
  panel('member-members', p.memberMembers, groupViewStates, 'members'),
  {
    id: 'neighbor-groups/portal',
    group: GROUP,
    title: p.portal,
    layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.community()}><PortalScreen data={portalWithGroupsData} handlers={portalHandlers} now={GROUPS_NOW} /></AppShell>,
  },
  { id: 'neighbor-groups/admin-case', group: GROUP, title: p.adminCase, render: () => <div className="mx-auto max-w-2xl"><AdminReportedGroupMessage data={adminCaseGroupMessage} onModerate={fakeHandler({ ok: true, code: 'updated' })} /></div> },
  { id: 'neighbor-groups/admin-case-removed', group: GROUP, title: p.adminCaseRemoved, render: () => <div className="mx-auto max-w-2xl"><AdminReportedGroupMessage data={adminCaseGroupMessageRemoved} onModerate={fakeHandler({ ok: true, code: 'updated' })} /></div> },
];
