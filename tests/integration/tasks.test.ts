import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { deskDraft, movingDraft, remoteHelpDraft } from '@/fixtures';
import { createFakeGeocoder } from '@/integrations/geocoding';
import { users } from '@/modules/accounts/schema';
import { areas } from '@/modules/markets/schema';
import { createTaskPosting } from '@/modules/tasks/posting';
import { findPublicTask, listBoardTasks, listRecentOpenTasks } from '@/modules/tasks/queries';
import { files, taskLocations, taskPhotos, tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createFieldCipher } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

// Tuesday, Nov 17, 2026, 9:00 am in Austin (the fixtures' "now").
const NOW = new Date('2026-11-17T15:00:00.000Z');
const cipher = createFieldCipher(Buffer.alloc(32, 3).toString('base64'));
const posting = createTaskPosting({ db, geocoder: createFakeGeocoder(), cipher, now: () => NOW });
const defaultQuery = { when: 'any', remoteOnly: false, sort: 'soonest', page: 1 } as const;
const noPhotos = { ...deskDraft, photoIds: [] };
const posted: Record<string, string> = {};

async function newPoster(id: string, options: { daysOld?: number; phone?: boolean } = {}) {
  await db.insert(users).values({
    id,
    email: `${id}@example.test`,
    name: 'Test P.',
    firstName: 'Test',
    lastName: 'Poster',
    // Posts in Austin, with the test world's addresses (new accounts start in the default market).
    homeMarketId: 'mkt_austin',
    createdAt: new Date(NOW.getTime() - (options.daysOld ?? 90) * 86_400_000),
    phone: options.phone === false ? null : `+1512555${String(Math.floor(1000 + Math.random() * 8999))}`,
    phoneVerifiedAt: options.phone === false ? null : NOW,
    adultAttestedAt: NOW,
    termsAcceptedAt: NOW,
  });
  return id;
}

