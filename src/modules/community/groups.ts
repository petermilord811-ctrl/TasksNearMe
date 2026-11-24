import { randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  NEIGHBOR_GROUP_LIMITS,
  neighborGroupCodeInputSchema,
  neighborGroupCreateInputSchema,
  neighborGroupMessageInputSchema,
  routes,
  type ActionResult,
  type AdminCaseGroupMessage,
  type NeighborGroupCreateInput,
  type NeighborGroupInvitePreview,
  type NeighborGroupInviteResult,
  type NeighborGroupInviteView,
  type NeighborGroupKind,
  type NeighborGroupMessageInput,
  type NeighborGroupMessageStatus,
  type NeighborGroupResult,
  type NeighborGroupRole,
  type NeighborGroupsData,
  type NeighborGroupSummary,
  type NeighborGroupView,
} from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { avatarPhoto } from '@/modules/files/photos';
import { areas } from '@/modules/markets/schema';
import { notifications } from '@/modules/notifications/schema';
import { supportCases } from '@/modules/support/schema';
import { toMessageSegments } from '@/modules/trust/message-segments';
import { blockedPeopleOf } from '@/modules/trust/blocks';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import { userChannel } from '@/platform/realtime/hub';
import { publishNotices } from '@/platform/realtime/publish';
import {
  canReadGroups,
  canRemoveMember,
  canRevokeInvite,
  canWriteInGroups,
  createsLeft,
  formatInviteCode,
  groupCreateBlock,
  groupRecipients,
  inviteCodeFrom,
  inviteExpiry,
  inviteNamesGroup,
  inviteState,
  inviteWorks,
  memberName,
  messageActions,
  nextAdmin,
  normalizeInviteCode,
  seesInvite,
} from './groups-domain';
import { neighborGroupInvites, neighborGroupMembers, neighborGroupMessages, neighborGroups } from './schema';

/**
 * Building and street groups (2026-11-24): small private chats on Neighbors (src/contracts/neighbor-groups.ts). Every
 * read checks membership first, so someone outside a group learns nothing about it, not even that it exists (an
 * invite's preview names it only to someone it would admit, or someone it can't because of their neighborhood or room).
 * Messages are masked like a chat before a booking, always; blocked people don't see each other's messages; a new
 * message is an in-app notification only, one unread a group, never for a muted group.
 */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type GroupRow = typeof neighborGroups.$inferSelect;

const kindOf = (kind: string): NeighborGroupKind => (kind === 'street' ? 'street' : 'building');
const roleOf = (role: string): NeighborGroupRole => (role === 'admin' ? 'admin' : 'member');
const statusOf = (status: string): NeighborGroupMessageStatus => (status === 'deleted' || status === 'removed' ? status : 'visible');

interface Person {
  id: string;
  status: string;
  homeMarketId: string;
  homeAreaId: string | null;
  name: string;
  firstName: string;
  lastName: string;
}

