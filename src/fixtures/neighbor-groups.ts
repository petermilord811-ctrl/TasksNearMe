import {
  NEIGHBOR_GROUP_LIMITS,
  routes,
  type AdminCaseGroupMessage,
  type NeighborGroupHandlers,
  type NeighborGroupInvitePreview,
  type NeighborGroupMemberView,
  type NeighborGroupMessageView,
  type NeighborGroupsData,
  type NeighborGroupSummary,
  type NeighborGroupView,
  type PortalPageData,
} from '@/contracts';
import { portalFeedData } from './portal';

/**
 * Building and street groups (2026-11-24): Maya's groups in Mueller (Austin) and every state a screen shows. Members
 * read as "Maya R." and their neighborhood; messages arrive masked (a phone keeps its last 4 digits as a hint).
 */

export const GROUPS_NOW = '2026-11-17T15:00:00.000Z';

export const groupLofts: NeighborGroupSummary = { id: 'ngrp_lofts', name: 'Mueller Lofts residents', kind: 'building', areaName: 'Mueller', memberCount: 4, role: 'admin', unreadCount: 0, muted: false, lastMessageAt: '2026-11-17T14:40:00.000Z' };
export const groupAldrich: NeighborGroupSummary = { id: 'ngrp_aldrich', name: 'Aldrich St 1900 block', kind: 'street', areaName: 'Mueller', memberCount: 14, role: 'member', unreadCount: 3, muted: false, lastMessageAt: '2026-11-17T13:05:00.000Z' };
export const groupGarden: NeighborGroupSummary = { id: 'ngrp_garden', name: 'Garden Court building', kind: 'building', areaName: 'Mueller', memberCount: 9, role: 'member', unreadCount: 12, muted: true, lastMessageAt: '2026-11-16T20:10:00.000Z' };

export const neighborGroupsEmpty: NeighborGroupsData = { groups: [], areaName: 'Mueller', create: { allowed: true }, createsLeft: 3 };
export const neighborGroupsSome: NeighborGroupsData = { groups: [groupLofts, { ...groupAldrich, unreadCount: 0 }], areaName: 'Mueller', create: { allowed: true }, createsLeft: 2 };
export const neighborGroupsUnread: NeighborGroupsData = { groups: [groupAldrich, groupGarden, groupLofts], areaName: 'Mueller', create: { allowed: true }, createsLeft: 2 };
export const neighborGroupsNoArea: NeighborGroupsData = { groups: [], create: { allowed: false, reason: 'no_area' }, createsLeft: 3 };
export const neighborGroupsLimit: NeighborGroupsData = { groups: [groupLofts, groupAldrich, groupGarden], areaName: 'Mueller', create: { allowed: false, reason: 'limit_reached' }, createsLeft: 0 };

const preview = (state: NeighborGroupInvitePreview['state'], extra: Partial<NeighborGroupInvitePreview> = {}): NeighborGroupInvitePreview => ({ code: 'K7QM-3XPD', state, ...extra });
const aldrichCard = { id: groupAldrich.id, name: groupAldrich.name, kind: groupAldrich.kind, areaName: 'Mueller', memberCount: 14 };
export const inviteValid = preview('valid', { group: aldrichCard, expiresAt: '2026-11-21T15:00:00.000Z' });
export const inviteMember = preview('member', { group: aldrichCard });
export const inviteExpired = preview('expired');
export const inviteRevoked = preview('revoked');
export const inviteNotFound = preview('not_found', { code: 'ZZZZ-ZZZZ' });
export const inviteWrongArea = preview('wrong_area', { group: { ...aldrichCard, name: 'Cherrywood Ave neighbors', areaName: 'Cherrywood' }, yourAreaName: 'Mueller' });
export const inviteFull = preview('full', { group: { ...aldrichCard, memberCount: NEIGHBOR_GROUP_LIMITS.members } });
export const neighborGroupsWithInvite: NeighborGroupsData = { ...neighborGroupsSome, invite: inviteValid };

const member = (userId: string, displayName: string, initials: string, extra: Partial<NeighborGroupMemberView> = {}): NeighborGroupMemberView => ({
  userId,
  displayName,
  initials,
  areaName: 'Mueller',
  role: 'member',
  isYou: false,
  joinedAt: '2026-11-10T15:00:00.000Z',
  canRemove: false,
  ...extra,
});

const maya = member('usr_maya', 'Maya R.', 'MR', { role: 'admin', isYou: true, joinedAt: '2026-11-08T15:00:00.000Z' });
const ana = member('usr_ana', 'Ana P.', 'AP');
const ben = member('usr_ben', 'Ben W.', 'BW');
const chris = member('usr_chris', 'Chris D.', 'CD');

const message = (id: string, author: NeighborGroupMemberView, text: NeighborGroupMessageView['segments'], at: string, extra: Partial<NeighborGroupMessageView> = {}): NeighborGroupMessageView => ({
  id,
  author: { userId: author.userId, displayName: author.displayName, initials: author.initials, ...(author.areaName ? { areaName: author.areaName } : {}), isYou: author.isYou },
  segments: text,
  status: 'visible',
  createdAt: at,
  reportedByYou: false,
  canDelete: author.isYou,
  canReport: !author.isYou,
  ...extra,
});

const say = (text: string): NeighborGroupMessageView['segments'] => [{ kind: 'text', text }];

