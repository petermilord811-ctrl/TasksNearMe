import { and, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { routes } from '@/contracts';
import { bookings, bookingTerms } from '@/modules/bookings/schema';
import { getHelperTaskView, submitOffer } from '@/modules/offers/helper';
import { offers } from '@/modules/offers/schema';
import { payments } from '@/modules/payments/schema';
import { getAdminAuditPage, parseAuditQuery } from '@/modules/support/staff-audit';
import { getAdminBookings } from '@/modules/support/staff-bookings';
import type { StaffActor } from '@/modules/support/staff';
import { getAdminTaskPage, moderateTask, taskModerationActions } from '@/modules/tasks/moderation';
import { findPublicTask, listRecentOpenTasks } from '@/modules/tasks/queries';
import { files, taskPhotos, tasks } from '@/modules/tasks/schema';
import { categories } from '@/modules/markets/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Staff tools, part 4 (UI-033): task moderation, the bookings list and the audit log, on throwaway copies
 * of the seeded desk task and TV booking (so other tests' data stays as it was).
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const taylor: StaffActor = { id: 'usr_taylor', roles: ['trust_safety'] };
const DAY = 86_400_000;
const now = () => new Date();
const reason = 'Asks helpers to bring cash for parts; checking with the poster.';

beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_lee'));
  const copy = (id: string, slug: string) => ({ ...desk!, id, slug, status: 'open', offerCount: 1, version: 1, hiddenAt: null, hiddenByUserId: null, hiddenReason: null });
  await db.insert(tasks).values([copy('tsk_mod', 'mod-desk-a1b2'), copy('tsk_mod2', 'mod-desk-c3d4')]);
  await db.insert(offers).values({ ...offer!, id: 'off_mod', taskId: 'tsk_mod', status: 'pending', revision: 1, expiresAt: new Date(Date.now() + DAY) });
  await db.insert(files).values({ id: 'fil_mod_photo', ownerUserId: desk!.posterUserId, kind: 'task_photo', storageKey: 'test/mod-photo.png', contentType: 'image/png', width: 800, height: 600, bytes: 1000 });
  await db.insert(taskPhotos).values({ taskId: 'tsk_mod2', fileId: 'fil_mod_photo', position: 0 });

  // Bookings that need attention, each on its own copy of the TV task (one live booking per task).
  const [tv] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [tvBooking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [tvTerms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  const [tvPayment] = await db.select().from(payments).where(eq(payments.bookingId, 'bkg_tv'));
  const booking = async (id: string, values: Partial<typeof bookings.$inferInsert>) => {
    await db.insert(tasks).values({ ...tv!, id: `tsk_${id}`, slug: `${id}-tv`, status: 'assigned' });
    await db.insert(bookings).values({ ...tvBooking!, id: `bkg_${id}`, taskId: `tsk_${id}`, ...values });
    await db.insert(bookingTerms).values({ ...tvTerms!, id: `btm_${id}_1`, bookingId: `bkg_${id}` });
  };
  await booking('mod_late', { status: 'completion_submitted', approvalDueAt: new Date(Date.now() - DAY) });
  await booking('mod_unpaid', { status: 'pending_funding', confirmedAt: null });
  await db.insert(payments).values({ ...tvPayment!, id: 'pay_mod_unpaid', bookingId: 'bkg_mod_unpaid', status: 'failed', idempotencyKey: 'test:mod_unpaid' });
  await booking('mod_held', { status: 'completed', confirmedAt: new Date(Date.now() - 30 * DAY), completedAt: new Date(Date.now() - 25 * DAY) });
});

describe('task moderation', () => {
  it('lets every staff member read a task, and only trust and safety, leads and admins moderate it', async () => {
    const page = await getAdminTaskPage(db, alex, 'tsk_mod', now());
    expect(page).toMatchObject({ task: { id: 'tsk_mod', status: 'open', offerCount: 1 }, poster: { email: 'maya@example.test' }, actions: [] });
    // Neighborhood level only.
    expect(JSON.stringify(page)).not.toMatch(/Example Lane/);
    expect((await moderateTask(db, alex, 'tsk_mod', { action: 'hide_task', reason }, now())).result).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getAdminTaskPage(db, taylor, 'tsk_mod', now()))?.actions).toEqual(['hide_task', 'close_task', 'recategorize']);
    expect(taskModerationActions(['finance'], { status: 'open', hidden: false, booked: false, photoCount: 1, otherCategories: 4 })).toEqual([]);
  });

  it('hides a task from the public pages, the feed and offers; the poster and the helper who offered still see it', async () => {
    expect(await findPublicTask(db, 'mod-desk-a1b2', now())).not.toBeNull();
    expect((await moderateTask(db, taylor, 'tsk_mod', { action: 'hide_task', reason: 'Too short' }, now())).result).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { reason: ['too_short'] } });
    expect(await moderateTask(db, taylor, 'tsk_mod', { action: 'hide_task', reason }, now())).toEqual({ result: { ok: true, code: 'updated' }, slug: 'mod-desk-a1b2', marketSlug: 'austin' });

    expect(await findPublicTask(db, 'mod-desk-a1b2', now())).toBeNull();
    const recent = await listRecentOpenTasks(db, { marketId: 'mkt_austin', limit: 200, now: now() });
    expect(recent.map((task) => task.id)).not.toContain('tsk_mod');
    // Gone for helpers who didn't offer, and no new offers; Lee still sees his own offer.
    expect(await getHelperTaskView(db, 'usr_jordan', 'tsk_mod', now())).toBeNull();
    expect(await submitOffer(db, 'usr_jordan', 'tsk_mod', { pricing: { type: 'fixed', priceCents: 6000 }, startTime: '10:00', message: 'I can do it.', brings: [] }, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getHelperTaskView(db, 'usr_lee', 'tsk_mod', now()))?.myOffer).toBeTruthy();

    const page = await getAdminTaskPage(db, morgan, 'tsk_mod', now());
    expect(page?.task.hidden).toMatchObject({ reason, by: { id: 'usr_taylor', displayName: 'Taylor B.' } });
    expect(page?.actions[0]).toBe('restore_task');
    const [logged] = await db.select().from(auditLog).where(and(eq(auditLog.targetId, 'tsk_mod'), eq(auditLog.action, 'task.hide')));
    expect(logged).toMatchObject({ actorId: 'usr_taylor', actorRole: 'trust_safety', targetType: 'task', reason });

    expect((await moderateTask(db, morgan, 'tsk_mod', { action: 'restore_task', reason: 'The poster removed the cash request.' }, now())).result).toEqual({ ok: true, code: 'updated' });
    expect(await findPublicTask(db, 'mod-desk-a1b2', now())).not.toBeNull();
  });

  it('closes an open task and declines its pending offers; a booked task stays open to its booking', async () => {
    expect((await moderateTask(db, morgan, 'tsk_mod', { action: 'close_task', reason: 'A duplicate of the same poster’s desk task.' }, now())).result).toEqual({ ok: true, code: 'updated' });
    const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_mod'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_mod'));
    expect(task?.status).toBe('canceled');
    expect(offer?.status).toBe('declined');
    const booked = await getAdminTaskPage(db, morgan, 'tsk_tv', now());
    expect(booked?.bookingId).toBe('bkg_tv');
    expect(booked?.actions).not.toContain('close_task');
  });

  it('removes a photo and moves a task to another category, with the details in the audit log', async () => {
    const page = await getAdminTaskPage(db, taylor, 'tsk_mod2', now());
    expect(page?.photos.map((photo) => photo.id)).toEqual(['fil_mod_photo']);
    expect(page?.actions).toContain('remove_photo');
    expect((await moderateTask(db, taylor, 'tsk_mod2', { action: 'remove_photo', photoId: 'fil_mod_photo', reason: 'The photo shows the street number.' }, now())).result).toEqual({ ok: true, code: 'updated' });
    expect(await db.select().from(taskPhotos).where(eq(taskPhotos.taskId, 'tsk_mod2'))).toEqual([]);
    // No longer a task photo: a new post can't attach it again (sweep 2026-11-20, PT13).
    expect((await db.select({ kind: files.kind }).from(files).where(eq(files.id, 'fil_mod_photo')))[0]?.kind).toBe('removed_task_photo');

    expect((await moderateTask(db, taylor, 'tsk_mod2', { action: 'recategorize', categorySlug: 'moving-help', reason: 'Moving furniture between rooms, not assembly.' }, now())).result).toEqual({ ok: true, code: 'updated' });
    const [moved] = await db.select({ slug: categories.slug }).from(tasks).innerJoin(categories, eq(categories.id, tasks.categoryId)).where(eq(tasks.id, 'tsk_mod2'));
    expect(moved?.slug).toBe('moving-help');
    const entries = await db.select().from(auditLog).where(eq(auditLog.targetId, 'tsk_mod2'));
    expect(entries.map((entry) => [entry.action, entry.metadata])).toEqual(
      expect.arrayContaining([
        ['task.remove_photo', { photoId: 'fil_mod_photo' }],
        ['task.recategorize', { from: 'furniture-assembly', to: 'moving-help' }],
      ]),
    );
  });
});

