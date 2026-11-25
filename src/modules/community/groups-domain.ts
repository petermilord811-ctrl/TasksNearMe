import {
  MESSAGE_REACTIONS,
  NEIGHBOR_GROUP_CODE_LENGTH,
  NEIGHBOR_GROUP_LIMITS,
  type MessageReaction,
  type NeighborGroupCreateBlock,
  type NeighborGroupInviteState,
  type NeighborGroupMessageStatus,
  type NeighborGroupQuote,
  type NeighborGroupReaction,
  type NeighborGroupRole,
} from '@/contracts';

/**
 * Building and street groups (2026-11-24): the pure rules. Who may create one, what an invite leads to, who may remove
 * whom, what a member may do with a message, who hears about a new one, and who takes over when the admin leaves.
 */

/** Account states that may write in a group (create, join, send, invite). Others may still read and leave. */
const WRITERS = new Set(['active']);
/** Account states that may still open a group they're in. */
const READERS = new Set(['active', 'restricted']);

export const canWriteInGroups = (status: string) => WRITERS.has(status);
export const canReadGroups = (status: string) => READERS.has(status);

/** Whether this person may create another group: in their own neighborhood, at most 3 ever. */
export function groupCreateBlock(person: { status: string; homeAreaId: string | null; createdCount: number }): NeighborGroupCreateBlock | null {
  if (!canWriteInGroups(person.status)) return 'not_allowed';
  if (!person.homeAreaId) return 'no_area';
  if (person.createdCount >= NEIGHBOR_GROUP_LIMITS.createdPerPerson) return 'limit_reached';
  return null;
}

export const createsLeft = (createdCount: number) => Math.max(0, NEIGHBOR_GROUP_LIMITS.createdPerPerson - createdCount);

/**
 * What an invite leads to for the person opening it. Order matters: a code that doesn't work says only that (never the
 * group behind it); someone already in it is told so; then their neighborhood, then room.
 */
export function inviteState(input: {
  invite: { expiresAt: Date; revokedAt: Date | null } | null;
  group: { status: string; areaId: string; memberCount: number } | null;
  viewer: { homeAreaId: string | null; isMember: boolean };
  now: Date;
}): NeighborGroupInviteState {
  const { invite, group, viewer, now } = input;
  if (!invite || !group || group.status !== 'active') return 'not_found';
  if (viewer.isMember) return 'member';
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (!viewer.homeAreaId) return 'no_area';
  if (viewer.homeAreaId !== group.areaId) return 'wrong_area';
  if (group.memberCount >= NEIGHBOR_GROUP_LIMITS.members) return 'full';
  return 'valid';
}

/** Whether the preview may name the group: only to someone it would admit, someone in it, or someone in the wrong area. */
export const inviteNamesGroup = (state: NeighborGroupInviteState) => state === 'valid' || state === 'member' || state === 'full' || state === 'wrong_area';

/** The admin removes anyone but themselves; members remove nobody. */
export const canRemoveMember = (viewerRole: NeighborGroupRole, target: { isYou: boolean }) => viewerRole === 'admin' && !target.isYou;

/** The admin revokes any invite still working. */
export const canRevokeInvite = (viewerRole: NeighborGroupRole) => viewerRole === 'admin';

/** Which invites a member sees: all working ones for the admin, their own for a member. */
export const seesInvite = (viewer: { id: string; role: NeighborGroupRole }, invite: { createdByUserId: string }) => viewer.role === 'admin' || invite.createdByUserId === viewer.id;

export const inviteWorks = (invite: { expiresAt: Date; revokedAt: Date | null }, now: Date) => !invite.revokedAt && invite.expiresAt.getTime() > now.getTime();

export const inviteExpiry = (now: Date) => new Date(now.getTime() + NEIGHBOR_GROUP_LIMITS.inviteDays * 86_400_000);

/**
 * What a member may do with a message: delete their own while it shows; report someone else's, once; react to it and
 * reply to it while it shows and their account may write.
 */
export function messageActions(message: { isYours: boolean; status: NeighborGroupMessageStatus; reportedByYou: boolean; canWrite: boolean }): { canDelete: boolean; canReport: boolean; canReact: boolean; canReply: boolean } {
  const visible = message.status === 'visible';
  return {
    canDelete: visible && message.isYours,
    canReport: visible && !message.isYours && !message.reportedByYou,
    canReact: visible && message.canWrite,
    canReply: visible && message.canWrite,
  };
}

export const isGroupReaction = (emoji: unknown): emoji is MessageReaction => typeof emoji === 'string' && (MESSAGE_REACTIONS as readonly string[]).includes(emoji);

/**
 * A message's reactions as one member sees them: each emoji with its count and whether they gave it, in
 * `MESSAGE_REACTIONS` order. People they blocked, or who blocked them, aren't counted (they don't see each other).
 */