async function personOf(db: Db | Tx, userId: string): Promise<Person | null> {
  const [row] = await db
    .select({ id: users.id, status: users.status, homeMarketId: users.homeMarketId, homeAreaId: users.homeAreaId, name: users.name, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/** "Maya R.": the name people show by (first name and last initial), else made from their names. */
const shownName = (person: { name: string; firstName: string; lastName: string }) => {
  const made = memberName(person);
  const name = person.name.trim();
  return { displayName: name || made.displayName || '—', initials: made.initials };
};

async function membershipOf(db: Db | Tx, groupId: string, userId: string) {
  const [row] = await db
    .select({ group: neighborGroups, role: neighborGroupMembers.role, mutedAt: neighborGroupMembers.mutedAt, lastReadAt: neighborGroupMembers.lastReadAt })
    .from(neighborGroupMembers)
    .innerJoin(neighborGroups, eq(neighborGroups.id, neighborGroupMembers.groupId))
    .where(and(eq(neighborGroupMembers.groupId, groupId), eq(neighborGroupMembers.userId, userId), eq(neighborGroups.status, 'active')))
    .limit(1);
  return row ? { ...row, role: roleOf(row.role) } : null;
}

async function memberCountOf(db: Db | Tx, groupId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(neighborGroupMembers).where(eq(neighborGroupMembers.groupId, groupId));
  return row?.value ?? 0;
}

async function areaNameOf(db: Db | Tx, areaId: string | null): Promise<string | undefined> {
  if (!areaId) return undefined;
  const [row] = await db.select({ name: areas.name }).from(areas).where(eq(areas.id, areaId)).limit(1);
  return row?.name;
}

// ---- The list on Neighbors --------------------------------------------------------------------------------------

/** The viewer's groups, the most recently active first, with what's unread in each (never a blocked person's). */
export async function groupsOf(db: Db, viewerId: string): Promise<NeighborGroupSummary[]> {
  const rows = await db
    .select({ group: neighborGroups, role: neighborGroupMembers.role, mutedAt: neighborGroupMembers.mutedAt, lastReadAt: neighborGroupMembers.lastReadAt, areaName: areas.name })
    .from(neighborGroupMembers)
    .innerJoin(neighborGroups, eq(neighborGroups.id, neighborGroupMembers.groupId))
    .innerJoin(areas, eq(areas.id, neighborGroups.areaId))
    .where(and(eq(neighborGroupMembers.userId, viewerId), eq(neighborGroups.status, 'active')));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.group.id);
  const blocked = await blockedPeopleOf(db, viewerId);
  const notBlocked = blocked.length > 0 ? sql`${neighborGroupMessages.authorUserId} not in (${sql.join(blocked.map((id) => sql`${id}`), sql`, `)})` : undefined;
  const [members, latest, unread] = await Promise.all([
    db.select({ groupId: neighborGroupMembers.groupId, value: count() }).from(neighborGroupMembers).where(inArray(neighborGroupMembers.groupId, ids)).groupBy(neighborGroupMembers.groupId),
    db
      .select({ groupId: neighborGroupMessages.groupId, at: sql<Date>`max(${neighborGroupMessages.createdAt})`.mapWith((value: string | Date) => new Date(value)) })
      .from(neighborGroupMessages)
      .where(and(inArray(neighborGroupMessages.groupId, ids), eq(neighborGroupMessages.status, 'visible'), notBlocked))
      .groupBy(neighborGroupMessages.groupId),
    db
      .select({ groupId: neighborGroupMessages.groupId, value: count() })
      .from(neighborGroupMessages)
      .innerJoin(neighborGroupMembers, and(eq(neighborGroupMembers.groupId, neighborGroupMessages.groupId), eq(neighborGroupMembers.userId, viewerId)))
      .where(and(inArray(neighborGroupMessages.groupId, ids), eq(neighborGroupMessages.status, 'visible'), ne(neighborGroupMessages.authorUserId, viewerId), gt(neighborGroupMessages.createdAt, neighborGroupMembers.lastReadAt), notBlocked))
      .groupBy(neighborGroupMessages.groupId),
  ]);
  const memberCount = new Map(members.map((row) => [row.groupId, row.value]));
  const latestAt = new Map(latest.map((row) => [row.groupId, row.at]));
  const unreadCount = new Map(unread.map((row) => [row.groupId, row.value]));
  const at = (id: string, fallback: Date) => (latestAt.get(id) ?? fallback).getTime();
  return rows
    .map(({ group, role, mutedAt, areaName }): NeighborGroupSummary => {
      const last = latestAt.get(group.id);
      return {
        id: group.id,
        name: group.name,
        kind: kindOf(group.kind),
        areaName,
        memberCount: memberCount.get(group.id) ?? 1,
        role: roleOf(role),
        unreadCount: unreadCount.get(group.id) ?? 0,
        muted: mutedAt !== null,
        ...(last ? { lastMessageAt: last.toISOString() } : {}),
      };
    })
    .sort((a, b) => at(b.id, new Date(0)) - at(a.id, new Date(0)) || a.name.localeCompare(b.name));
}

/**
 * Groups on the Neighbors page: the viewer's own, whether they may create one, and the group or invite the address
 * asks to open (`?group=`, `?join=`). Null for someone who can't read groups (a suspended account).
 */
export async function getNeighborGroupsData(db: Db, viewerId: string, open: { groupId?: string; code?: string }, now: Date): Promise<NeighborGroupsData | null> {
  const person = await personOf(db, viewerId);
  if (!person || !canReadGroups(person.status)) return null;
  const [groups, [created], areaName] = await Promise.all([
    groupsOf(db, viewerId),
    db.select({ value: count() }).from(neighborGroups).where(eq(neighborGroups.createdByUserId, viewerId)),
    areaNameOf(db, person.homeAreaId),
  ]);
  const createdCount = created?.value ?? 0;
  const block = groupCreateBlock({ status: person.status, homeAreaId: person.homeAreaId, createdCount });
  const openGroupId = open.groupId && groups.some((group) => group.id === open.groupId) ? open.groupId : undefined;
  const invite = open.code ? await previewInvite(db, viewerId, { code: open.code }, now) : undefined;
  return {
    groups,
    ...(areaName ? { areaName } : {}),
    create: block ? { allowed: false, reason: block } : { allowed: true },
    createsLeft: createsLeft(createdCount),
    ...(openGroupId ? { openGroupId } : {}),
    ...(invite ? { invite } : {}),
  };
}

// ---- One group --------------------------------------------------------------------------------------------------

/**
 * One group as a member reads it: the newest messages (masked; none from someone they blocked or who blocked them),
 * its members, and the invites they may see. Opening it reads it: its unread count and notification clear. Null for
 * anyone not in it.
 */
export async function getNeighborGroupView(db: Db, viewerId: string, groupId: string, now: Date, options: { markRead?: boolean } = {}): Promise<NeighborGroupView | null> {
  const person = await personOf(db, viewerId);
  if (!person || !canReadGroups(person.status)) return null;
  const membership = await membershipOf(db, String(groupId), viewerId);
  if (!membership) return null;
  const { group, role } = membership;
  const blocked = new Set(await blockedPeopleOf(db, viewerId));
  const [memberRows, messageRows, inviteRows, areaName] = await Promise.all([
    db
      .select({ userId: neighborGroupMembers.userId, role: neighborGroupMembers.role, joinedAt: neighborGroupMembers.joinedAt, name: users.name, firstName: users.firstName, lastName: users.lastName, avatarFileId: users.avatarFileId, areaName: areas.name })
      .from(neighborGroupMembers)
      .innerJoin(users, eq(users.id, neighborGroupMembers.userId))
      .leftJoin(areas, eq(areas.id, users.homeAreaId))
      .where(eq(neighborGroupMembers.groupId, group.id))
      .orderBy(asc(neighborGroupMembers.joinedAt), asc(neighborGroupMembers.userId)),
    db
      .select({ message: neighborGroupMessages, name: users.name, firstName: users.firstName, lastName: users.lastName, avatarFileId: users.avatarFileId, areaName: areas.name })
      .from(neighborGroupMessages)
      .innerJoin(users, eq(users.id, neighborGroupMessages.authorUserId))
      .leftJoin(areas, eq(areas.id, users.homeAreaId))
      .where(eq(neighborGroupMessages.groupId, group.id))
      .orderBy(desc(neighborGroupMessages.createdAt), desc(neighborGroupMessages.id))
      .limit(NEIGHBOR_GROUP_LIMITS.pageSize * 2 + 1),
    db
      .select({ invite: neighborGroupInvites, name: users.name, firstName: users.firstName, lastName: users.lastName })
      .from(neighborGroupInvites)
      .innerJoin(users, eq(users.id, neighborGroupInvites.createdByUserId))
      .where(and(eq(neighborGroupInvites.groupId, group.id), isNull(neighborGroupInvites.revokedAt), gt(neighborGroupInvites.expiresAt, now)))
      .orderBy(desc(neighborGroupInvites.createdAt)),
    areaNameOf(db, group.areaId),
  ]);
  const shown = messageRows.filter((row) => !blocked.has(row.message.authorUserId));
  const blockedHidden = messageRows.length - shown.length;
  const page = shown.slice(0, NEIGHBOR_GROUP_LIMITS.pageSize);
  const reported = await reportedByViewer(db, viewerId, page.map((row) => row.message.id));
  const memberCount = memberRows.length;
  if (options.markRead !== false) await markGroupRead(db, viewerId, group.id, now);
  return {
    group: { id: group.id, name: group.name, kind: kindOf(group.kind), areaName: areaName ?? '', memberCount, createdAt: group.createdAt.toISOString() },
    you: { role, muted: membership.mutedAt !== null, canSend: canWriteInGroups(person.status) },
    messages: page.reverse().map(({ message, ...author }) => {
      const status = statusOf(message.status);
      const isYours = message.authorUserId === viewerId;
      const reportedByYou = reported.has(message.id);
      const name = shownName(author);
      return {
        id: message.id,
        author: { userId: message.authorUserId, ...name, ...(author.areaName ? { areaName: author.areaName } : {}), ...(author.avatarFileId ? { photo: avatarPhoto(author.avatarFileId, name.displayName) } : {}), isYou: isYours },
        // Always masked: no booking unlocks a group (a chat before a booking).
        segments: status === 'visible' ? toMessageSegments(message.body, { mask: true }) : [],
        status,
        createdAt: message.createdAt.toISOString(),
        reportedByYou,
        ...messageActions({ isYours, status, reportedByYou }),
      };
    }),
    hasEarlier: shown.length > NEIGHBOR_GROUP_LIMITS.pageSize,
    blockedHidden,
    members: memberRows.map((member) => {
      const isYou = member.userId === viewerId;
      const name = shownName(member);
      return {
        userId: member.userId,
        ...name,
        ...(member.areaName ? { areaName: member.areaName } : {}),
        ...(member.avatarFileId ? { photo: avatarPhoto(member.avatarFileId, name.displayName) } : {}),
        role: roleOf(member.role),
        isYou,
        joinedAt: member.joinedAt.toISOString(),
        canRemove: canRemoveMember(role, { isYou }),
      };
    }),
    invites: inviteRows.filter(({ invite }) => seesInvite({ id: viewerId, role }, invite)).map(({ invite, ...creator }) => inviteView(invite, shownName(creator).displayName, role)),
    canInvite: canWriteInGroups(person.status) && memberCount < NEIGHBOR_GROUP_LIMITS.members,
    memberLimit: NEIGHBOR_GROUP_LIMITS.members,
  };
}

function inviteView(invite: typeof neighborGroupInvites.$inferSelect, createdBy: string, role: NeighborGroupRole): NeighborGroupInviteView {
  return { id: invite.id, code: formatInviteCode(invite.code), href: routes.app.joinNeighborGroup(invite.code), expiresAt: invite.expiresAt.toISOString(), createdBy, canRevoke: canRevokeInvite(role) };
}

/** Which of these messages the viewer reported (a case they opened about it). */
async function reportedByViewer(db: Db, viewerId: string, messageIds: readonly string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const rows = await db
    .select({ id: sql<string>`${supportCases.context}->>'groupMessageId'` })
    .from(supportCases)
    .where(and(eq(supportCases.openedByUserId, viewerId), sql`${supportCases.context}->>'groupMessageId' in (${sql.join(messageIds.map((id) => sql`${id}`), sql`, `)})`));
  return new Set(rows.map((row) => row.id));
}

/** The group is read: its unread count and its notification clear (the bell hears it on the person's other tabs). */
async function markGroupRead(db: Db, viewerId: string, groupId: string, now: Date): Promise<void> {
  await db.update(neighborGroupMembers).set({ lastReadAt: now }).where(and(eq(neighborGroupMembers.groupId, groupId), eq(neighborGroupMembers.userId, viewerId)));
  const read = await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, viewerId), eq(notifications.type, 'group_message'), isNull(notifications.readAt), sql`${notifications.target}->>'groupId' = ${groupId}`))
    .returning({ id: notifications.id });
  if (read.length > 0) await publishNotices(db, [{ channel: userChannel(viewerId), notice: { type: 'read' } }]);
}

