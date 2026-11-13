import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { REPEAT_PLACE_PREFIX, type ExactAddress } from '@/contracts';
import { deskDraft, movingDraft } from '@/fixtures';
import { createFakeGeocoder } from '@/integrations/geocoding';
import { users } from '@/modules/accounts/schema';
import { createTaskPosting, nextRepeatSchedule } from '@/modules/tasks/posting';
import { taskLocations, tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createFieldCipher } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * "Post again" (completion plan 4.2): a finished task becomes a new draft (everything but photos, the same
 * window on the next date that fits, the saved address); posting it reuses the stored address without the
 * address provider; once the retention timer deleted that address, the draft asks for it again and an old
 * reference can't post. Only the poster's own finished tasks repeat.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
// Tuesday, Nov 17, 2026, 9:00 am in Austin.
const NOW = new Date('2026-11-17T15:00:00.000Z');
const cipher = createFieldCipher(Buffer.alloc(32, 7).toString('base64'));
const posting = createTaskPosting({ db, geocoder: createFakeGeocoder(), cipher, now: () => NOW });
const POSTER = 'usr_post_again';
const OTHER = 'usr_post_again_other';
const created: string[] = [];

async function newPoster(id: string) {
  await db.insert(users).values({
    id,
    email: `${id}@example.test`,
    name: 'Test P.',
    firstName: 'Test',
    lastName: 'Poster',
    createdAt: new Date(NOW.getTime() - 90 * 86_400_000),
    phone: `+1512555${String(Math.floor(1000 + Math.random() * 8999))}`,
    phoneVerifiedAt: NOW,
    adultAttestedAt: NOW,
    termsAcceptedAt: NOW,
  });
}

/** Posts the desk, then makes it last Saturday's completed task (10:00–1:00 on Nov 14). */
async function finishedDesk(): Promise<string> {
  const outcome = await posting.post(POSTER, { ...deskDraft, photoIds: [] });
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.result));
  created.push(outcome.taskId);
  await db
    .update(tasks)
    .set({ status: 'completed', windowStart: new Date('2026-11-14T16:00:00.000Z'), windowEnd: new Date('2026-11-14T19:00:00.000Z') })
    .where(eq(tasks.id, outcome.taskId));
  return outcome.taskId;
}

afterAll(async () => {
  const locations = created.length ? await db.select({ id: tasks.locationId }).from(tasks).where(inArray(tasks.id, created)) : [];
  if (created.length) {
    await db.delete(auditLog).where(inArray(auditLog.targetId, created));
    await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, created));
    await db.delete(tasks).where(inArray(tasks.id, created));
  }
  const locationIds = locations.map((row) => row.id).filter((id): id is string => Boolean(id));
  if (locationIds.length) await db.delete(taskLocations).where(inArray(taskLocations.id, locationIds));
  await db.delete(users).where(inArray(users.id, [POSTER, OTHER]));
  await pool.end();
});

