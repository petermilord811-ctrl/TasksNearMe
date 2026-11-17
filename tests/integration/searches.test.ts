import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INSTANT_ALERTS_PER_DAY, SAVED_SEARCH_MAX } from '@/contracts';
import { blocks } from '@/modules/messaging/schema';
import { notifications } from '@/modules/notifications/schema';
import { savedSearches } from '@/modules/searches/schema';
import { createSavedSearch, getSavedSearchesPage, instantSearchMatches, parseBoardAddress, runSavedSearchDigests, setSavedSearchAlert } from '@/modules/searches/service';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { marketLocalToUtc, marketDayKey } from '@/shared/format';

/**
 * Saved searches (completion plan 7.10) on the seeded Austin board: Ana saves "furniture in Mueller", a new desk
 * task there alerts her at once (never its poster, never across a block, at most 10 a day), and the morning
 * digest counts what's new for daily searches.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const now = new Date();
const ana = 'usr_ana';
const taskId = `tsk_ss_${Date.now().toString(36)}`;
afterAll(() => pool.end());

beforeAll(async () => {
  await db.delete(savedSearches).where(eq(savedSearches.userId, ana));
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  if (!desk) throw new Error('The seeded desk is missing');
  await db.insert(tasks).values({ ...desk, id: taskId, slug: `ss-${taskId}`, posterUserId: 'usr_chris', status: 'open', offerCount: 0, publishedAt: now, createdAt: now, updatedAt: now, version: 1 });
});

describe('saved searches', () => {
  it('reads board addresses: English or Spanish, a category hub, and nothing that isn’t a board', () => {
    expect(parseBoardAddress('/austin/tasks/furniture-assembly?area=mueller&sort=newest&page=2')).toMatchObject({ marketSlug: 'austin', params: { area: 'mueller', category: 'furniture-assembly' } });
    expect(parseBoardAddress('/es/austin/tasks?time=morning')?.params).toEqual({ time: 'morning' });
    expect(parseBoardAddress('https://evil.example/austin/tasks')).toBeNull();
    expect(parseBoardAddress('/app/account')).toBeNull();
    expect(parseBoardAddress('/austin/tasks/not-a-category')).toBeNull();
  });

  it('saves a board view, lists it with its open count, and keeps to the limit', async () => {
    expect(await createSavedSearch(db, ana, { from: '/austin/tasks/furniture-assembly?area=mueller', name: 'Furniture in Mueller', alert: 'instant' }, now)).toMatchObject({ ok: true, code: 'saved' });
    const page = await getSavedSearchesPage(db, ana, now);
    const saved = page.searches.find((search) => search.name === 'Furniture in Mueller');
    expect(saved).toMatchObject({ alert: 'instant', filters: { category: 'furniture-assembly', areaNames: ['Mueller'] } });
    expect(saved!.openCount).toBeGreaterThan(0);
    expect(saved!.href).toContain('area=mueller');
    for (let i = page.searches.length; i < SAVED_SEARCH_MAX; i += 1) await createSavedSearch(db, ana, { from: '/austin/tasks', name: `All ${i}`, alert: 'off' }, now);
    expect(await createSavedSearch(db, ana, { from: '/austin/tasks', name: 'One too many', alert: 'off' }, now)).toMatchObject({ ok: false, code: 'limit_reached' });
  });

  it('alerts at once for a new task that fits, never its poster or across a block, and caps the day', async () => {
    const matches = await instantSearchMatches(db, taskId, now);
    expect(matches.filter((match) => match.userId === ana).map((match) => match.name)).toEqual(['Furniture in Mueller']);
    await db.insert(blocks).values({ blockerId: ana, blockedId: 'usr_chris' }).onConflictDoNothing();
    try {
      expect((await instantSearchMatches(db, taskId, now)).some((match) => match.userId === ana)).toBe(false);
    } finally {
      await db.delete(blocks).where(and(eq(blocks.blockerId, ana), eq(blocks.blockedId, 'usr_chris')));
    }
    // Ten alerts already today: the eleventh waits.
    const today = new Date(marketLocalToUtc(marketDayKey(now, 'America/Chicago'), '00:10', 'America/Chicago'));
    await db.insert(notifications).values(Array.from({ length: INSTANT_ALERTS_PER_DAY }, () => ({ id: newId('ntf'), userId: ana, type: 'saved_search_match', target: { kind: 'saved_search' as const, searchId: 'x' }, sourceEventId: newId('evt'), createdAt: today > now ? now : today })));
    try {
      expect((await instantSearchMatches(db, taskId, now)).some((match) => match.userId === ana)).toBe(false);
    } finally {
      await db.delete(notifications).where(and(eq(notifications.userId, ana), eq(notifications.type, 'saved_search_match')));
    }
  });

  it('sends the morning digest once a day for daily searches with something new', async () => {
    const [search] = await db.select().from(savedSearches).where(and(eq(savedSearches.userId, ana), eq(savedSearches.name, 'Furniture in Mueller')));
    await setSavedSearchAlert(db, ana, search!.id, 'daily', now);
    // Last sent yesterday morning; it's 9 am now.
    const nine = new Date(marketLocalToUtc(marketDayKey(now, 'America/Chicago'), '09:00', 'America/Chicago'));
    await db.update(savedSearches).set({ lastDigestAt: new Date(nine.getTime() - 25 * 3_600_000) }).where(eq(savedSearches.id, search!.id));
    await db.update(tasks).set({ publishedAt: new Date(nine.getTime() - 3_600_000) }).where(eq(tasks.id, taskId));
    await runSavedSearchDigests(db, nine);
    const events = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'searches.digest'), eq(outboxEvents.aggregateId, search!.id)));
    expect(events).toHaveLength(1);
    expect((events[0]!.payload as { count: number }).count).toBeGreaterThan(0);
    // Again the same morning: nothing more.
    await runSavedSearchDigests(db, new Date(nine.getTime() + 600_000));
    expect(await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'searches.digest'), eq(outboxEvents.aggregateId, search!.id)))).toHaveLength(1);
  });
});
