import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { and, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MessageReaction, MessageSegment } from '@/contracts';
import { createStandInGifs } from '@/integrations/gifs/stand-in';
import { createLocalFileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { canViewFile } from '@/modules/files/access';
import { canViewRelatedFile } from '@/modules/files/related-access';
import { readStaffFileToken } from '@/modules/files/staff-file-token';
import { dataExportPhotos } from '@/modules/privacy/data-export';
import { storePhoto } from '@/modules/files/uploads';
import { attachGif } from '@/modules/messaging/gifs';
import { files } from '@/modules/tasks/schema';
import {
  createGroupInvite,
  createNeighborGroup,
  deleteGroupMessage,
  forgetGroupMember,
  getNeighborGroupsData,
  getNeighborGroupView,
  groupMessageReportTarget,
  groupsOf,
  joinNeighborGroup,
  leaveNeighborGroup,
  muteNeighborGroup,
  notifyGroupTyping,
  previewInvite,
  reactToGroupMessage,
  removeGroupMember,
  reportedGroupMessageOf,
  revokeGroupInvite,
  sendGroupMessage,
} from '@/modules/community/groups';
import { neighborGroupInvites, neighborGroupMembers, neighborGroupMessages, neighborGroupPhotos, neighborGroupReactions, neighborGroups } from '@/modules/community/schema';
import { areas } from '@/modules/markets/schema';
import { channelsFor } from '@/modules/notifications/delivery-domain';
import { notifications } from '@/modules/notifications/schema';
import { moderateReportedGroupMessage } from '@/modules/support/staff';
import { supportCases } from '@/modules/support/schema';
import { getReportPage, reportTarget } from '@/modules/support/target-reports';
import { blocks } from '@/modules/messaging/schema';
import { setBlocked } from '@/modules/trust/blocks';
import { createDb } from '@/platform/db/connect';
import { rateLimits } from '@/platform/rate-limit/schema';
import { throwawayClient } from '../support/people';

/**
 * Building and street groups (2026-11-24): copies of seeded clients living in Mueller (and one in Cherrywood), with
 * groups of their own. Everything this file makes goes at its start and end: their groups (members, invites and
 * messages with them), their group notifications, blocks between them, and their rate-limit windows.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const STAFF = { id: 'usr_morgan', roles: ['support_lead' as const] };
const ADMIN = 'usr_tmp_ng_admin';
/** Each admin creates at most 3 groups: the file's groups take turns among these. */
const ADMINS = [ADMIN, 'usr_tmp_ng_admin2', 'usr_tmp_ng_admin3', 'usr_tmp_ng_admin4', 'usr_tmp_ng_admin5', 'usr_tmp_ng_admin6', 'usr_tmp_ng_admin7'];
let groupsMade = 0;
const BEA = 'usr_tmp_ng_bea';
const CAL = 'usr_tmp_ng_cal';
const DEV = 'usr_tmp_ng_dev';
const FAR = 'usr_tmp_ng_far';
const NOAREA = 'usr_tmp_ng_noarea';
const MAKER = 'usr_tmp_ng_maker';
const PEOPLE = [...ADMINS, BEA, CAL, DEV, FAR, NOAREA, MAKER];
const now = () => new Date();
const MIN = 60_000;

let mueller: string;
let cherrywood: string;

async function cleanUp() {
  const groups = await db.select({ id: neighborGroups.id }).from(neighborGroups).where(inArray(neighborGroups.createdByUserId, PEOPLE));
  // Their reports' cases name group messages that are about to go.
  if (groups.length) await db.delete(neighborGroups).where(inArray(neighborGroups.id, groups.map((group) => group.id)));
  await db.delete(notifications).where(and(inArray(notifications.userId, PEOPLE), eq(notifications.type, 'group_message')));
  await db.delete(blocks).where(or(inArray(blocks.blockerId, PEOPLE), inArray(blocks.blockedId, PEOPLE)));
  await db.delete(rateLimits).where(or(...PEOPLE.map((id) => like(rateLimits.key, `%${id}%`))));
  // Their uploads (their links to messages went with the groups above).
  await db.delete(files).where(inArray(files.ownerUserId, PEOPLE));
}

beforeAll(async () => {
  const found = await db.select({ id: areas.id, slug: areas.slug }).from(areas).where(and(eq(areas.marketId, 'mkt_austin'), inArray(areas.slug, ['mueller', 'cherrywood'])));
  mueller = found.find((area) => area.slug === 'mueller')!.id;
  cherrywood = found.find((area) => area.slug === 'cherrywood')!.id;
  for (const id of PEOPLE) await throwawayClient(db, id);
  await db.update(users).set({ homeMarketId: 'mkt_austin', homeAreaId: mueller, status: 'active' }).where(inArray(users.id, PEOPLE));
  await db.update(users).set({ homeAreaId: cherrywood }).where(eq(users.id, FAR));
  await db.update(users).set({ homeAreaId: null }).where(eq(users.id, NOAREA));
  await cleanUp();
});

afterAll(async () => {
  await cleanUp();
  await pool.end();
});

/** A group of an admin's (one of `ADMINS`) with BEA and CAL in it (by invite), and the invite they used. */
async function groupWithMembers(name: string, members: readonly string[] = [BEA, CAL]) {
  const admin = ADMINS[Math.floor(groupsMade / 3)]!;
  groupsMade += 1;
  const created = await createNeighborGroup(db, admin, { name, kind: 'building' }, now());
  expect(created).toMatchObject({ ok: true, code: 'saved' });
  const groupId = created.groupId!;
  const invite = await createGroupInvite(db, admin, { groupId }, now());
  if (!invite.ok) throw new Error(`invite failed: ${invite.code}`);
  for (const member of members) expect(await joinNeighborGroup(db, member, { code: invite.invite.code }, now())).toMatchObject({ ok: true, groupId });
  return { admin, groupId, code: invite.invite.code, inviteId: invite.invite.id };
}

async function unreadGroupNotices(userId: string, groupId: string) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, 'group_message'), isNull(notifications.readAt), sql`${notifications.target}->>'groupId' = ${groupId}`));
}

