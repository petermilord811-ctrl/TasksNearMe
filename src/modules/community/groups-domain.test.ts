import { describe, expect, it } from 'vitest';
import { NEIGHBOR_GROUP_LIMITS } from '@/contracts';
import {
  canRemoveMember,
  canRevokeInvite,
  canSeeGroupPhoto,
  createsLeft,
  firstUnreadOf,
  formatInviteCode,
  groupCreateBlock,
  groupRecipients,
  INVITE_ALPHABET,
  inviteCodeFrom,
  inviteNamesGroup,
  inviteState,
  isGroupReaction,
  memberName,
  messageActions,
  nextAdmin,
  normalizeInviteCode,
  quoteMedia,
  quoteState,
  reactionSummary,
  seesInvite,
} from './groups-domain';

const now = new Date('2026-11-24T15:00:00.000Z');
const later = new Date(now.getTime() + 3_600_000);
const earlier = new Date(now.getTime() - 3_600_000);
const working = { expiresAt: later, revokedAt: null };
const group = { status: 'active', areaId: 'area_mueller', memberCount: 4 };
const neighbor = { homeAreaId: 'area_mueller', isMember: false };

describe('creating a group', () => {
  it('needs an active account with a neighborhood, and allows 3 ever', () => {
    expect(groupCreateBlock({ status: 'active', homeAreaId: 'area_mueller', createdCount: 0 })).toBeNull();
    expect(groupCreateBlock({ status: 'active', homeAreaId: 'area_mueller', createdCount: 2 })).toBeNull();
    expect(groupCreateBlock({ status: 'active', homeAreaId: 'area_mueller', createdCount: 3 })).toBe('limit_reached');
    expect(groupCreateBlock({ status: 'active', homeAreaId: null, createdCount: 0 })).toBe('no_area');
    expect(groupCreateBlock({ status: 'restricted', homeAreaId: 'area_mueller', createdCount: 0 })).toBe('not_allowed');
    expect(createsLeft(1)).toBe(2);
    expect(createsLeft(5)).toBe(0);
  });
});

describe('what an invite leads to', () => {
  it('admits a neighbor of the same area while it works and there is room', () => {
    expect(inviteState({ invite: working, group, viewer: neighbor, now })).toBe('valid');
  });

  it('says only that a code does not work, without naming the group', () => {
    expect(inviteState({ invite: null, group: null, viewer: neighbor, now })).toBe('not_found');
    expect(inviteState({ invite: working, group: { ...group, status: 'closed' }, viewer: neighbor, now })).toBe('not_found');
    const expired = inviteState({ invite: { expiresAt: earlier, revokedAt: null }, group, viewer: neighbor, now });
    const revoked = inviteState({ invite: { expiresAt: later, revokedAt: earlier }, group, viewer: neighbor, now });
    expect([expired, revoked]).toEqual(['expired', 'revoked']);
    for (const state of ['not_found', 'expired', 'revoked', 'no_area'] as const) expect(inviteNamesGroup(state)).toBe(false);
  });

  it('expires exactly at its time', () => {
    expect(inviteState({ invite: { expiresAt: now, revokedAt: null }, group, viewer: neighbor, now })).toBe('expired');
  });

  it('keeps people from other neighborhoods out, and asks for a neighborhood first', () => {
    expect(inviteState({ invite: working, group, viewer: { homeAreaId: 'area_cherrywood', isMember: false }, now })).toBe('wrong_area');
    expect(inviteState({ invite: working, group, viewer: { homeAreaId: null, isMember: false }, now })).toBe('no_area');
  });

  it('is full at 50 members, and tells a member they are in already', () => {
    expect(inviteState({ invite: working, group: { ...group, memberCount: NEIGHBOR_GROUP_LIMITS.members }, viewer: neighbor, now })).toBe('full');
    expect(inviteState({ invite: { expiresAt: earlier, revokedAt: null }, group, viewer: { ...neighbor, isMember: true }, now })).toBe('member');
  });
});

