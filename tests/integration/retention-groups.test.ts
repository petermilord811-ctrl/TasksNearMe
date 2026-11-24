import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { communityEdits, neighborGroupMessages, neighborGroups } from '@/modules/community/schema';
import { sweepCommunityEdits, sweepGroupMessages } from '@/modules/privacy/retention';
import { supportCases } from '@/modules/support/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Retention of what came after the privacy rehearsal (sweep 2026-11-24 A8): building and street groups' messages go 2
 * years after the group's last message, as a conversation's do, and the earlier wording of an edited post or reply 2
 * years after the edit; neither while a case about it is open. Everyone and everything here is made for the test.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const DAY = 86_400_000;
const now = new Date();
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const AUTHOR = 'usr_tmp_retg_author';
const OLD = 'ngr_tmp_retg_old';
const RECENT = 'ngr_tmp_retg_recent';
const REPORTED = 'ngr_tmp_retg_reported';
const GROUPS = [OLD, RECENT, REPORTED];
const EDITS = ['ced_tmp_retg_old', 'ced_tmp_retg_recent', 'ced_tmp_retg_reported'];
const CASES = ['case_tmp_retg_group', 'case_tmp_retg_edit'];

async function cleanUp() {
  await db.delete(supportCases).where(inArray(supportCases.id, CASES));
  await db.delete(communityEdits).where(inArray(communityEdits.id, EDITS));
  await db.delete(neighborGroupMessages).where(inArray(neighborGroupMessages.groupId, GROUPS));
  await db.delete(neighborGroups).where(inArray(neighborGroups.id, GROUPS));
  await db.delete(users).where(eq(users.id, AUTHOR));
}

beforeAll(async () => {
  await cleanUp();
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  if (!maya) throw new Error('The seeded people are missing');
  await db.insert(users).values({ ...maya, id: AUTHOR, email: 'tmp-retg@example.test', name: 'Rae G.', firstName: 'Rae', lastName: 'Gale', phone: null, phoneVerifiedAt: null });
  const group = (id: string) => ({ id, marketId: 'mkt_austin', areaId: 'area_mueller', kind: 'street', name: `Street ${id}`, createdByUserId: AUTHOR, createdAt: ago(900) });
  await db.insert(neighborGroups).values(GROUPS.map(group));
  const message = (id: string, groupId: string, daysAgo: number, status = 'visible') => ({ id, groupId, authorUserId: AUTHOR, body: `Words ${id}`, status, createdAt: ago(daysAgo) });
  await db.insert(neighborGroupMessages).values([
    // Quiet for over 2 years: every message goes, a deleted one's words with it.
    message('ngm_tmp_retg_old_1', OLD, 800),
    message('ngm_tmp_retg_old_2', OLD, 760, 'deleted'),
    // Its last message is recent: the group's older messages stay too, as a conversation's do.
    message('ngm_tmp_retg_recent_1', RECENT, 800),
    message('ngm_tmp_retg_recent_2', RECENT, 10),
    // Old, but a case about one of them is open.
    message('ngm_tmp_retg_reported_1', REPORTED, 800),
  ]);
  await db.insert(communityEdits).values([
    { id: EDITS[0]!, targetKind: 'post', targetId: 'cpo_tmp_retg_old', editorUserId: AUTHOR, title: 'Before', body: 'Old wording', createdAt: ago(800) },
    { id: EDITS[1]!, targetKind: 'reply', targetId: 'cre_tmp_retg_recent', editorUserId: AUTHOR, title: null, body: 'Recent wording', createdAt: ago(30) },
    { id: EDITS[2]!, targetKind: 'reply', targetId: 'cre_tmp_retg_reported', editorUserId: AUTHOR, title: null, body: 'Reported wording', createdAt: ago(800) },
  ]);
  await db.insert(supportCases).values([
    { id: CASES[0]!, type: 'report_content', status: 'open', priority: 'normal', openedByUserId: 'usr_ben', subjectUserId: AUTHOR, reason: 'harassment', description: 'A group message.', context: { groupMessageId: 'ngm_tmp_retg_reported_1' } },
    { id: CASES[1]!, type: 'report_content', status: 'open', priority: 'normal', openedByUserId: 'usr_ben', subjectUserId: AUTHOR, reason: 'harassment', description: 'A reply.', context: { replyId: 'cre_tmp_retg_reported' } },
  ]);
});

afterAll(async () => {
  await cleanUp();
  await pool.end();
});

describe('retention of group messages and earlier wording', () => {
  it("deletes a group's messages 2 years after its last one, never while a case about one is open", async () => {
    expect(await sweepGroupMessages(db, now, { only: GROUPS })).toBe(2);
    const left = await db.select({ id: neighborGroupMessages.id }).from(neighborGroupMessages).where(inArray(neighborGroupMessages.groupId, GROUPS));
    expect(left.map((row) => row.id).sort()).toEqual(['ngm_tmp_retg_recent_1', 'ngm_tmp_retg_recent_2', 'ngm_tmp_retg_reported_1']);
    // Once the case closes, it goes on the next run.
    await db.update(supportCases).set({ status: 'resolved' }).where(eq(supportCases.id, CASES[0]!));
    expect(await sweepGroupMessages(db, now, { only: GROUPS })).toBe(1);
    expect(await sweepGroupMessages(db, now, { only: GROUPS })).toBe(0);
  });

  it('deletes the earlier wording of an edit 2 years after it, never while a case about that post or reply is open', async () => {
    expect(await sweepCommunityEdits(db, now, { only: EDITS })).toBe(1);
    const left = await db.select({ id: communityEdits.id }).from(communityEdits).where(inArray(communityEdits.id, EDITS));
    expect(left.map((row) => row.id).sort()).toEqual([EDITS[1], EDITS[2]].sort());
  });
});