describe('building and street groups', () => {
  it('lets someone with a neighborhood create 3 groups, in their own neighborhood, as admin', async () => {
    const made: string[] = [];
    for (const name of ['Maple Court residents', 'Elm St 1200 block', 'Garden Court']) {
      const result = await createNeighborGroup(db, MAKER, { name, kind: name.includes('St') ? 'street' : 'building' }, now());
      expect(result).toMatchObject({ ok: true, code: 'saved' });
      made.push(result.groupId!);
    }
    expect(await createNeighborGroup(db, MAKER, { name: 'One too many', kind: 'street' }, now())).toMatchObject({ ok: false, code: 'limit_reached' });
    const [group] = await db.select().from(neighborGroups).where(eq(neighborGroups.id, made[0]!));
    expect(group).toMatchObject({ areaId: mueller, marketId: 'mkt_austin', createdByUserId: MAKER });
    const [membership] = await db.select().from(neighborGroupMembers).where(eq(neighborGroupMembers.groupId, made[0]!));
    expect(membership).toMatchObject({ userId: MAKER, role: 'admin' });
    // Leaving doesn't give a creation back.
    expect(await leaveNeighborGroup(db, MAKER, { groupId: made[2]! }, now())).toMatchObject({ ok: true });
    const data = await getNeighborGroupsData(db, MAKER, {}, now());
    expect(data).toMatchObject({ create: { allowed: false, reason: 'limit_reached' }, createsLeft: 0 });
    expect(data!.groups.map((group) => group.id).sort()).toEqual(made.slice(0, 2).sort());
    expect(await createNeighborGroup(db, NOAREA, { name: 'Nowhere group', kind: 'building' }, now())).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await createNeighborGroup(db, ADMIN, { name: 'ab', kind: 'building' }, now())).toMatchObject({ ok: false, code: 'validation_failed' });
  });

  it('shows nothing of a group to anyone outside it', async () => {
    const { groupId } = await groupWithMembers('Access matrix building');
    await sendGroupMessage(db, BEA, { groupId, body: 'Hello building' }, now());
    const [message] = await db.select().from(neighborGroupMessages).where(eq(neighborGroupMessages.groupId, groupId));
    expect(await getNeighborGroupView(db, DEV, groupId, now())).toBeNull();
    expect(await groupsOf(db, DEV)).toEqual([]);
    expect((await getNeighborGroupsData(db, DEV, { groupId }, now()))?.openGroupId).toBeUndefined();
    expect(await sendGroupMessage(db, DEV, { groupId, body: 'Let me in' }, now())).toMatchObject({ ok: false, code: 'not_found' });
    expect(await createGroupInvite(db, DEV, { groupId }, now())).toMatchObject({ ok: false, code: 'not_found' });
    expect(await muteNeighborGroup(db, DEV, { groupId, muted: true }, now())).toMatchObject({ ok: false, code: 'not_found' });
    expect(await removeGroupMember(db, DEV, { groupId, userId: BEA }, now())).toMatchObject({ ok: false, code: 'not_found' });
    expect(await deleteGroupMessage(db, DEV, { messageId: message!.id }, now())).toMatchObject({ ok: false, code: 'not_found' });
    expect(await groupMessageReportTarget(db, DEV, message!.id)).toBeNull();
    expect(await getReportPage(db, DEV, 'group_message', message!.id)).toBeNull();
    // Members read it.
    const view = await getNeighborGroupView(db, CAL, groupId, now());
    expect(view?.messages.map((row) => row.author.displayName)).toEqual(['Ruth A.']);
    expect(view?.members.map((member) => member.displayName)).toEqual(['Ruth A.', 'Ruth A.', 'Ruth A.']);
    // Members show by name and neighborhood only: no email or phone anywhere in what a member reads.
    expect(JSON.stringify(view)).not.toMatch(/@example\.test|\+1\d{10}/);
  });

  it('joins only by an invite that works, from the group’s neighborhood; the admin turns invites off', async () => {
    const { admin, groupId, code, inviteId } = await groupWithMembers('Invite rules building', [BEA]);
    expect(await previewInvite(db, CAL, { code }, now())).toMatchObject({ state: 'valid', group: { id: groupId, name: 'Invite rules building', areaName: 'Mueller', memberCount: 2 } });
    expect(await previewInvite(db, BEA, { code }, now())).toMatchObject({ state: 'member' });
    // Another neighborhood: named (so they know why), never admitted.
    expect(await previewInvite(db, FAR, { code }, now())).toMatchObject({ state: 'wrong_area', yourAreaName: 'Cherrywood' });
    expect(await joinNeighborGroup(db, FAR, { code }, now())).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await joinNeighborGroup(db, NOAREA, { code }, now())).toMatchObject({ ok: false, code: 'not_allowed' });
    // A code typed in lowercase without its dash works too.
    expect(await previewInvite(db, CAL, { code: code.replace('-', '').toLowerCase() }, now())).toMatchObject({ state: 'valid' });
    expect(await previewInvite(db, CAL, { code: 'ZZZZ-ZZZZ' }, now())).toEqual({ code: 'ZZZZ-ZZZZ', state: 'not_found' });
    // A member can't turn it off; the admin can, and then it names nothing.
    expect(await revokeGroupInvite(db, BEA, { inviteId }, now())).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await revokeGroupInvite(db, admin, { inviteId }, now())).toMatchObject({ ok: true });
    const revoked = await previewInvite(db, CAL, { code }, now());
    expect(revoked).toMatchObject({ state: 'revoked' });
    expect(revoked.group).toBeUndefined();
    expect(await joinNeighborGroup(db, CAL, { code }, now())).toMatchObject({ ok: false, code: 'not_allowed' });
    // 7 days, then it's expired.
    const fresh = await createGroupInvite(db, BEA, { groupId }, now());
    if (!fresh.ok) throw new Error('invite failed');
    const [row] = await db.select().from(neighborGroupInvites).where(eq(neighborGroupInvites.id, fresh.invite.id));
    expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBe(7 * 24 * 60 * MIN);
    expect(await previewInvite(db, CAL, { code: fresh.invite.code }, new Date(row!.expiresAt.getTime() + 1000))).toMatchObject({ state: 'expired' });
    expect(await joinNeighborGroup(db, CAL, { code: fresh.invite.code }, new Date(row!.expiresAt.getTime() + 1000))).toMatchObject({ ok: false, code: 'expired' });
    // A member sees their own invite; the admin sees every one.
    expect((await getNeighborGroupView(db, BEA, groupId, now()))!.invites.map((invite) => invite.id)).toEqual([fresh.invite.id]);
    expect((await getNeighborGroupView(db, admin, groupId, now()))!.invites.map((invite) => [invite.id, invite.canRevoke])).toEqual([[fresh.invite.id, true]]);
  });

  it('masks contact details, always, and limits each person to 30 messages a minute a group', async () => {
    const { groupId } = await groupWithMembers('Masking building');
    expect(await sendGroupMessage(db, BEA, { groupId, body: 'Text me at 512-555-0147 or bea@example.com, or venmo @bea-pays' }, now())).toMatchObject({ ok: true, code: 'sent' });
    const view = await getNeighborGroupView(db, CAL, groupId, now());
    const segments = view!.messages[0]!.segments;
    expect(segments).toContainEqual({ kind: 'masked', detail: 'phone', hint: '0147' });
    expect(segments).toContainEqual({ kind: 'masked', detail: 'email' });
    expect(JSON.stringify(segments)).not.toMatch(/512|bea@example|bea-pays/);
    expect(await sendGroupMessage(db, BEA, { groupId, body: '   ' }, now())).toMatchObject({ ok: false, code: 'validation_failed' });
    const at = new Date(Math.floor(Date.now() / MIN) * MIN + 5000);
    const results = [];
    for (let i = 0; i < 31; i += 1) results.push(await sendGroupMessage(db, CAL, { groupId, body: `Message ${i}` }, at));
    expect(results.slice(0, 30).every((result) => result.ok)).toBe(true);
    expect(results[30]).toMatchObject({ ok: false, code: 'rate_limited' });
    // Another group isn't held back.
    const other = await groupWithMembers('Masking building two');
    expect(await sendGroupMessage(db, CAL, { groupId: other.groupId, body: 'Still fine here' }, at)).toMatchObject({ ok: true });
  });

  it('tells members once in the app (collapsed), never the muted, and opening the group reads it', async () => {
    const { admin, groupId } = await groupWithMembers('Notification building', [BEA, CAL, DEV]);
    expect(await muteNeighborGroup(db, DEV, { groupId, muted: true }, now())).toMatchObject({ ok: true });
    for (const body of ['One', 'Two', 'Three']) await sendGroupMessage(db, BEA, { groupId, body }, now());
    const forCal = await unreadGroupNotices(CAL, groupId);
    expect(forCal).toHaveLength(1);
    expect(forCal[0]).toMatchObject({ title: 'Notification building', actorName: 'Ruth A.', params: { count: 3 }, target: { kind: 'neighbor_group', groupId } });
    expect(await unreadGroupNotices(DEV, groupId)).toHaveLength(0);
    expect(await unreadGroupNotices(BEA, groupId)).toHaveLength(0);
    // The unread count shows in the list (muted too), and never counts their own.
    expect((await groupsOf(db, CAL)).find((group) => group.id === groupId)).toMatchObject({ unreadCount: 3, muted: false });
    expect((await groupsOf(db, DEV)).find((group) => group.id === groupId)).toMatchObject({ unreadCount: 3, muted: true });
    expect((await groupsOf(db, BEA)).find((group) => group.id === groupId)).toMatchObject({ unreadCount: 0 });
    // In the app only: no channel for email, texts or push.
    expect(channelsFor('group_message')).toEqual([]);
    await getNeighborGroupView(db, CAL, groupId, now());
    expect(await unreadGroupNotices(CAL, groupId)).toHaveLength(0);
    expect((await groupsOf(db, CAL)).find((group) => group.id === groupId)).toMatchObject({ unreadCount: 0 });
    // The next message makes a new one.
    await sendGroupMessage(db, admin, { groupId, body: 'Four' }, new Date(Date.now() + 1000));
    expect(await unreadGroupNotices(CAL, groupId)).toMatchObject([{ params: { count: 1 } }]);
  });

  it('hides messages between people who blocked one another, and tells neither about the other', async () => {
    const { admin, groupId } = await groupWithMembers('Block building');
    await setBlocked(db, CAL, BEA, true, now());
    await sendGroupMessage(db, BEA, { groupId, body: 'From Bea' }, now());
    await sendGroupMessage(db, admin, { groupId, body: 'From the admin' }, new Date(Date.now() + 1000));
    const calView = await getNeighborGroupView(db, CAL, groupId, now());
    expect(calView!.messages.map((message) => message.segments)).toEqual([[{ kind: 'text', text: 'From the admin' }]]);
    expect(calView!.blockedHidden).toBe(1);
    // Both ways: Bea doesn't see Cal's either.
    await sendGroupMessage(db, CAL, { groupId, body: 'From Cal' }, new Date(Date.now() + 2000));
    const beaView = await getNeighborGroupView(db, BEA, groupId, now());
    expect(beaView!.messages.some((message) => message.author.userId === CAL)).toBe(false);
    expect((await unreadGroupNotices(BEA, groupId)).length).toBe(0);
    const [beaMessage] = await db.select().from(neighborGroupMessages).where(and(eq(neighborGroupMessages.groupId, groupId), eq(neighborGroupMessages.authorUserId, BEA)));
    expect(await groupMessageReportTarget(db, CAL, beaMessage!.id)).toBeNull();
    await setBlocked(db, CAL, BEA, false, now());
  });

  it('lets anyone leave and the admin remove members; the admin role passes on, and the last one out closes it', async () => {
    const { admin, groupId } = await groupWithMembers('Leaving building', [BEA, CAL, DEV]);
    expect(await removeGroupMember(db, BEA, { groupId, userId: CAL }, now())).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await removeGroupMember(db, admin, { groupId, userId: admin }, now())).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await removeGroupMember(db, admin, { groupId, userId: CAL }, now())).toMatchObject({ ok: true });
    expect(await getNeighborGroupView(db, CAL, groupId, now())).toBeNull();
    const view = await getNeighborGroupView(db, admin, groupId, now());
    expect(view!.members.map((member) => [member.userId, member.canRemove])).toEqual([[admin, false], [BEA, true], [DEV, true]]);
    expect(await leaveNeighborGroup(db, admin, { groupId }, now())).toMatchObject({ ok: true });
    expect((await getNeighborGroupView(db, BEA, groupId, now()))!.you.role).toBe('admin');
    await leaveNeighborGroup(db, DEV, { groupId }, now());
    await leaveNeighborGroup(db, BEA, { groupId }, now());
    const [group] = await db.select().from(neighborGroups).where(eq(neighborGroups.id, groupId));
    expect(group).toMatchObject({ status: 'closed' });
  });

  it('can be reported by a member, and our team removes or restores the message from the case', async () => {
    const { admin, groupId } = await groupWithMembers('Report building');
    await sendGroupMessage(db, BEA, { groupId, body: 'Pay me on the side for the shared cleaner' }, now());
    const [message] = await db.select().from(neighborGroupMessages).where(eq(neighborGroupMessages.groupId, groupId));
    const details = { reason: 'off_platform_payment' as const, details: 'Asking everyone to pay off the platform.' };
    expect(await reportTarget(db, BEA, 'group_message', message!.id, details, now())).toMatchObject({ ok: false, code: 'not_found' });
    expect(await getReportPage(db, CAL, 'group_message', message!.id)).toMatchObject({ target: { kind: 'group_message', id: message!.id, name: 'Ruth A.' }, backHref: `/app/community?group=${groupId}` });
    expect(await reportTarget(db, CAL, 'group_message', message!.id, details, now())).toMatchObject({ ok: true, code: 'submitted' });
    const [reported] = await db.select().from(supportCases).where(and(eq(supportCases.openedByUserId, CAL), sql`${supportCases.context}->>'groupMessageId' = ${message!.id}`));
    expect(reported).toMatchObject({ type: 'report_content', subjectUserId: BEA });
    const calView = await getNeighborGroupView(db, CAL, groupId, now());
    expect(calView!.messages[0]).toMatchObject({ reportedByYou: true, canReport: false });
    expect(await moderateReportedGroupMessage(db, STAFF, reported!.id, { visible: false, reason: 'Moves payment off the platform.' }, now())).toMatchObject({ ok: true, code: 'updated' });
    const after = await getNeighborGroupView(db, admin, groupId, now());
    expect(after!.messages[0]).toMatchObject({ status: 'removed', segments: [], canReport: false, canDelete: false });
    expect(await moderateReportedGroupMessage(db, STAFF, reported!.id, { visible: true, reason: 'Restored after a second look.' }, now())).toMatchObject({ ok: true });
    expect((await getNeighborGroupView(db, admin, groupId, now()))!.messages[0]).toMatchObject({ status: 'visible' });
    // A staff member who can't moderate community content can't.
    expect(await moderateReportedGroupMessage(db, { id: 'usr_morgan', roles: ['support_agent' as const] }, reported!.id, { visible: false, reason: 'Trying without the role.' }, now())).toMatchObject({ ok: false });
  });

  it('lets an author delete their own message; a deleted account’s messages come down and it leaves', async () => {
    const { admin, groupId } = await groupWithMembers('Deleting building');
    await sendGroupMessage(db, BEA, { groupId, body: 'Oops, wrong group' }, now());
    await sendGroupMessage(db, CAL, { groupId, body: 'Cal was here' }, new Date(Date.now() + 1000));
    const rows = await db.select().from(neighborGroupMessages).where(eq(neighborGroupMessages.groupId, groupId));
    const beas = rows.find((row) => row.authorUserId === BEA)!;
    expect(await deleteGroupMessage(db, CAL, { messageId: beas.id }, now())).toMatchObject({ ok: false, code: 'not_found' });
    expect(await deleteGroupMessage(db, BEA, { messageId: beas.id }, now())).toMatchObject({ ok: true });
    const view = await getNeighborGroupView(db, admin, groupId, now());
    expect(view!.messages.find((message) => message.id === beas.id)).toMatchObject({ status: 'deleted', segments: [] });
    await db.transaction((tx) => forgetGroupMember(tx, CAL, now()));
    const cals = await db.select().from(neighborGroupMessages).where(and(eq(neighborGroupMessages.groupId, groupId), eq(neighborGroupMessages.authorUserId, CAL)));
    expect(cals.every((row) => row.status === 'removed')).toBe(true);
    expect(await getNeighborGroupView(db, CAL, groupId, now())).toBeNull();
  });
});