describe('Post again', () => {
  it('turns a finished task into a draft: everything but photos, next Saturday, the saved address', async () => {
    await newPoster(POSTER);
    await newPoster(OTHER);
    const taskId = await finishedDesk();
    const repeat = await posting.repeat(POSTER, taskId);
    expect(repeat).not.toBeNull();
    expect(repeat!.fromTitle).toBe(deskDraft.title);
    expect(repeat!.addressDeleted).toBeUndefined();
    expect(repeat!.draft).toMatchObject({
      categorySlug: deskDraft.categorySlug,
      title: deskDraft.title,
      description: deskDraft.description,
      details: deskDraft.details,
      photoIds: [],
      budget: deskDraft.budget,
      // The same window, on the next Saturday the rules allow.
      schedule: { date: '2026-11-21', flexible: false, startTime: '10:00', endTime: '13:00' },
      location: { mode: 'local', placeId: `${REPEAT_PLACE_PREFIX}${taskId}`, unit: 'Apt 2B', accessNotes: 'Buzz 2B at the side gate.' },
    });
    expect(repeat!.address).toMatchObject({ placeId: `${REPEAT_PLACE_PREFIX}${taskId}`, line1: '1234 Example Lane', line2: 'Austin, TX 78723', areaName: 'Mueller', inServiceArea: true });
  });

  it('posts the repeat with the stored address (no provider lookup), as a new open task', async () => {
    const taskId = created[0]!;
    const repeat = await posting.repeat(POSTER, taskId);
    const outcome = await posting.post(POSTER, { ...repeat!.draft, location: { ...repeat!.draft.location, unit: 'Apt 3C' } });
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.result));
    created.push(outcome.taskId);
    const [source, copy] = await Promise.all(
      [taskId, outcome.taskId].map(async (id) => {
        const [row] = await db.select({ task: tasks, location: taskLocations }).from(tasks).innerJoin(taskLocations, eq(taskLocations.id, tasks.locationId)).where(eq(tasks.id, id));
        return row!;
      }),
    );
    expect(copy.task.status).toBe('open');
    expect(copy.task.title).toBe(source.task.title);
    expect(copy.task.publicAreaId).toBe(source.task.publicAreaId);
    expect(copy.location.id).not.toBe(source.location.id);
    expect(copy.location.areaId).toBe(source.location.areaId);
    const address = JSON.parse(cipher.decrypt(copy.location.addressEnc)) as ExactAddress;
    expect(address).toEqual({ line1: '1234 Example Lane', line2: 'Apt 3C', city: 'Austin', state: 'TX', zip: '78723', accessNotes: 'Buzz 2B at the side gate.' });
  });

  it('asks for the address again once the retention timer deleted it, and an old reference no longer posts', async () => {
    const taskId = await finishedDesk();
    const [row] = await db.select({ locationId: tasks.locationId }).from(tasks).where(eq(tasks.id, taskId));
    await db.update(taskLocations).set({ addressEnc: '', deletedAt: NOW }).where(eq(taskLocations.id, row!.locationId!));

    const repeat = await posting.repeat(POSTER, taskId);
    expect(repeat?.addressDeleted).toBe(true);
    expect(repeat?.address).toBeUndefined();
    expect(repeat?.draft.location).toEqual({ mode: 'local', placeId: '' });

    const stale = await posting.post(POSTER, { ...repeat!.draft, location: { mode: 'local', placeId: `${REPEAT_PLACE_PREFIX}${taskId}` } });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.result).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { 'location.placeId': ['invalid'] } });
  });

  it("repeats only the poster's own finished tasks, and never someone else's address", async () => {
    const mine = created[0]!;
    expect(await posting.repeat(OTHER, mine)).toBeNull();
    const other = await posting.post(OTHER, { ...deskDraft, photoIds: [], location: { mode: 'local', placeId: `${REPEAT_PLACE_PREFIX}${mine}` } });
    expect(other.ok).toBe(false);
    // An open task isn't repeated (its page offers other actions).
    const open = await posting.post(POSTER, { ...movingDraft, categorySlug: movingDraft.categorySlug });
    if (!open.ok) throw new Error(JSON.stringify(open.result));
    created.push(open.taskId);
    expect(await posting.repeat(POSTER, open.taskId)).toBeNull();
  });

  it('keeps a flexible day flexible, and falls back to the soonest allowed date when the weekday is too far', () => {
    const rules = { minLeadHours: 2, maxLeadDays: 3 };
    // A flexible Saturday, repeated on a Tuesday morning with only 3 days allowed: the soonest day (today).
    expect(nextRepeatSchedule({ windowStart: new Date('2026-11-14T06:00:00.000Z'), windowEnd: new Date('2026-11-15T05:59:00.000Z'), flexible: true }, rules, NOW)).toEqual({ date: '2026-11-17', flexible: true });
    // A Wednesday 10–12 window within reach: tomorrow.
    expect(nextRepeatSchedule({ windowStart: new Date('2026-11-11T16:00:00.000Z'), windowEnd: new Date('2026-11-11T18:00:00.000Z'), flexible: false }, rules, NOW)).toEqual({ date: '2026-11-18', flexible: false, startTime: '10:00', endTime: '12:00' });
  });
});