// ---- Creating and joining ---------------------------------------------------------------------------------------

/** A new group in the creator's own neighborhood; they're its admin. At most 3 a person, ever. */
export async function createNeighborGroup(db: Db, viewerId: string, input: NeighborGroupCreateInput, now: Date): Promise<NeighborGroupResult> {
  const parsed = neighborGroupCreateInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  return db.transaction(async (tx) => {
    // One at a time a person, so two quick taps never make a fourth.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`neighbor_group_create:${viewerId}`}))`);
    const person = await personOf(tx, viewerId);
    if (!person) return { ok: false, code: 'not_allowed' } as const;
    const [created] = await tx.select({ value: count() }).from(neighborGroups).where(eq(neighborGroups.createdByUserId, viewerId));
    const block = groupCreateBlock({ status: person.status, homeAreaId: person.homeAreaId, createdCount: created?.value ?? 0 });
    if (block === 'limit_reached') return { ok: false, code: 'limit_reached' } as const;
    if (block || !person.homeAreaId) return { ok: false, code: 'not_allowed' } as const;
    const [area] = await tx.select({ id: areas.id, marketId: areas.marketId }).from(areas).where(eq(areas.id, person.homeAreaId)).limit(1);
    if (!area || area.marketId !== person.homeMarketId) return { ok: false, code: 'not_allowed' } as const;
    const id = newId('ngrp');
    await tx.insert(neighborGroups).values({ id, marketId: area.marketId, areaId: area.id, kind: parsed.data.kind, name: parsed.data.name, createdByUserId: viewerId, createdAt: now, updatedAt: now });
    await tx.insert(neighborGroupMembers).values({ groupId: id, userId: viewerId, role: 'admin', joinedAt: now, lastReadAt: now });
    return { ok: true, code: 'saved', groupId: id } as const;
  });
}