export function reactionSummary(rows: readonly { emoji: string; userId: string }[], viewerId: string, blocked: ReadonlySet<string>): NeighborGroupReaction[] {
  const counts = new Map<MessageReaction, { count: number; mine: boolean }>();
  for (const row of rows) {
    if (!isGroupReaction(row.emoji) || blocked.has(row.userId)) continue;
    const entry = counts.get(row.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (row.userId === viewerId) entry.mine = true;
    counts.set(row.emoji, entry);
  }
  return MESSAGE_REACTIONS.flatMap((emoji) => {
    const entry = counts.get(emoji);
    return entry ? [{ emoji, ...entry }] : [];
  });
}

/**
 * The "New messages" line: the first message, oldest first, that someone else wrote after the viewer last read the
 * group. The messages are the ones the viewer sees (none from someone blocked either way).
 */
export function firstUnreadOf(messages: readonly { id: string; authorUserId: string; createdAt: Date }[], viewerId: string, lastReadAt: Date): string | undefined {
  return messages.find((message) => message.authorUserId !== viewerId && message.createdAt.getTime() > lastReadAt.getTime())?.id;
}

/**
 * Whether a member may open a group photo (src/modules/files/related-access.ts): the group is open, the message it's on
 * still shows, the viewer is in the group now and may read groups, and they and its author haven't blocked one another.
 * Its uploader always may (`canViewFile`); staff only through a case's link.
 */
export function canSeeGroupPhoto(input: { groupStatus: string; messageStatus: string; isMember: boolean; viewerStatus: string; blockedWithAuthor: boolean }): boolean {
  return input.groupStatus === 'active' && input.messageStatus === 'visible' && input.isMember && canReadGroups(input.viewerStatus) && !input.blockedWithAuthor;
}

/** How a reply's quoted message shows to this viewer: as written (masked by the caller), or only why it can't. */
export function quoteState(quoted: { status: NeighborGroupMessageStatus; authorUserId: string }, blocked: ReadonlySet<string>): NeighborGroupQuote['status'] {
  if (blocked.has(quoted.authorUserId)) return 'hidden';
  return quoted.status;
}

/** A quote's media line: a GIF when it's one animated GIF, else photos ("Photo"). */
export function quoteMedia(attachments: readonly { contentType: string }[]): NeighborGroupQuote['media'] {
  if (attachments.length === 0) return undefined;
  return attachments.every((file) => file.contentType === 'image/gif') ? 'gif' : 'photo';
}

/**
 * Who hears about a new message: the other members, unless they muted the group, or they and the sender blocked one
 * another, or their account can't read groups any more.
 */
export function groupRecipients(senderId: string, members: readonly { userId: string; muted: boolean; status: string }[], blocked: ReadonlySet<string>): string[] {
  return members.filter((member) => member.userId !== senderId && !member.muted && !blocked.has(member.userId) && canReadGroups(member.status)).map((member) => member.userId);
}

/** Who takes over when the admin leaves: the member who joined first (ties by id, so it's always the same one). */
export function nextAdmin(members: readonly { userId: string; joinedAt: Date }[], leaving: string): string | null {
  const rest = members.filter((member) => member.userId !== leaving).sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.userId.localeCompare(b.userId));
  return rest[0]?.userId ?? null;
}

/** Invite codes: no 0/O, 1/I/L, so they read aloud and type cleanly. */
export const INVITE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** A code from random bytes (one byte a character, folded onto the alphabet). */
export function inviteCodeFrom(bytes: Uint8Array): string {
  let code = '';
  for (let i = 0; i < NEIGHBOR_GROUP_CODE_LENGTH; i += 1) code += INVITE_ALPHABET[(bytes[i] ?? 0) % INVITE_ALPHABET.length];
  return code;
}

/** What someone typed or pasted ("k7qm-3xpd", a whole link) → the code, or null. */
export function normalizeInviteCode(input: string): string | null {
  const fromLink = /[?&]join=([^&#\s]+)/.exec(input)?.[1];
  const raw = (fromLink ? decodeURIComponent(fromLink) : input).toUpperCase().replace(/[\s-]/g, '');
  if (raw.length !== NEIGHBOR_GROUP_CODE_LENGTH) return null;
  for (const char of raw) if (!INVITE_ALPHABET.includes(char)) return null;
  return raw;
}

/** "K7QM3XPD" → "K7QM-3XPD", as the screens show it. */
export const formatInviteCode = (code: string) => (code.length === NEIGHBOR_GROUP_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

/** "Maya R.": first name and last initial, the way members see each other. */
export function memberName(person: { firstName: string; lastName: string; name: string }): { displayName: string; initials: string } {
  const first = person.firstName.trim() || person.name.trim().split(/\s+/)[0] || '';
  const last = person.lastName.trim();
  const displayName = last ? `${first} ${last[0]!.toUpperCase()}.` : first;
  const initials = `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '?';
  return { displayName, initials };
}