describe('the bookings list', () => {
  it('flags what needs attention and counts each tab for the same search', async () => {
    // Each booking by its id: the unfiltered list shows only the newest 50, and other files add bookings.
    const flagsOf = async (id: string) => (await getAdminBookings(db, { filter: 'all', query: id }, now())).rows.find((row) => row.id === id)?.flags;
    expect(await flagsOf('bkg_dresser')).toEqual(['disputed', 'open_case']);
    expect(await flagsOf('bkg_mod_late')).toEqual(['approval_overdue']);
    expect(await flagsOf('bkg_mod_unpaid')).toEqual(['payment_failed']);
    expect(await flagsOf('bkg_mod_held')).toEqual(['funds_held']);
    // Paid out three weeks ago: nothing to look at.
    expect(await flagsOf('bkg_wardrobe')).toEqual([]);

    const attention = await getAdminBookings(db, { filter: 'attention', query: '' }, now());
    expect(attention.rows.every((row) => row.flags.length > 0)).toBe(true);
    for (const id of ['bkg_dresser', 'bkg_mod_late', 'bkg_mod_unpaid', 'bkg_mod_held']) {
      expect((await getAdminBookings(db, { filter: 'attention', query: id }, now())).rows.map((row) => row.id)).toEqual([id]);
    }
    // The page shows up to 50; the count is every booking that needs attention.
    expect(attention.rows.length).toBe(Math.min(attention.counts.attention, 50));
    const upcoming = await getAdminBookings(db, { filter: 'upcoming', query: '' }, now());
    expect(upcoming.rows.map((row) => row.status).every((status) => ['pending_funding', 'confirmed', 'in_progress', 'completion_submitted'].includes(status))).toBe(true);
  });

  it('searches by booking id, task title, and a person’s name or email', async () => {
    expect((await getAdminBookings(db, { filter: 'all', query: 'bkg_tv' }, now())).rows.map((row) => row.id)).toEqual(['bkg_tv']);
    expect((await getAdminBookings(db, { filter: 'all', query: 'wardrobe' }, now())).rows.map((row) => row.id)).toContain('bkg_wardrobe');
    const ana = await getAdminBookings(db, { filter: 'all', query: 'ana@example.test' }, now());
    expect(ana.rows.length).toBeGreaterThan(0);
    expect(ana.rows.every((row) => row.client.displayName === 'Ana P.' || row.helper.displayName === 'Ana P.')).toBe(true);
    expect((await getAdminBookings(db, { filter: 'all', query: 'Jordan T' }, now())).rows.every((row) => row.helper.displayName === 'Jordan T.' || row.client.displayName === 'Jordan T.')).toBe(true);
    expect(await getAdminBookings(db, { filter: 'all', query: 'no such booking anywhere' }, now())).toMatchObject({ rows: [], counts: { attention: 0, upcoming: 0, finished: 0, all: 0 } });
  });
});