async function inviteByCode(db: Db | Tx, code: string) {
  const [row] = await db
    .select({ invite: neighborGroupInvites, group: neighborGroups })
    .from(neighborGroupInvites)
    .innerJoin(neighborGroups, eq(neighborGroups.id, neighborGroupInvites.groupId))
    .where(eq(neighborGroupInvites.code, code))
    .limit(1);
  return row ?? null;
}

/** What a code leads to for this person: the group only when the code works for them (or they're in it). */
export async function previewInvite(db: Db, viewerId: string, input: { code: string }, now: Date): Promise<NeighborGroupInvitePreview> {
  const parsed = neighborGroupCodeInputSchema.safeParse(input);
  const raw = parsed.success ? parsed.data.code : '';
  const code = normalizeInviteCode(raw);
  const shownCode = code ? formatInviteCode(code) : raw.slice(0, 40);
  if (!code) return { code: shownCode, state: 'not_found' };
  const [person, found] = await Promise.all([personOf(db, viewerId), inviteByCode(db, code)]);
  if (!person) return { code: shownCode, state: 'not_found' };
  const group = found?.group ?? null;
  const [memberCount, member] = group ? await Promise.all([memberCountOf(db, group.id), membershipOf(db, group.id, viewerId)]) : [0, null];
  const state = inviteState({ invite: found?.invite ?? null, group: group ? { status: group.status, areaId: group.areaId, memberCount } : null, viewer: { homeAreaId: person.homeAreaId, isMember: member !== null }, now });
  if (!group || !found || !inviteNamesGroup(state)) return { code: shownCode, state };
  const [areaName, yourAreaName] = await Promise.all([areaNameOf(db, group.areaId), state === 'wrong_area' ? areaNameOf(db, person.homeAreaId) : Promise.resolve(undefined)]);
  return {
    code: shownCode,
    state,
    group: { id: group.id, name: group.name, kind: kindOf(group.kind), areaName: areaName ?? '', memberCount },
    ...(yourAreaName ? { yourAreaName } : {}),
    ...(state === 'valid' ? { expiresAt: found.invite.expiresAt.toISOString() } : {}),
  };
}