describe('members and invites', () => {
  it('lets only the admin remove others, never themselves', () => {
    expect(canRemoveMember('admin', { isYou: false })).toBe(true);
    expect(canRemoveMember('admin', { isYou: true })).toBe(false);
    expect(canRemoveMember('member', { isYou: false })).toBe(false);
  });

  it('lets the admin revoke and see every invite; a member sees their own', () => {
    expect(canRevokeInvite('admin')).toBe(true);
    expect(canRevokeInvite('member')).toBe(false);
    expect(seesInvite({ id: 'usr_a', role: 'admin' }, { createdByUserId: 'usr_b' })).toBe(true);
    expect(seesInvite({ id: 'usr_a', role: 'member' }, { createdByUserId: 'usr_b' })).toBe(false);
    expect(seesInvite({ id: 'usr_a', role: 'member' }, { createdByUserId: 'usr_a' })).toBe(true);
  });

  it('passes the admin role to whoever joined first', () => {
    const members = [
      { userId: 'usr_c', joinedAt: new Date('2026-11-03') },
      { userId: 'usr_admin', joinedAt: new Date('2026-11-01') },
      { userId: 'usr_b', joinedAt: new Date('2026-11-02') },
    ];
    expect(nextAdmin(members, 'usr_admin')).toBe('usr_b');
    expect(nextAdmin([{ userId: 'usr_admin', joinedAt: new Date() }], 'usr_admin')).toBeNull();
  });
});

describe('messages', () => {
  it('lets the author delete and others report, once, while it shows; anyone who may write reacts and replies', () => {
    const writer = { canWrite: true };
    expect(messageActions({ isYours: true, status: 'visible', reportedByYou: false, ...writer })).toEqual({ canDelete: true, canReport: false, canReact: true, canReply: true });
    expect(messageActions({ isYours: false, status: 'visible', reportedByYou: false, ...writer })).toEqual({ canDelete: false, canReport: true, canReact: true, canReply: true });
    expect(messageActions({ isYours: false, status: 'visible', reportedByYou: true, ...writer })).toEqual({ canDelete: false, canReport: false, canReact: true, canReply: true });
    expect(messageActions({ isYours: true, status: 'deleted', reportedByYou: false, ...writer })).toEqual({ canDelete: false, canReport: false, canReact: false, canReply: false });
    expect(messageActions({ isYours: false, status: 'removed', reportedByYou: false, ...writer })).toEqual({ canDelete: false, canReport: false, canReact: false, canReply: false });
    // An account that can't write (restricted) still reads, deletes its own and reports; it doesn't react or reply.
    expect(messageActions({ isYours: false, status: 'visible', reportedByYou: false, canWrite: false })).toEqual({ canDelete: false, canReport: true, canReact: false, canReply: false });
  });

  it('counts reactions per emoji in the picker’s order, marks the viewer’s, and leaves out blocked people', () => {
    const rows = [
      { emoji: 'heart', userId: 'usr_a' },
      { emoji: 'thumbs_up', userId: 'usr_me' },
      { emoji: 'heart', userId: 'usr_me' },
      { emoji: 'heart', userId: 'usr_blocked' },
      { emoji: 'fire', userId: 'usr_blocked' },
      { emoji: 'skull', userId: 'usr_a' },
    ];
    expect(reactionSummary(rows, 'usr_me', new Set(['usr_blocked']))).toEqual([
      { emoji: 'thumbs_up', count: 1, mine: true },
      { emoji: 'heart', count: 2, mine: true },
    ]);
    expect(reactionSummary([], 'usr_me', new Set())).toEqual([]);
    expect(isGroupReaction('party')).toBe(true);
    expect(isGroupReaction('skull')).toBe(false);
    expect(isGroupReaction(undefined)).toBe(false);
  });

  it('puts "New messages" above the first message someone else wrote since the viewer last read', () => {
    const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
    const messages = [
      { id: 'm1', authorUserId: 'usr_a', createdAt: at(-10) },
      { id: 'm2', authorUserId: 'usr_me', createdAt: at(5) },
      { id: 'm3', authorUserId: 'usr_b', createdAt: at(6) },
      { id: 'm4', authorUserId: 'usr_a', createdAt: at(7) },
    ];
    expect(firstUnreadOf(messages, 'usr_me', now)).toBe('m3');
    expect(firstUnreadOf(messages, 'usr_me', at(10))).toBeUndefined();
    expect(firstUnreadOf(messages, 'usr_me', at(-20))).toBe('m1');
  });

  it('opens a group photo only for a current member of an open group, while the message shows, never across a block', () => {
    const fine = { groupStatus: 'active', messageStatus: 'visible', isMember: true, viewerStatus: 'active', blockedWithAuthor: false };
    expect(canSeeGroupPhoto(fine)).toBe(true);
    expect(canSeeGroupPhoto({ ...fine, viewerStatus: 'restricted' })).toBe(true);
    expect(canSeeGroupPhoto({ ...fine, isMember: false })).toBe(false);
    expect(canSeeGroupPhoto({ ...fine, groupStatus: 'closed' })).toBe(false);
    expect(canSeeGroupPhoto({ ...fine, messageStatus: 'deleted' })).toBe(false);
    expect(canSeeGroupPhoto({ ...fine, messageStatus: 'removed' })).toBe(false);
    expect(canSeeGroupPhoto({ ...fine, viewerStatus: 'suspended' })).toBe(false);
    expect(canSeeGroupPhoto({ ...fine, blockedWithAuthor: true })).toBe(false);
  });

  it('quotes a reply’s message as it shows: hidden across a block, else its own status; photos or a GIF', () => {
    expect(quoteState({ status: 'visible', authorUserId: 'usr_a' }, new Set())).toBe('visible');
    expect(quoteState({ status: 'deleted', authorUserId: 'usr_a' }, new Set())).toBe('deleted');
    expect(quoteState({ status: 'visible', authorUserId: 'usr_a' }, new Set(['usr_a']))).toBe('hidden');
    expect(quoteMedia([])).toBeUndefined();
    expect(quoteMedia([{ contentType: 'image/gif' }])).toBe('gif');
    expect(quoteMedia([{ contentType: 'image/webp' }, { contentType: 'image/gif' }])).toBe('photo');
  });

  it('tells the other members, never the sender, the muted, the blocked or a suspended account', () => {
    const members = [
      { userId: 'usr_sender', muted: false, status: 'active' },
      { userId: 'usr_a', muted: false, status: 'active' },
      { userId: 'usr_muted', muted: true, status: 'active' },
      { userId: 'usr_blocked', muted: false, status: 'active' },
      { userId: 'usr_suspended', muted: false, status: 'suspended' },
      { userId: 'usr_restricted', muted: false, status: 'restricted' },
    ];
    expect(groupRecipients('usr_sender', members, new Set(['usr_blocked']))).toEqual(['usr_a', 'usr_restricted']);
  });
});