describe('posting a task', () => {
  it('posts the desk: open, public area only, exact address encrypted', async () => {
    await db.insert(files).values({
      id: 'ph_box',
      ownerUserId: 'usr_maya',
      kind: 'task_photo',
      storageKey: 'test/ph_box.webp',
      contentType: 'image/webp',
      width: 800,
      height: 600,
      bytes: 1000,
    });
    const outcome = await posting.post('usr_maya', deskDraft);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.result));
    posted.desk = outcome.taskId;
    expect(outcome.slug).toMatch(/^assemble-a-desk-flat-pack-1-item-mueller-[0-9a-f]{4}$/);

    const [task] = await db.select().from(tasks).where(eq(tasks.id, outcome.taskId));
    const [mueller] = await db.select().from(areas).where(eq(areas.slug, 'mueller'));
    expect(task).toMatchObject({
      status: 'open',
      mode: 'local',
      pricingType: 'fixed',
      budgetCents: 6000,
      publicAreaId: mueller!.id,
      windowStart: new Date('2026-11-21T16:00:00.000Z'),
      windowEnd: new Date('2026-11-21T19:00:00.000Z'),
    });

    const [location] = await db.select().from(taskLocations).where(eq(taskLocations.id, task!.locationId!));
    expect(location!.addressEnc).not.toContain('Example');
    expect(JSON.parse(cipher.decrypt(location!.addressEnc))).toEqual({
      line1: '1234 Example Lane',
      line2: 'Apt 2B',
      city: 'Austin',
      state: 'TX',
      zip: '78723',
      accessNotes: 'Buzz 2B at the side gate.',
    });

    const photos = await db.select().from(taskPhotos).where(eq(taskPhotos.taskId, outcome.taskId));
    expect(photos).toEqual([{ taskId: outcome.taskId, fileId: 'ph_box', position: 0 }]);
    // Someone else's photo can't be attached.
    const stolen = await posting.post('usr_chris', { ...movingDraft, photoIds: ['ph_box'] });
    expect(stolen).toEqual({ ok: false, result: { ok: false, code: 'validation_failed', fieldErrors: { photoIds: ['invalid'] } } });

    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, outcome.taskId));
    expect(events.map((e) => e.type)).toEqual(['task.posted']);
    const audit = await db.select().from(auditLog).where(eq(auditLog.targetId, outcome.taskId));
    expect(audit.map((a) => a.action)).toEqual(['task.posted']);

    // Public reads: the area, never the address, the access notes, or the last name.
    const found = await findPublicTask(db, outcome.slug, NOW);
    expect(found?.acceptingOffers).toBe(true);
    expect(found?.task.location).toMatchObject({ kind: 'local', areaName: 'Mueller' });
    const json = JSON.stringify(found);
    for (const secret of ['1234', 'Example Lane', 'Buzz', 'Apt 2B', 'Rivera']) expect(json).not.toContain(secret);
  });

  it('posts hourly and remote tasks', async () => {
    const moving = await posting.post('usr_chris', movingDraft);
    const remote = await posting.post('usr_ruth', remoteHelpDraft);
    expect(moving.ok && remote.ok).toBe(true);
    if (!remote.ok || !moving.ok) return;
    posted.moving = moving.taskId;
    posted.remote = remote.taskId;
    const [task] = await db.select().from(tasks).where(eq(tasks.id, remote.taskId));
    expect(task).toMatchObject({ mode: 'remote', locationId: null, publicLat: null, flexible: true });
  });

  it('starts a flexible day today at the earliest start the lead time allows, not at midnight (sweep 2026-11-20)', async () => {
    // Offers expire at the window's start: from midnight, every offer on it was dead on arrival.
    const today = await posting.post('usr_ruth', { ...remoteHelpDraft, schedule: { date: '2026-11-17', flexible: true } });
    expect(today.ok).toBe(true);
    if (!today.ok) return;
    const [task] = await db.select().from(tasks).where(eq(tasks.id, today.taskId));
    // 9:00 am in Austin plus the 3-hour lead: noon, through the end of the day.
    expect(task?.windowStart.toISOString()).toBe('2026-11-17T18:00:00.000Z');
    expect(task?.windowEnd.toISOString()).toBe('2026-11-18T05:59:00.000Z');
    await db.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, today.taskId));
  });

  it('lists open tasks on the board with filters', async () => {
    const [market] = await db.select({ id: areas.marketId }).from(areas).limit(1);
    // Every page (other tests leave open tasks of their own): the posted tasks are on the board.
    const ids: string[] = [];
    for (let page = 1; page < 20; page += 1) {
      const result = await listBoardTasks(db, { marketId: market!.id, query: { ...defaultQuery, page }, now: NOW });
      ids.push(...result.tasks.map((t) => t.id));
      if (result.tasks.length === 0 || ids.length >= result.totalCount) break;
    }
    expect(ids).toEqual(expect.arrayContaining([posted.desk, posted.moving]));

    const moving = await listBoardTasks(db, { marketId: market!.id, query: { ...defaultQuery, category: 'moving-help' }, now: NOW });
    expect(moving.tasks.every((t) => t.categorySlug === 'moving-help')).toBe(true);

    const remote = await listBoardTasks(db, { marketId: market!.id, query: { ...defaultQuery, remoteOnly: true }, now: NOW });
    expect(remote.tasks.every((t) => t.location.kind === 'remote')).toBe(true);
    expect(remote.tasks.map((t) => t.id)).toContain(posted.remote);

    const today = await listBoardTasks(db, { marketId: market!.id, query: { ...defaultQuery, when: 'today' }, now: NOW });
    expect(today.tasks.map((t) => t.id)).not.toContain(posted.desk);
    const weekend = await listBoardTasks(db, { marketId: market!.id, query: { ...defaultQuery, when: 'this_weekend' }, now: NOW });
    expect(weekend.tasks.map((t) => t.id)).toContain(posted.desk);

    // Listed until its window starts, where offers close; not while it runs (sweep 2026-11-20).
    const deskIds = async (now: Date) => {
      const found: string[] = [];
      for (let page = 1; page < 20; page += 1) {
        const result = await listBoardTasks(db, { marketId: market!.id, query: { ...defaultQuery, category: 'furniture-assembly', page }, now });
        found.push(...result.tasks.map((t) => t.id));
        if (result.tasks.length === 0 || found.length >= result.totalCount) break;
      }
      return found;
    };
    expect(await deskIds(new Date('2026-11-21T15:30:00.000Z'))).toContain(posted.desk);
    expect(await deskIds(new Date('2026-11-21T16:30:00.000Z'))).not.toContain(posted.desk);

    const recent = await listRecentOpenTasks(db, { marketId: market!.id, categorySlug: 'furniture-assembly', limit: 3, now: NOW });
    expect(recent.every((t) => t.categorySlug === 'furniture-assembly')).toBe(true);
  });

  it('refuses prohibited tasks, places outside the area, and windows that are too soon', async () => {
    const prohibited = await posting.post('usr_maya', { ...noPhotos, description: 'Assemble the desk and also rewire the light fixture above it.' });
    expect(prohibited).toEqual({ ok: false, result: { ok: false, code: 'validation_failed', fieldErrors: { description: ['prohibited'] } } });

    const waco = await posting.post('usr_maya', { ...noPhotos, location: { mode: 'local', placeId: 'plc_waco_100' } });
    expect(waco).toEqual({ ok: false, result: { ok: false, code: 'validation_failed', fieldErrors: { 'location.placeId': ['not_supported'] } } });

    const soon = await posting.post('usr_maya', {
      ...noPhotos,
      schedule: { date: '2026-11-17', flexible: false, startTime: '10:00', endTime: '11:00' },
    });
    expect(soon.ok === false && soon.result.ok === false && soon.result.fieldErrors).toEqual({ 'schedule.startTime': ['out_of_range'] });
  });

  it('needs a verified phone, and limits new accounts to 3 open tasks', async () => {
    const noPhone = await newPoster('usr_no_phone', { phone: false });
    expect(await posting.post(noPhone, noPhotos)).toEqual({ ok: false, result: { ok: false, code: 'not_allowed' } });

    const fresh = await newPoster('usr_fresh', { daysOld: 1 });
    const first = await posting.post(fresh, noPhotos);
    expect(first.ok).toBe(true);
    for (let i = 0; i < 2; i += 1) expect((await posting.post(fresh, noPhotos)).ok).toBe(true);
    expect(await posting.post(fresh, noPhotos)).toEqual({ ok: false, result: { ok: false, code: 'limit_reached' } });
    // A task whose window has ended reads as expired and no longer counts, though its row stays `open` (sweep 2026-11-20).
    if (first.ok) await db.update(tasks).set({ windowStart: new Date(NOW.getTime() - 3 * 3_600_000), windowEnd: new Date(NOW.getTime() - 3_600_000) }).where(eq(tasks.id, first.taskId));
    expect((await posting.post(fresh, noPhotos)).ok).toBe(true);
  });
});

describe('address search', () => {
  it('suggests places with their public area, and flags places outside the market', async () => {
    const lane = await posting.searchAddresses('usr_maya', 'example lane');
    expect(lane.find((s) => s.placeId === 'plc_mueller_1234')).toEqual({
      placeId: 'plc_mueller_1234',
      line1: '1234 Example Lane',
      line2: 'Austin, TX 78723',
      areaName: 'Mueller',
      // The neighborhood's own center (public), for the preview map; never the address's point.
      areaPoint: { lat: 30.2993, lng: -97.7036 },
      inServiceArea: true,
    });
    expect(await posting.searchAddresses('usr_maya', '44 sample way')).toEqual([
      // Outside our cities: where it is, for "We're not in Round Rock yet" and the city list (national, cities in turn).
      { placeId: 'plc_roundrock_44', line1: '44 Sample Way', line2: 'Round Rock, TX 78664', inServiceArea: false, outside: { city: 'Round Rock', state: 'TX', zip: '78664' } },
    ]);
    expect(await posting.searchAddresses('usr_maya', 'ex')).toEqual([]);
  });
});