describe('group chat as in a conversation (2026-11-24)', () => {
  const storage = createLocalFileStorage(path.join(os.tmpdir(), `tnm-groups-${process.pid}`));
  const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#88aa66' } }).png().toBuffer();
  async function upload(owner: string, kind: 'group_photo' | 'message' = 'group_photo'): Promise<string> {
    const result = await storePhoto({ db, storage }, { userId: owner, kind, file: new File([new Uint8Array(await png())], 'pond.png', { type: 'image/png' }) });
    if (!result.ok) throw new Error(`upload failed: ${result.code}`);
    return result.photo.id;
  }
  /** Whether this person may open the file, as the file route decides (staff links aside). */
  async function canOpen(fileId: string, userId: string): Promise<boolean> {
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    return canViewFile(file!, { userId }) || (await canViewRelatedFile(db, file!, userId, now()));
  }
  const plain = (segments: MessageSegment[]) => segments.map((segment) => (segment.kind === 'text' ? segment.text : '•')).join('');
  const lastMessageIn = async (groupId: string) => (await db.select().from(neighborGroupMessages).where(eq(neighborGroupMessages.groupId, groupId)).orderBy(sql`${neighborGroupMessages.createdAt} desc`).limit(1))[0]!;

  it('sends photos that only current members open, while the message shows, never across a block', async () => {
    const { admin, groupId } = await groupWithMembers('Photo building');
    const [first, second] = [await upload(BEA), await upload(BEA)];
    expect(await sendGroupMessage(db, BEA, { groupId, attachmentIds: [first, second] }, now())).toMatchObject({ ok: true, code: 'sent' });
    const sent = (await getNeighborGroupView(db, CAL, groupId, now()))!.messages.at(-1)!;
    expect(sent.segments).toEqual([]);
    expect(sent.attachments).toEqual([
      { id: first, src: `/api/files/${first}`, alt: '', width: 40, height: 30 },
      { id: second, src: `/api/files/${second}`, alt: '', width: 40, height: 30 },
    ]);
    // Its members and its uploader open it; nobody else.
    for (const member of [CAL, admin, BEA]) expect(await canOpen(first, member)).toBe(true);
    expect(await canOpen(first, DEV)).toBe(false);
    // A photo goes on one message, and only the sender's own group uploads go at all.
    expect(await sendGroupMessage(db, BEA, { groupId, attachmentIds: [first] }, now())).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { attachmentIds: ['invalid'] } });
    expect(await sendGroupMessage(db, BEA, { groupId, attachmentIds: [await upload(CAL)] }, now())).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await sendGroupMessage(db, BEA, { groupId, attachmentIds: [await upload(BEA, 'message')] }, now())).toMatchObject({ ok: false, code: 'validation_failed' });
    const twice = await upload(BEA);
    expect(await sendGroupMessage(db, BEA, { groupId, attachmentIds: [twice, twice] }, now())).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await sendGroupMessage(db, BEA, { groupId, attachmentIds: ['fil_1', 'fil_2', 'fil_3', 'fil_4', 'fil_5'] }, now())).toMatchObject({ ok: false, code: 'validation_failed' });
    // A block between the reader and its author closes it, both ways; lifted, it opens again.
    await setBlocked(db, BEA, CAL, true, now());
    expect(await canOpen(first, CAL)).toBe(false);
    await setBlocked(db, BEA, CAL, false, now());
    expect(await canOpen(first, CAL)).toBe(true);
    // Out of the group: no more.
    expect(await removeGroupMember(db, admin, { groupId, userId: CAL }, now())).toMatchObject({ ok: true });
    expect(await canOpen(first, CAL)).toBe(false);
    // Deleted by its author: gone for the members (photos too), still the author's own.
    const [link] = await db.select().from(neighborGroupPhotos).where(eq(neighborGroupPhotos.fileId, first));
    expect(await deleteGroupMessage(db, BEA, { messageId: link!.messageId }, now())).toMatchObject({ ok: true });
    expect(await canOpen(first, admin)).toBe(false);
    expect(await canOpen(first, BEA)).toBe(true);
    expect((await getNeighborGroupView(db, admin, groupId, now()))!.messages.find((message) => message.id === link!.messageId)).toMatchObject({ status: 'deleted', attachments: [], reactions: [] });
  });

  it('sends a picked GIF as a group photo of its own, and a member’s copy of their data has their group photos', async () => {
    const { groupId } = await groupWithMembers('GIF building');
    const gif = await attachGif({ db, storage, now }, { userId: BEA, id: 'sample-party', kind: 'group_photo' }, createStandInGifs());
    if (!gif.ok) throw new Error(gif.code);
    const [row] = await db.select().from(files).where(eq(files.id, gif.photo.id));
    expect(row).toMatchObject({ kind: 'group_photo', contentType: 'image/gif', storageKey: `group_photo/${gif.photo.id}.gif` });
    expect(await sendGroupMessage(db, BEA, { groupId, attachmentIds: [gif.photo.id] }, now())).toMatchObject({ ok: true });
    expect((await getNeighborGroupView(db, CAL, groupId, now()))!.messages.at(-1)!.attachments).toEqual([gif.photo]);
    expect(gif.photo.animated).toBe(true);
    expect(await canOpen(gif.photo.id, CAL)).toBe(true);
    expect(await canOpen(gif.photo.id, DEV)).toBe(false);
    // Hers, in her copy: under groups/, as the GIF it is. Never in another member's.
    expect((await dataExportPhotos(db, storage, BEA)).list.map((entry) => entry.file)).toContain(`photos/groups/${gif.photo.id}.gif`);
    expect((await dataExportPhotos(db, storage, CAL)).list.map((entry) => entry.file)).not.toContain(`photos/groups/${gif.photo.id}.gif`);
  });

  it('lets members react to a message that shows, once an emoji each, and never counts across a block', async () => {
    const { admin, groupId } = await groupWithMembers('Reaction building', [BEA, CAL, DEV]);
    await sendGroupMessage(db, BEA, { groupId, body: 'Who wants pizza?' }, now());
    const message = await lastMessageIn(groupId);
    const react = (userId: string, emoji: string, on = true) => reactToGroupMessage(db, userId, { messageId: message.id, emoji: emoji as MessageReaction, on }, now());
    const reactionsFor = async (viewer: string) => (await getNeighborGroupView(db, viewer, groupId, now()))!.messages[0]!.reactions;
    expect(await react(CAL, 'heart')).toEqual({ ok: true, code: 'updated' });
    expect(await react(CAL, 'heart')).toMatchObject({ ok: true });
    expect(await react(admin, 'heart')).toMatchObject({ ok: true });
    expect(await react(BEA, 'party')).toMatchObject({ ok: true });
    expect(await reactionsFor(CAL)).toEqual([{ emoji: 'heart', count: 2, mine: true }, { emoji: 'party', count: 1, mine: false }]);
    expect(await react(CAL, 'heart', false)).toMatchObject({ ok: true });
    expect(await reactionsFor(BEA)).toEqual([{ emoji: 'heart', count: 1, mine: false }, { emoji: 'party', count: 1, mine: true }]);
    // Only the offered emoji, and only members.
    expect(await react(CAL, 'skull')).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await react(FAR, 'heart')).toMatchObject({ ok: false, code: 'not_found' });
    // Someone DEV blocked: their heart isn't counted for DEV, while DEV still reacts to Bea's message.
    await setBlocked(db, DEV, admin, true, now());
    expect(await react(DEV, 'heart')).toMatchObject({ ok: true });
    expect(await reactionsFor(DEV)).toEqual([{ emoji: 'heart', count: 1, mine: true }, { emoji: 'party', count: 1, mine: false }]);
    await setBlocked(db, DEV, admin, false, now());
    // Never on the message of someone blocked either way.
    await setBlocked(db, BEA, CAL, true, now());
    expect(await react(CAL, 'fire')).toMatchObject({ ok: false, code: 'not_found' });
    await setBlocked(db, BEA, CAL, false, now());
    // An account that can't write reads, but doesn't react.
    await db.update(users).set({ status: 'restricted' }).where(eq(users.id, CAL));
    try {
      expect(await react(CAL, 'fire')).toMatchObject({ ok: false, code: 'not_allowed' });
      expect((await getNeighborGroupView(db, CAL, groupId, now()))!.messages[0]).toMatchObject({ canReact: false, canReply: false });
    } finally {
      await db.update(users).set({ status: 'active' }).where(eq(users.id, CAL));
    }
    // A deleted account's reactions go with it.
    await db.transaction((tx) => forgetGroupMember(tx, DEV, now()));
    expect(await db.select().from(neighborGroupReactions).where(eq(neighborGroupReactions.userId, DEV))).toEqual([]);
    // A deleted message takes none, and shows none.
    await deleteGroupMessage(db, BEA, { messageId: message.id }, now());
    expect(await react(CAL, 'fire')).toMatchObject({ ok: false, code: 'not_found' });
    expect((await getNeighborGroupView(db, CAL, groupId, now()))!.messages[0]).toMatchObject({ status: 'deleted', reactions: [], canReact: false, canReply: false });
  });

  it('quotes the message a reply answers, as each member may see it', async () => {
    const { admin, groupId } = await groupWithMembers('Reply building');
    const other = await groupWithMembers('Reply building two');
    await sendGroupMessage(db, BEA, { groupId, body: 'Text me at 512-555-0147 about the ladder' }, now());
    const quoted = await lastMessageIn(groupId);
    expect(await sendGroupMessage(db, CAL, { groupId, body: 'I have one', replyToId: quoted.id }, new Date(Date.now() + 1000))).toMatchObject({ ok: true });
    const replyFor = async (viewer: string) => (await getNeighborGroupView(db, viewer, groupId, now()))!.messages.find((message) => message.replyTo)!.replyTo;
    const forAdmin = await replyFor(admin);
    expect(forAdmin).toMatchObject({ id: quoted.id, status: 'visible', author: { displayName: 'Ruth A.', isYou: false } });
    expect(forAdmin!.segments).toContainEqual({ kind: 'masked', detail: 'phone', hint: '0147' });
    expect(JSON.stringify(forAdmin)).not.toMatch(/512/);
    expect((await replyFor(BEA))!.author).toEqual({ displayName: 'Ruth A.', isYou: true });
    // Only a message of the same group that the sender sees.
    expect(await sendGroupMessage(db, CAL, { groupId: other.groupId, body: 'Wrong group', replyToId: quoted.id }, now())).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { replyToId: ['invalid'] } });
    // Across a block: neither its words nor its author, and it can't be quoted.
    await setBlocked(db, admin, BEA, true, now());
    expect(await replyFor(admin)).toEqual({ id: quoted.id, status: 'hidden', segments: [] });
    expect(await sendGroupMessage(db, admin, { groupId, body: 'Me too', replyToId: quoted.id }, now())).toMatchObject({ ok: false, code: 'validation_failed' });
    await setBlocked(db, admin, BEA, false, now());
    // Deleted later: the quote says so, and it can't be quoted again.
    await deleteGroupMessage(db, BEA, { messageId: quoted.id }, now());
    expect(await replyFor(admin)).toMatchObject({ status: 'deleted', segments: [], author: { displayName: 'Ruth A.' } });
    expect(await sendGroupMessage(db, CAL, { groupId, body: 'Late reply', replyToId: quoted.id }, now())).toMatchObject({ ok: false, code: 'validation_failed' });
  });

  it('marks where the new messages start, and sends a message once however often it is retried', async () => {
    const { groupId } = await groupWithMembers('Unread building');
    const at = (ms: number) => new Date(Date.now() + ms);
    await sendGroupMessage(db, BEA, { groupId, body: 'Before' }, at(1000));
    // Cal's first look: Bea's message was new. Looking again: nothing is.
    expect((await getNeighborGroupView(db, CAL, groupId, at(1500)))!.firstUnreadId).toBe((await lastMessageIn(groupId)).id);
    expect((await getNeighborGroupView(db, CAL, groupId, at(1600)))!.firstUnreadId).toBeUndefined();
    const key = randomUUID();
    for (let attempt = 0; attempt < 3; attempt += 1) expect(await sendGroupMessage(db, BEA, { groupId, body: 'After', requestKey: key }, at(2000))).toEqual({ ok: true, code: 'sent' });
    await sendGroupMessage(db, BEA, { groupId, body: 'And again' }, at(3000));
    const view = await getNeighborGroupView(db, CAL, groupId, at(4000));
    expect(view!.messages.map((message) => plain(message.segments))).toEqual(['Before', 'After', 'And again']);
    expect(view!.firstUnreadId).toBe(view!.messages[1]!.id);
    // Your own never count.
    expect((await getNeighborGroupView(db, BEA, groupId, at(5000)))!.firstUnreadId).toBeUndefined();
  });

  it('says "typing…" to the other members, at most every 2.5 s, never to someone blocked', async () => {
    const { admin, groupId } = await groupWithMembers('Typing building');
    const at = new Date(Date.now() + 90_000);
    const heard: { channel: string; notice: { type: string; group?: string; user?: string } }[] = [];
    const client = await pool.connect();
    const onNotice = (message: { payload?: string }) => {
      const envelope = JSON.parse(message.payload ?? '{}') as (typeof heard)[number];
      if (envelope.notice?.type === 'typing' && envelope.notice.group === groupId) heard.push(envelope);
    };
    client.on('notification', onNotice);
    try {
      await client.query('LISTEN tnm_realtime');
      await setBlocked(db, CAL, BEA, true, at);
      expect(await notifyGroupTyping(db, BEA, { groupId }, at)).toBe('sent');
      expect(await notifyGroupTyping(db, BEA, { groupId }, new Date(at.getTime() + 1000))).toBe('throttled');
      expect(await notifyGroupTyping(db, DEV, { groupId }, at)).toBe('not_found');
      await new Promise((resolve) => setTimeout(resolve, 200));
    } finally {
      client.removeListener('notification', onNotice);
      await client.query('UNLISTEN tnm_realtime');
      client.release();
      await setBlocked(db, CAL, BEA, false, at);
    }
    // The admin hears it (ids only); Bea doesn't hear herself, and Cal, who blocked her, doesn't either.
    expect(heard.map((envelope) => envelope.channel)).toEqual([`user:${admin}`]);
    expect(heard[0]!.notice).toEqual({ type: 'typing', group: groupId, user: BEA });
  });

  it('shows our team a reported message’s photos through the case’s staff link', async () => {
    const { groupId } = await groupWithMembers('Staff photo building');
    const photo = await upload(BEA);
    await sendGroupMessage(db, BEA, { groupId, body: 'For sale', attachmentIds: [photo] }, now());
    const message = await lastMessageIn(groupId);
    const at = now();
    const shown = await reportedGroupMessageOf(db, message.id, true, { id: STAFF.id, now: at, context: 'case:case_photo_test' });
    expect(shown!.photos).toHaveLength(1);
    const src = new URL(shown!.photos![0]!.src, 'http://localhost');
    expect(src.pathname).toBe(`/api/files/${photo}`);
    expect(readStaffFileToken(src.searchParams.get('t') ?? '', at)).toMatchObject({ fileId: photo, staffUserId: STAFF.id, context: 'case:case_photo_test' });
    // Never for staff who aren't looking at a case (no link), and not for a member.
    expect((await reportedGroupMessageOf(db, message.id, true))!.photos).toBeUndefined();
    expect(await canOpen(photo, STAFF.id)).toBe(false);
  });
});
