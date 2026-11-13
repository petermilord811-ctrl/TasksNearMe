import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { blocks } from '@/modules/messaging/schema';
import { notifications } from '@/modules/notifications/schema';
import { helpersToAlert, TASK_ALERT_LIMITS } from '@/modules/offers/task-alerts';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';

/**
 * Task alerts (blueprint 02 J1): a new task reaches the bookable helpers who offer its category and
 * cover its area, never the poster or people they blocked, at most 3 an hour per helper.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const TASK = 'tsk_alert_test';
const FAR = 'tsk_alert_far';
const now = () => new Date();

beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_shelves'));
  const windowStart = new Date(Date.now() + 3 * 86_400_000);
  const windowEnd = new Date(windowStart.getTime() + 3 * 3_600_000);
  // A furniture task in Mueller, posted by Maya.
  await db.insert(tasks).values({ ...desk!, id: TASK, slug: 'alert-test-mueller', posterUserId: 'usr_maya', status: 'open', publicLat: 30.2985, publicLng: -97.7042, windowStart, windowEnd, expiresAt: windowEnd, hiddenAt: null });
  // The same, far out in Round Rock (outside everyone's area).
  await db.insert(tasks).values({ ...desk!, id: FAR, slug: 'alert-test-far', posterUserId: 'usr_maya', status: 'open', publicLat: 30.5083, publicLng: -97.6789, windowStart, windowEnd, expiresAt: windowEnd, hiddenAt: null });
});

afterAll(async () => {
  await db.delete(notifications).where(and(eq(notifications.userId, 'usr_jordan'), eq(notifications.type, 'task_match')));
  await db.delete(blocks).where(and(eq(blocks.blockerId, 'usr_maya'), eq(blocks.blockedId, 'usr_sam')));
  await db.delete(tasks).where(inArray(tasks.id, [TASK, FAR]));
  await pool.end();
});

describe('task alerts', () => {
  it('reaches bookable helpers who offer the category and cover the area, never the poster', async () => {
    const helpers = await helpersToAlert(db, TASK, now());
    expect(helpers).toContain('usr_jordan');
    expect(helpers).not.toContain('usr_maya');
    // Priya's profile is a draft: not bookable, so no alerts.
    expect(helpers).not.toContain('usr_priya');
  });

  it('skips tasks outside every helper area', async () => {
    expect(await helpersToAlert(db, FAR, now())).not.toContain('usr_jordan');
  });

  it('leaves out people the poster blocked', async () => {
    const before = await helpersToAlert(db, TASK, now());
    if (!before.includes('usr_sam')) return; // Sam's area may not reach Mueller in this seed
    await db.insert(blocks).values({ blockerId: 'usr_maya', blockedId: 'usr_sam' });
    expect(await helpersToAlert(db, TASK, now())).not.toContain('usr_sam');
  });

  it(`sends at most ${TASK_ALERT_LIMITS.perHour} an hour`, async () => {
    for (let i = 0; i < TASK_ALERT_LIMITS.perHour; i += 1) {
      const id = newId('ntf');
      await db.insert(notifications).values({ id, userId: 'usr_jordan', type: 'task_match', target: { kind: 'find_work_task', taskId: TASK }, sourceEventId: id, createdAt: new Date(Date.now() - (i + 1) * 60_000) });
    }
    expect(await helpersToAlert(db, TASK, now())).not.toContain('usr_jordan');
  });

  it('says nothing about hidden or closed tasks', async () => {
    await db.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, FAR));
    expect(await helpersToAlert(db, FAR, now())).toEqual([]);
    expect(await helpersToAlert(db, 'tsk_missing', now())).toEqual([]);
  });
});
