import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INSTANT_ALERTS_PER_DAY, SAVED_SEARCH_MAX, routes } from '@/contracts';
import { blocks } from '@/modules/messaging/schema';
import { notifications } from '@/modules/notifications/schema';
import { savedSearches } from '@/modules/searches/schema';
import {
  createSavedSearch,
  getEditSavedSearchPage,
  getSavedSearchesPage,
  instantSearchMatches,
  parseBoardAddress,
  parseSavedSearchAddress,
  runSavedSearchDigests,
  savedSearchHref,
  setSavedSearchAlert,
  updateSavedSearch,
} from '@/modules/searches/service';
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
    // A task staff hid before the dispatch alerts nobody (sweep SS4).
    await db.update(tasks).set({ hiddenAt: now }).where(eq(tasks.id, taskId));
    try {
      expect(await instantSearchMatches(db, taskId, now)).toEqual([]);
    } finally {
      await db.update(tasks).set({ hiddenAt: null }).where(eq(tasks.id, taskId));
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

describe('saved from find work, and edited (sweep SS5)', () => {
  const jordan = 'usr_jordan';
  beforeAll(async () => {
    await db.delete(savedSearches).where(eq(savedSearches.userId, jordan));
  });
  afterAll(async () => {
    await db.delete(savedSearches).where(eq(savedSearches.userId, jordan));
  });

  it('reads find work addresses, without paging, sorting or the saved-tasks view', () => {
    expect(parseSavedSearchAddress('/app/find-work?category=moving-help&distance=within_5_mi&page=2&saved=1&sort=newest&view=map')).toMatchObject({ source: 'find_work', params: { category: 'moving-help', distance: 'within_5_mi' } });
    expect(parseSavedSearchAddress('/app/find-work?category=moving-help&saved=1')?.params).toEqual({ category: 'moving-help' });
    expect(parseSavedSearchAddress('/es/app/find-work?distance=far')?.params).toEqual({});
    expect(parseSavedSearchAddress('/app/find-work/tsk_desk')).toBeNull();
    // A board view has no distance.
    expect(parseBoardAddress('/austin/tasks?distance=within_2_mi')?.params).toEqual({});
    expect(parseSavedSearchAddress('/austin/tasks?time=morning')).toMatchObject({ source: 'board', marketSlug: 'austin' });
  });

  it('saves from find work, opens there, and alerts within its distance only', async () => {
    expect(await createSavedSearch(db, jordan, { from: '/app/find-work?category=furniture-assembly&distance=within_2_mi', name: 'Furniture near me', alert: 'instant' }, now)).toMatchObject({ ok: true, code: 'saved' });
    const [saved] = (await getSavedSearchesPage(db, jordan, now)).searches;
    expect(saved).toMatchObject({ source: 'find_work', marketName: 'Austin', filters: { category: 'furniture-assembly', distance: 'within_2_mi' } });
    expect(saved!.href).toBe(routes.app.findWork({ category: 'furniture-assembly', distance: 'within_2_mi' }));
    expect(await savedSearchHref(db, jordan, saved!.id)).toBe(saved!.href);
    const [before] = await db.select({ lat: tasks.publicLat, lng: tasks.publicLng }).from(tasks).where(eq(tasks.id, taskId));
    try {
      // Jordan's area is East Austin: a task there fits; one in Circle C, about 11 miles off, doesn't.
      await db.update(tasks).set({ publicLat: 30.264, publicLng: -97.722 }).where(eq(tasks.id, taskId));
      expect((await instantSearchMatches(db, taskId, now)).some((match) => match.userId === jordan)).toBe(true);
      await db.update(tasks).set({ publicLat: 30.186, publicLng: -97.885 }).where(eq(tasks.id, taskId));
      expect((await instantSearchMatches(db, taskId, now)).some((match) => match.userId === jordan)).toBe(false);
    } finally {
      await db.update(tasks).set({ publicLat: before!.lat, publicLng: before!.lng }).where(eq(tasks.id, taskId));
    }
  });

  it("renames it, changes its alerts and filters through the view's own address, and refuses what doesn't add up", async () => {
    const [search] = await db.select().from(savedSearches).where(eq(savedSearches.userId, jordan));
    const filters = { category: 'moving-help' as const, type: 'desk', areas: ['mueller', 'not-a-place'], when: 'this_week' as const, times: ['evening' as const], remoteOnly: false, few: true, distance: 'within_10_mi' as const };
    expect(await updateSavedSearch(db, jordan, { id: search!.id, name: 'Moves this week', alert: 'daily', filters: { ...filters, minPrice: 80, maxPrice: 40 } }, now)).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { 'filters.maxPrice': ['out_of_range'] } });
    expect(await updateSavedSearch(db, ana, { id: search!.id, name: 'Not mine', alert: 'off', filters }, now)).toEqual({ ok: false, code: 'not_found' });
    expect(await updateSavedSearch(db, jordan, { id: search!.id, name: 'Moves this week', alert: 'daily', filters: { ...filters, minPrice: 40 } }, now)).toEqual({ ok: true, code: 'saved', redirectTo: routes.app.savedSearches() });
    const [row] = await db.select().from(savedSearches).where(eq(savedSearches.id, search!.id));
    // The type was furniture's: it goes with the category. The unknown neighborhood is left out.
    expect(row).toMatchObject({ name: 'Moves this week', alert: 'daily', source: 'find_work', params: { category: 'moving-help', area: 'mueller', when: 'this_week', time: 'evening', few: '1', min: '40', distance: 'within_10_mi' } });
    expect(row!.params.type).toBeUndefined();
    expect(row!.lastDigestAt?.getTime()).toBe(now.getTime());
    const page = await getEditSavedSearchPage(db, jordan, search!.id, now);
    expect(page).toMatchObject({ name: 'Moves this week', alert: 'daily', source: 'find_work', values: { category: 'moving-help', areas: ['mueller'], when: 'this_week', times: ['evening'], few: true, minPrice: 40, distance: 'within_10_mi' } });
    expect(page?.options.areas.map((area) => area.slug)).toContain('mueller');
    expect(page?.options.categories.find((category) => category.slug === 'furniture-assembly')?.types).toContain('desk');
    expect(await getEditSavedSearchPage(db, ana, search!.id, now)).toBeNull();
  });
});