/** Joins by an invite the person accepted: from the group's neighborhood, while it works and there's room. */
export async function joinNeighborGroup(db: Db, viewerId: string, input: { code: string }, now: Date): Promise<NeighborGroupResult> {
  const parsed = neighborGroupCodeInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const code = normalizeInviteCode(parsed.data.code);
  if (!code) return { ok: false, code: 'not_found' };
  return db.transaction(async (tx) => {
    const found = await inviteByCode(tx, code);
    if (!found) return { ok: false, code: 'not_found' } as const;
    // Joins to one group one at a time, so the 50th seat goes once.
    await tx.select({ id: neighborGroups.id }).from(neighborGroups).where(eq(neighborGroups.id, found.group.id)).for('update');
    const person = await personOf(tx, viewerId);
    if (!person) return { ok: false, code: 'not_found' } as const;
    const [memberCount, member] = await Promise.all([memberCountOf(tx, found.group.id), membershipOf(tx, found.group.id, viewerId)]);
    const state = inviteState({ invite: found.invite, group: { status: found.group.status, areaId: found.group.areaId, memberCount }, viewer: { homeAreaId: person.homeAreaId, isMember: member !== null }, now });
    if (state === 'member') return { ok: true, code: 'updated', groupId: found.group.id } as const;
    if (state === 'not_found') return { ok: false, code: 'not_found' } as const;
    if (state === 'expired') return { ok: false, code: 'expired' } as const;
    if (state === 'full') return { ok: false, code: 'limit_reached' } as const;
    if (state !== 'valid' || !canWriteInGroups(person.status)) return { ok: false, code: 'not_allowed' } as const;
    await tx.insert(neighborGroupMembers).values({ groupId: found.group.id, userId: viewerId, role: 'member', joinedAt: now, lastReadAt: now, invitedByUserId: found.invite.createdByUserId }).onConflictDoNothing();
    return { ok: true, code: 'updated', groupId: found.group.id } as const;
  });
}

// ---- Messages ---------------------------------------------------------------------------------------------------

/**
 * A member's message: kept as written (masked when read), at most 30 a minute a person a group. The other members hear
 * about it in the app only (never by email, text or push), one unread notification a group that the next message
 * joins; never those who muted the group or blocked the sender (or were blocked). Open views update live.
 */