export const groupMessages: NeighborGroupMessageView[] = [
  message('ngmsg_1', ana, say('Package room is open again. They fixed the lock this morning.'), '2026-11-17T13:30:00.000Z'),
  message('ngmsg_2', ben, [{ kind: 'text', text: 'Anyone want to split a window cleaner for the 3rd floor? Text me at ' }, { kind: 'masked', detail: 'phone', hint: '0147' }, { kind: 'text', text: ' or just reply here.' }], '2026-11-17T13:52:00.000Z'),
  message('ngmsg_3', maya, say("I'm in! Let's post it as one task so everyone sees the price."), '2026-11-17T14:10:00.000Z'),
  message('ngmsg_4', chris, [{ kind: 'text', text: 'Details on ' }, { kind: 'masked', detail: 'link' }, { kind: 'text', text: ' and ' }, { kind: 'masked', detail: 'email' }], '2026-11-17T14:40:00.000Z'),
];

const invite = { id: 'ngi_1', code: 'K7QM-3XPD', href: routes.app.joinNeighborGroup('K7QM3XPD'), expiresAt: '2026-11-21T15:00:00.000Z', createdBy: 'Maya R.', canRevoke: true };

/** The admin's view of her building's group: the stream (masked), members she can remove, and an invite she can turn off. */
export const groupViewAdmin: NeighborGroupView = {
  group: { id: groupLofts.id, name: groupLofts.name, kind: 'building', areaName: 'Mueller', memberCount: 4, createdAt: '2026-11-08T15:00:00.000Z' },
  you: { role: 'admin', muted: false, canSend: true },
  messages: groupMessages,
  hasEarlier: false,
  blockedHidden: 0,
  members: [maya, { ...ana, canRemove: true }, { ...ben, canRemove: true }, { ...chris, canRemove: true }],
  invites: [invite],
  canInvite: true,
  memberLimit: NEIGHBOR_GROUP_LIMITS.members,
};

/** A member's view: a message they reported, one our team removed, one its author deleted, one hidden by a block. */
export const groupViewStates: NeighborGroupView = {
  ...groupViewAdmin,
  group: { ...groupViewAdmin.group, id: groupAldrich.id, name: groupAldrich.name, kind: 'street', memberCount: 14 },
  you: { role: 'member', muted: false, canSend: true },
  messages: [
    message('ngmsg_5', ana, say('Street sweeping moved to Thursday this week.'), '2026-11-17T12:00:00.000Z'),
    message('ngmsg_6', chris, [], '2026-11-17T12:20:00.000Z', { status: 'removed', canReport: false }),
    message('ngmsg_7', ben, say('Cash only for the yard sale, come by any time after 9.'), '2026-11-17T12:45:00.000Z', { reportedByYou: true, canReport: false }),
    message('ngmsg_8', { ...maya, role: 'member' }, [], '2026-11-17T13:00:00.000Z', { status: 'deleted', canDelete: false }),
    message('ngmsg_9', ana, say('Thanks everyone, the lost cat is home!'), '2026-11-17T13:05:00.000Z'),
  ],
  hasEarlier: true,
  blockedHidden: 2,
  members: [{ ...ana, role: 'admin' }, { ...maya, role: 'member' }, ben, chris],
  invites: [{ ...invite, id: 'ngi_2', code: 'P4WD-9RHT', href: routes.app.joinNeighborGroup('P4WD9RHT'), canRevoke: false }],
};

export const groupViewEmpty: NeighborGroupView = { ...groupViewAdmin, messages: [], members: [maya], invites: [], group: { ...groupViewAdmin.group, memberCount: 1 } };
export const groupViewMuted: NeighborGroupView = { ...groupViewStates, group: { ...groupViewStates.group, id: groupGarden.id, name: groupGarden.name, kind: 'building', memberCount: 9 }, you: { role: 'member', muted: true, canSend: true } };
/** Someone whose account can't write now (restricted): they read, and leave if they want. */
export const groupViewReadOnly: NeighborGroupView = { ...groupViewStates, you: { role: 'member', muted: false, canSend: false }, canInvite: false };

/** Neighbors with the groups card (the portal's other parts as in its own fixtures). */
export const portalWithGroupsData: PortalPageData = { ...portalFeedData, groups: neighborGroupsUnread };

/** A reported group message on its case (staff). */
export const adminCaseGroupMessage: AdminCaseGroupMessage = {
  message: { id: 'ngmsg_7', body: 'Cash only for the yard sale, come by any time after 9. Venmo @benw-sales works too.', author: { displayName: 'Ben W.' }, createdAt: '2026-11-17T12:45:00.000Z' },
  group: { name: groupAldrich.name, kind: 'street', areaName: 'Mueller', memberCount: 14 },
  status: 'visible',
  canModerate: true,
};
export const adminCaseGroupMessageRemoved: AdminCaseGroupMessage = { ...adminCaseGroupMessage, status: 'removed', removedReason: 'Moves payment off the platform (a Venmo handle).' };

/** Handlers for previews and tests: each answers with a fixture (`onOpen` by group id). */
export function fakeNeighborGroupHandlers(views: readonly NeighborGroupView[] = [groupViewAdmin, groupViewStates, groupViewMuted], previews: Record<string, NeighborGroupInvitePreview> = {}): NeighborGroupHandlers {
  const ok = async () => ({ ok: true as const, code: 'updated' as const });
  return {
    onOpen: async ({ groupId }) => views.find((view) => view.group.id === groupId) ?? null,
    onCreate: async () => ({ ok: true, code: 'saved', groupId: groupViewEmpty.group.id }),
    onPreviewInvite: async ({ code }) => previews[code.toUpperCase()] ?? { ...inviteValid, code },
    onJoin: async () => ({ ok: true, code: 'updated', groupId: groupAldrich.id }),
    onSend: async () => ({ ok: true, code: 'sent' }),
    onDeleteMessage: ok,
    onInvite: async () => ({ ok: true, invite }),
    onRevokeInvite: ok,
    onRemoveMember: ok,
    onLeave: ok,
    onMute: ok,
  };
}