describe('the audit log', () => {
  it('is for admins and support leads only', async () => {
    expect(await getAdminAuditPage(db, alex, {}, undefined)).toBeNull();
    expect(await getAdminAuditPage(db, taylor, {}, undefined)).toBeNull();
  });

  it('filters by target and action family, newest first, with links and the staff member’s role', async () => {
    const page = await getAdminAuditPage(db, morgan, { targetType: 'task', targetId: 'tsk_mod' }, undefined);
    expect(page?.entries.map((entry) => entry.action)).toEqual(['task.close', 'task.restore', 'task.hide']);
    expect(page?.entries[2]).toMatchObject({
      actor: { kind: 'staff', staff: { displayName: 'Taylor B.' }, role: 'trust_safety' },
      target: { type: 'task', id: 'tsk_mod', href: routes.admin.task('tsk_mod') },
      reason,
    });
    const family = await getAdminAuditPage(db, morgan, { action: 'task' }, undefined);
    expect(family?.entries.every((entry) => entry.action.startsWith('task.'))).toBe(true);
    expect(family?.actionFamilies).toContain('task');
    expect(family?.targetTypes).toContain('task');
    const byActor = await getAdminAuditPage(db, morgan, { actor: 'taylor@example.test', targetId: 'tsk_mod2' }, undefined);
    expect(byActor?.entries.map((entry) => entry.action).sort()).toEqual(['task.recategorize', 'task.remove_photo']);
  });

  it('pages through older entries with the cursor', async () => {
    await db.insert(auditLog).values(Array.from({ length: 101 }, (_, index) => ({ id: `aud_page_${String(index).padStart(3, '0')}`, actorRole: 'system', action: 'test.page', targetType: 'test', targetId: 'tgt_page' })));
    const first = await getAdminAuditPage(db, morgan, { targetId: 'tgt_page' }, undefined);
    expect(first?.entries).toHaveLength(100);
    expect(first?.entries[0]).toMatchObject({ id: 'aud_page_100', actor: { kind: 'system' } });
    expect(first?.nextCursor).toBe('aud_page_001');
    const second = await getAdminAuditPage(db, morgan, { targetId: 'tgt_page' }, first?.nextCursor);
    expect(second?.entries.map((entry) => entry.id)).toEqual(['aud_page_000']);
    expect(second?.nextCursor).toBeUndefined();
    await db.delete(auditLog).where(like(auditLog.id, 'aud_page_%'));
  });

  it('reads its filters from the URL, dropping malformed dates', () => {
    expect(parseAuditQuery({ actor: ' morgan ', action: 'case', from: '2026-11-01', to: 'yesterday', before: 'aud_x' })).toEqual({ filters: { actor: 'morgan', action: 'case', from: '2026-11-01' }, before: 'aud_x' });
  });
});