export async function sendGroupMessage(db: Db, viewerId: string, input: NeighborGroupMessageInput, now: Date): Promise<ActionResult> {
  const parsed = neighborGroupMessageInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const person = await personOf(db, viewerId);
  if (!person || !canWriteInGroups(person.status)) return { ok: false, code: 'not_allowed' };
  const membership = await membershipOf(db, parsed.data.groupId, viewerId);
  if (!membership) return { ok: false, code: 'not_found' };
  const limited = await consumeRateLimit(db, `group_message:${viewerId}:${membership.group.id}`, { limit: NEIGHBOR_GROUP_LIMITS.messagesPerMinute, windowSeconds: 60 }, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const group = membership.group;
  const messageId = newId('ngmsg');
  const members = await db
    .select({ userId: neighborGroupMembers.userId, mutedAt: neighborGroupMembers.mutedAt, status: users.status })
    .from(neighborGroupMembers)
    .innerJoin(users, eq(users.id, neighborGroupMembers.userId))
    .where(eq(neighborGroupMembers.groupId, group.id));
  const blocked = new Set(await blockedPeopleOf(db, viewerId));
  const recipients = groupRecipients(viewerId, members.map((member) => ({ userId: member.userId, muted: member.mutedAt !== null, status: member.status })), blocked);
  // Everyone in it who may see the message hears it live (muted too: their open view still updates).
  const live = members.filter((member) => member.userId !== viewerId && !blocked.has(member.userId)).map((member) => member.userId);
  const sender = shownName(person).displayName;
  await db.transaction(async (tx) => {
    await tx.insert(neighborGroupMessages).values({ id: messageId, groupId: group.id, authorUserId: viewerId, body: parsed.data.body, createdAt: now });
    await tx.update(neighborGroupMembers).set({ lastReadAt: now }).where(and(eq(neighborGroupMembers.groupId, group.id), eq(neighborGroupMembers.userId, viewerId)));
    await tx.update(neighborGroups).set({ updatedAt: now }).where(eq(neighborGroups.id, group.id));
    await notifyMembers(tx, group, recipients, { messageId, sender, now });
    // A notice carries ids only; each page reads the group the usual way (members only).
    await publishNotices(tx, live.map((userId) => ({ channel: userChannel(userId), notice: { type: 'update', event: 'group.message', group: group.id } })));
  });
  return { ok: true, code: 'sent' };
}

/** One unread `group_message` a person a group: the next message joins it (its count, its latest writer, its time). */
async function notifyMembers(tx: Tx, group: GroupRow, recipients: readonly string[], message: { messageId: string; sender: string; now: Date }): Promise<void> {
  if (recipients.length === 0) return;
  const unread = await tx
    .select({ id: notifications.id, userId: notifications.userId, params: notifications.params })
    .from(notifications)
    .where(and(inArray(notifications.userId, [...recipients]), eq(notifications.type, 'group_message'), isNull(notifications.readAt), sql`${notifications.target}->>'groupId' = ${group.id}`));
  const existing = new Map(unread.map((row) => [row.userId, row]));
  for (const userId of recipients) {
    const row = existing.get(userId);
    if (row) {
      await tx
        .update(notifications)
        .set({ createdAt: message.now, actorName: message.sender, title: group.name, params: { count: (row.params?.count ?? 1) + 1 } })
        .where(eq(notifications.id, row.id));
      continue;
    }
    await tx
      .insert(notifications)
      .values({ id: newId('ntf'), userId, type: 'group_message', title: group.name, actorName: message.sender, params: { count: 1 }, target: { kind: 'neighbor_group', groupId: group.id }, sourceEventId: `group_message:${message.messageId}`, createdAt: message.now })
      .onConflictDoNothing({ target: [notifications.sourceEventId, notifications.userId] });
  }
}

/** The author deletes their own message: it reads "Message deleted" for everyone (the words stay for reports). */
export async function deleteGroupMessage(db: Db, viewerId: string, input: { messageId: string }, now: Date): Promise<ActionResult> {
  const messageId = String(input?.messageId ?? '');
  const [row] = await db.select().from(neighborGroupMessages).where(eq(neighborGroupMessages.id, messageId)).limit(1);
  if (!row || row.authorUserId !== viewerId || !(await membershipOf(db, row.groupId, viewerId))) return { ok: false, code: 'not_found' };
  if (row.status !== 'visible') return { ok: true, code: 'updated' };
  await db.update(neighborGroupMessages).set({ status: 'deleted', deletedAt: now }).where(and(eq(neighborGroupMessages.id, row.id), eq(neighborGroupMessages.status, 'visible')));
  await publishLive(db, row.groupId, viewerId);
  return { ok: true, code: 'updated' };
}

/** Open views of the group update (a deletion, a removal): its members' channels, ids only. */
async function publishLive(db: Db | Tx, groupId: string, exceptUserId?: string): Promise<void> {
  const members = await db.select({ userId: neighborGroupMembers.userId }).from(neighborGroupMembers).where(eq(neighborGroupMembers.groupId, groupId));
  await publishNotices(
    db,
    members.filter((member) => member.userId !== exceptUserId).map((member) => ({ channel: userChannel(member.userId), notice: { type: 'update', event: 'group.message', group: groupId } })),
  );
}

// ---- Invites, members, leaving, muting --------------------------------------------------------------------------

/** A member makes an invite (7 days), while the group has room. At most 20 a day a person, against spraying codes. */
export async function createGroupInvite(db: Db, viewerId: string, input: { groupId: string }, now: Date): Promise<NeighborGroupInviteResult> {
  const person = await personOf(db, viewerId);
  if (!person || !canWriteInGroups(person.status)) return { ok: false, code: 'not_allowed' };
  const membership = await membershipOf(db, String(input?.groupId ?? ''), viewerId);
  if (!membership) return { ok: false, code: 'not_found' };
  if ((await memberCountOf(db, membership.group.id)) >= NEIGHBOR_GROUP_LIMITS.members) return { ok: false, code: 'limit_reached' };
  const limited = await consumeRateLimit(db, `group_invite:${viewerId}`, { limit: 20, windowSeconds: 24 * 3600 }, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited' };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = inviteCodeFrom(randomBytes(16));
    const [invite] = await db
      .insert(neighborGroupInvites)
      .values({ id: newId('ngi'), groupId: membership.group.id, code, createdByUserId: viewerId, createdAt: now, expiresAt: inviteExpiry(now) })
      .onConflictDoNothing({ target: neighborGroupInvites.code })
      .returning();
    if (invite) return { ok: true, invite: inviteView(invite, shownName(person).displayName, membership.role) };
  }
  return { ok: false, code: 'unknown' };
}

/** The admin revokes an invite: its link and code stop working at once. */
export async function revokeGroupInvite(db: Db, viewerId: string, input: { inviteId: string }, now: Date): Promise<ActionResult> {
  const [invite] = await db.select().from(neighborGroupInvites).where(eq(neighborGroupInvites.id, String(input?.inviteId ?? ''))).limit(1);
  if (!invite) return { ok: false, code: 'not_found' };
  const membership = await membershipOf(db, invite.groupId, viewerId);
  if (!membership) return { ok: false, code: 'not_found' };
  if (!canRevokeInvite(membership.role)) return { ok: false, code: 'not_allowed' };
  if (!inviteWorks(invite, now)) return { ok: true, code: 'updated' };
  await db.update(neighborGroupInvites).set({ revokedAt: now, revokedByUserId: viewerId }).where(eq(neighborGroupInvites.id, invite.id));
  return { ok: true, code: 'updated' };
}

/** The admin removes a member (never themselves). They can come back only with a new invite. */
export async function removeGroupMember(db: Db, viewerId: string, input: { groupId: string; userId: string }, now: Date): Promise<ActionResult> {
  const groupId = String(input?.groupId ?? '');
  const target = String(input?.userId ?? '');
  const membership = await membershipOf(db, groupId, viewerId);
  if (!membership) return { ok: false, code: 'not_found' };
  if (!canRemoveMember(membership.role, { isYou: target === viewerId })) return { ok: false, code: 'not_allowed' };
  const removed = await db.delete(neighborGroupMembers).where(and(eq(neighborGroupMembers.groupId, groupId), eq(neighborGroupMembers.userId, target))).returning({ userId: neighborGroupMembers.userId });
  if (removed.length === 0) return { ok: false, code: 'not_found' };
  await clearGroupNotifications(db, target, groupId, now);
  await db.update(neighborGroups).set({ updatedAt: now }).where(eq(neighborGroups.id, groupId));
  return { ok: true, code: 'updated' };
}

/** Leaves a group: an admin's role passes to the member who joined first; the last one out closes it. */
export async function leaveNeighborGroup(db: Db, viewerId: string, input: { groupId: string }, now: Date): Promise<ActionResult> {
  const groupId = String(input?.groupId ?? '');
  return db.transaction((tx) => leaveIn(tx, viewerId, groupId, now));
}

async function leaveIn(tx: Tx, viewerId: string, groupId: string, now: Date): Promise<ActionResult> {
  await tx.select({ id: neighborGroups.id }).from(neighborGroups).where(eq(neighborGroups.id, groupId)).for('update');
  const membership = await membershipOf(tx, groupId, viewerId);
  if (!membership) return { ok: false, code: 'not_found' };
  await tx.delete(neighborGroupMembers).where(and(eq(neighborGroupMembers.groupId, groupId), eq(neighborGroupMembers.userId, viewerId)));
  const rest = await tx.select({ userId: neighborGroupMembers.userId, joinedAt: neighborGroupMembers.joinedAt, role: neighborGroupMembers.role }).from(neighborGroupMembers).where(eq(neighborGroupMembers.groupId, groupId));
  if (rest.length === 0) {
    await tx.update(neighborGroups).set({ status: 'closed', closedAt: now, updatedAt: now }).where(eq(neighborGroups.id, groupId));
    await tx.update(neighborGroupInvites).set({ revokedAt: now, revokedByUserId: viewerId }).where(and(eq(neighborGroupInvites.groupId, groupId), isNull(neighborGroupInvites.revokedAt)));
  } else if (membership.role === 'admin' && !rest.some((member) => member.role === 'admin')) {
    const heir = nextAdmin(rest, viewerId);
    if (heir) await tx.update(neighborGroupMembers).set({ role: 'admin' }).where(and(eq(neighborGroupMembers.groupId, groupId), eq(neighborGroupMembers.userId, heir)));
  }
  await clearGroupNotifications(tx, viewerId, groupId, now);
  return { ok: true, code: 'updated' };
}

/** Their unread notification for a group they're no longer in goes read (its link would open nothing). */
async function clearGroupNotifications(db: Db | Tx, userId: string, groupId: string, now: Date): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, userId), eq(notifications.type, 'group_message'), isNull(notifications.readAt), sql`${notifications.target}->>'groupId' = ${groupId}`));
}