describe('invite codes', () => {
  it('makes 8 characters without look-alikes', () => {
    const code = inviteCodeFrom(Uint8Array.from([0, 1, 2, 3, 250, 251, 252, 255]));
    expect(code).toHaveLength(8);
    for (const char of code) expect(INVITE_ALPHABET).toContain(char);
    expect(INVITE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it('reads what people type or paste', () => {
    expect(normalizeInviteCode('k7qm-3xpd')).toBe('K7QM3XPD');
    expect(normalizeInviteCode(' K7QM 3XPD ')).toBe('K7QM3XPD');
    expect(normalizeInviteCode('https://tasksnearme.com/app/community?join=K7QM3XPD')).toBe('K7QM3XPD');
    expect(normalizeInviteCode('K7QM3XP0')).toBeNull();
    expect(normalizeInviteCode('short')).toBeNull();
    expect(formatInviteCode('K7QM3XPD')).toBe('K7QM-3XPD');
  });
});

describe('names', () => {
  it('shows first name and last initial, never the whole last name', () => {
    expect(memberName({ firstName: 'Maya', lastName: 'Rivera', name: '' })).toEqual({ displayName: 'Maya R.', initials: 'MR' });
    expect(memberName({ firstName: '', lastName: '', name: 'Sam' })).toEqual({ displayName: 'Sam', initials: 'S' });
  });
});