/** Mutes a group (no notifications for it) or unmutes it. */
export async function muteNeighborGroup(db: Db, viewerId: string, input: { groupId: string; muted: boolean }, now: Date): Promise<ActionResult> {
  if (typeof input?.muted !== 'boolean') return { ok: false, code: 'validation_failed' };
  const membership = await membershipOf(db, String(input.groupId ?? ''), viewerId);
  if (!membership) return { ok: false, code: 'not_found' };
  await db.update(neighborGroupMembers).set({ mutedAt: input.muted ? now : null }).where(and(eq(neighborGroupMembers.groupId, membership.group.id), eq(neighborGroupMembers.userId, viewerId)));
  if (input.muted) await clearGroupNotifications(db, viewerId, membership.group.id, now);
  return { ok: true, code: 'updated' };
}

/**
 * A deleted account (privacy requests, part 7): its messages come down, it leaves every group (an admin's role passes
 * on; a group it was alone in closes), and the invites it made stop working.
 */
export async function forgetGroupMember(tx: Tx, userId: string, now: Date): Promise<void> {
  await tx
    .update(neighborGroupMessages)
    .set({ status: 'removed', moderationReason: 'account_deleted', moderatedAt: now })
    .where(and(eq(neighborGroupMessages.authorUserId, userId), ne(neighborGroupMessages.status, 'removed')));
  await tx.update(neighborGroupInvites).set({ revokedAt: now, revokedByUserId: userId }).where(and(eq(neighborGroupInvites.createdByUserId, userId), isNull(neighborGroupInvites.revokedAt)));
  const groups = await tx.select({ groupId: neighborGroupMembers.groupId }).from(neighborGroupMembers).where(eq(neighborGroupMembers.userId, userId));
  for (const { groupId } of groups) await leaveIn(tx, userId, groupId, now);
}

// ---- Reports and staff ------------------------------------------------------------------------------------------

/**
 * A group message someone may report (src/modules/support/target-reports.ts): a member of its group, not its author,
 * while it shows, and not between people who blocked one another (they don't see it).
 */
export async function groupMessageReportTarget(db: Db, viewerId: string, messageId: string): Promise<{ id: string; groupId: string; authorUserId: string; author: string } | null> {
  const [row] = await db
    .select({ message: neighborGroupMessages, name: users.name, firstName: users.firstName, lastName: users.lastName })
    .from(neighborGroupMessages)
    .innerJoin(users, eq(users.id, neighborGroupMessages.authorUserId))
    .where(eq(neighborGroupMessages.id, messageId))
    .limit(1);
  if (!row || row.message.status !== 'visible' || row.message.authorUserId === viewerId) return null;
  if (!(await membershipOf(db, row.message.groupId, viewerId))) return null;
  const blocked = await blockedPeopleOf(db, viewerId);
  if (blocked.includes(row.message.authorUserId)) return null;
  return { id: row.message.id, groupId: row.message.groupId, authorUserId: row.message.authorUserId, author: shownName(row).displayName };
}

/** The reported message on its case, as written (staff read the words a member reported; nothing else of the group). */
export async function reportedGroupMessageOf(db: Db, messageId: string, canModerate: boolean): Promise<AdminCaseGroupMessage | null> {
  const [row] = await db
    .select({ message: neighborGroupMessages, group: neighborGroups, author: users.name, firstName: users.firstName, lastName: users.lastName, areaName: areas.name })
    .from(neighborGroupMessages)
    .innerJoin(neighborGroups, eq(neighborGroups.id, neighborGroupMessages.groupId))
    .innerJoin(users, eq(users.id, neighborGroupMessages.authorUserId))
    .innerJoin(areas, eq(areas.id, neighborGroups.areaId))
    .where(eq(neighborGroupMessages.id, messageId))
    .limit(1);
  if (!row) return null;
  const status = statusOf(row.message.status);
  return {
    message: { id: row.message.id, body: row.message.body, author: { displayName: shownName({ name: row.author, firstName: row.firstName, lastName: row.lastName }).displayName }, createdAt: row.message.createdAt.toISOString() },
    group: { name: row.group.name, kind: kindOf(row.group.kind), areaName: row.areaName, memberCount: await memberCountOf(db, row.group.id) },
    status,
    ...(status === 'removed' && row.message.moderationReason ? { removedReason: row.message.moderationReason } : {}),
    canModerate,
  };
}

/** Staff remove a reported message ("Removed by our team" for its members), or restore one they removed. */
export async function setGroupMessageRemoved(tx: Tx, messageId: string, input: { removed: boolean; staffId: string; reason: string }, now: Date): Promise<{ changed: boolean; groupId?: string } | null> {
  const [row] = await tx.select().from(neighborGroupMessages).where(eq(neighborGroupMessages.id, messageId)).for('update');
  if (!row) return null;
  if (row.authorUserId === input.staffId) return null;
  // A message its author deleted stays deleted.
  if (row.status === 'deleted') return { changed: false };
  if ((row.status === 'removed') === input.removed) return { changed: false };
  await tx
    .update(neighborGroupMessages)
    .set(input.removed ? { status: 'removed', moderatedByUserId: input.staffId, moderationReason: input.reason, moderatedAt: now } : { status: 'visible', moderatedByUserId: input.staffId, moderationReason: null, moderatedAt: now })
    .where(eq(neighborGroupMessages.id, row.id));
  await publishLive(tx, row.groupId);
  return { changed: true, groupId: row.groupId };
}
