import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EmailMessage, EmailProvider } from '@/integrations/email';
import type { FileStorage } from '@/integrations/storage';
import { notificationPreferences, privacyRequests } from '@/modules/notifications/schema';
import { sessions, users } from '@/modules/accounts/schema';
import {
  cancelAccountDeletion,
  expireDueExports,
  prepareDueExports,
  privacyViewOf,
  processDueDeletions,
  readReadyExport,
  requestAccountDeletion,
  requestDataExport,
} from '@/modules/privacy/requests';
import { bookingSeries, bookings } from '@/modules/bookings/schema';
import { supportCases } from '@/modules/support/schema';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/** Data copies and account deletion (blueprint 08 §5; completion plan 3.3). */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const cipher = fieldCipherFromEnv();
const stored = new Map<string, Buffer>();
const storage: FileStorage = {
  name: 'memory',
  put: async (key, body) => void stored.set(key, body),
  get: async (key) => stored.get(key) ?? null,
  delete: async (key) => void stored.delete(key),
};
const sent: EmailMessage[] = [];
const email: EmailProvider = { name: 'memory', send: vi.fn(async (message: EmailMessage) => void sent.push(message)) };
const deps = { storage, cipher, email, appUrl: 'http://localhost:3000' };
const DAY = 86_400_000;
const LEAVER = 'usr_tmp_leaver';

beforeAll(async () => {
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  await db.insert(users).values({ ...chris!, id: LEAVER, email: 'tmp-leaver@example.test', name: 'Lou L.', firstName: 'Lou', lastName: 'Leaver', phone: '+15125550491' });
  await db.insert(sessions).values({ id: 'ses_tmp_leaver', token: 'tok_tmp_leaver', userId: LEAVER, expiresAt: new Date('2099-01-01T00:00:00.000Z') });
  await db.insert(notificationPreferences).values({ userId: LEAVER, topic: 'tips_and_news', channel: 'email', enabled: 'true', updatedAt: new Date() });
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  await db.insert(tasks).values({ ...desk!, id: 'tsk_tmp_leaver', slug: 'tmp-leaver-desk', posterUserId: LEAVER, status: 'open', offerCount: 0 });
});

afterAll(async () => {
  await db.delete(privacyRequests).where(inArray(privacyRequests.userId, ['usr_maya', LEAVER]));
  await db.delete(supportCases).where(eq(supportCases.openedByUserId, LEAVER));
  await db.delete(auditLog).where(eq(auditLog.targetId, LEAVER));
  await db.delete(tasks).where(eq(tasks.posterUserId, LEAVER));
  await db.delete(users).where(eq(users.id, LEAVER));
  await pool.end();
});

describe('a copy of the data', () => {
  const now = new Date('2026-11-17T15:00:00.000Z');

  it('is prepared in the background, with her own details and nobody else\'s contact details', async () => {
    expect(await requestDataExport(db, 'usr_maya', now)).toEqual({ ok: true, code: 'submitted' });
    // Asking twice while it's on its way makes one.
    expect(await requestDataExport(db, 'usr_maya', now)).toEqual({ ok: true, code: 'submitted' });
    expect(await privacyViewOf(db, 'usr_maya', now)).toEqual({ export: { status: 'preparing', requestedAt: now.toISOString() } });
    expect(await readReadyExport(db, storage, 'usr_maya', now)).toBeNull();

    expect(await prepareDueExports(db, { storage, cipher }, now, { userIds: ['usr_maya'] })).toBe(1);
    const view = await privacyViewOf(db, 'usr_maya', now);
    expect(view.export).toEqual({ status: 'ready', requestedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * DAY).toISOString() });
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'privacy.export_ready'), eq(outboxEvents.aggregateId, 'usr_maya')));
    expect(event?.payload).toMatchObject({ userId: 'usr_maya' });

    const file = await readReadyExport(db, storage, 'usr_maya', now);
    expect(file?.filename).toBe('tasksnearme-data-2026-11-17.json');
    const data = JSON.parse(file!.body.toString('utf8'));
    expect(data).toMatchObject({ format: 'tasksnearme-data-export/1', account: { id: 'usr_maya', email: 'maya@example.test', firstName: 'Maya' } });
    const desk = data.tasksPosted.find((task: { id: string }) => task.id === 'tsk_desk');
    expect(desk).toMatchObject({ title: expect.stringContaining('desk'), address: { line1: '1234 Example Lane', zip: '78723' } });
    // Lee's offer, as Maya sees it in the app: his number hidden.
    const lee = data.offersReceived.find((offer: { from: string }) => offer.from.startsWith('Lee'));
    expect(lee.message).toContain('[phone hidden]');
    const text = file!.body.toString('utf8');
    expect(text).not.toContain('512-555-0134');
    expect(text).not.toContain('jordan@example.test');
    expect(text).not.toMatch(/accessToken|refreshToken|idToken|codeHash/);
  });

  it('is for its owner only, and goes after its days', async () => {
    expect(await readReadyExport(db, storage, 'usr_jordan', now)).toBeNull();
    const later = new Date(now.getTime() + 7 * DAY + 60_000);
    expect(await readReadyExport(db, storage, 'usr_maya', later)).toBeNull();
    expect(await expireDueExports(db, { storage }, later, { userIds: ['usr_maya'] })).toBe(1);
    expect([...stored.keys()].filter((key) => key.includes('usr_maya'))).toEqual([]);
    expect(await privacyViewOf(db, 'usr_maya', later)).toEqual({});
    // A new one can be asked for.
    expect(await requestDataExport(db, 'usr_maya', later)).toEqual({ ok: true, code: 'submitted' });
  });
});

describe('deleting an account', () => {
  const asked = new Date('2026-11-17T15:00:00.000Z');
  const scope = { userIds: [LEAVER] };

  it('waits a week, and can be taken back until then', async () => {
    expect(await requestAccountDeletion(db, LEAVER, asked)).toEqual({ ok: true, code: 'submitted' });
    expect((await privacyViewOf(db, LEAVER, asked)).deletion).toEqual({ requestedAt: asked.toISOString(), scheduledFor: new Date(asked.getTime() + 7 * DAY).toISOString() });
    expect(await processDueDeletions(db, deps, new Date(asked.getTime() + DAY), scope)).toEqual({ deleted: 0, waiting: 0 });
    expect(await cancelAccountDeletion(db, LEAVER, new Date(asked.getTime() + DAY))).toEqual({ ok: true, code: 'updated' });
    expect((await privacyViewOf(db, LEAVER, asked)).deletion).toBeUndefined();
    expect(await processDueDeletions(db, deps, new Date(asked.getTime() + 8 * DAY), scope)).toEqual({ deleted: 0, waiting: 0 });
  });

  it('is refused while a booking is open', async () => {
    // Chris's own booking in progress, on a copy of the desk (the seed gives him none, and other files' bookings come and go).
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [booked] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
    await db.insert(tasks).values({ ...desk!, id: 'tsk_tmp_privacy_open', slug: 'tmp-privacy-open', posterUserId: 'usr_chris', status: 'assigned', version: 1 });
    await db.insert(bookings).values({ ...booked!, id: 'bkg_tmp_privacy_open', taskId: 'tsk_tmp_privacy_open', posterUserId: 'usr_chris', status: 'in_progress' });
    expect(await requestAccountDeletion(db, 'usr_chris', asked)).toEqual({ ok: false, code: 'not_allowed' });
    await db.delete(bookings).where(eq(bookings.id, 'bkg_tmp_privacy_open'));
    await db.delete(tasks).where(eq(tasks.id, 'tsk_tmp_privacy_open'));
  });

  it('is refused while regular visits are still running', async () => {
    // Lou has an active series of visits (on their own task); ending it first keeps the helper's schedule whole.
    await db.insert(bookingSeries).values({
      id: 'srs_tmp_leaver', posterUserId: LEAVER, helperUserId: 'usr_jordan', marketId: 'mkt_austin', templateTaskId: 'tsk_tmp_leaver', proposalId: 'rbp_tmp_leaver',
      cadence: 'weekly', anchorDate: '2026-12-01', startTime: '09:00', durationMinutes: 120, pricingType: 'fixed', priceCents: 6000, scopeText: 'Weekly tidy', status: 'active',
    });
    expect(await requestAccountDeletion(db, LEAVER, asked)).toEqual({ ok: false, code: 'not_allowed' });
    await db.update(bookingSeries).set({ status: 'paused' }).where(eq(bookingSeries.id, 'srs_tmp_leaver'));
    expect(await requestAccountDeletion(db, LEAVER, asked)).toEqual({ ok: false, code: 'not_allowed' });
    await db.update(bookingSeries).set({ status: 'ended' }).where(eq(bookingSeries.id, 'srs_tmp_leaver'));
    expect(await requestAccountDeletion(db, LEAVER, asked)).toEqual({ ok: true, code: 'submitted' });
    expect(await cancelAccountDeletion(db, LEAVER, asked)).toEqual({ ok: true, code: 'updated' });
    await db.delete(bookingSeries).where(eq(bookingSeries.id, 'srs_tmp_leaver'));
  });

  it('waits for an open case, then anonymizes the account', async () => {
    expect(await requestAccountDeletion(db, LEAVER, asked)).toEqual({ ok: true, code: 'submitted' });
    await db.insert(supportCases).values({ id: 'case_tmp_leaver', type: 'request', status: 'open', openedByUserId: LEAVER, topic: 'account', description: 'A question first.' });
    const due = new Date(asked.getTime() + 8 * DAY);
    expect(await processDueDeletions(db, deps, due, scope)).toEqual({ deleted: 0, waiting: 1 });
    expect((await privacyViewOf(db, LEAVER, due)).deletion?.waitingFor).toBe('open_case');

    await db.update(supportCases).set({ status: 'closed' }).where(eq(supportCases.id, 'case_tmp_leaver'));
    expect(await processDueDeletions(db, deps, due, scope)).toEqual({ deleted: 1, waiting: 0 });

    const [gone] = await db.select().from(users).where(eq(users.id, LEAVER));
    expect(gone).toMatchObject({ name: 'Deleted user', email: `deleted+${LEAVER}@deleted.invalid`, phone: null, phoneVerifiedAt: null, status: 'deleted' });
    expect(await db.select().from(sessions).where(eq(sessions.userId, LEAVER))).toEqual([]);
    expect(await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, LEAVER))).toEqual([]);
    const [task] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, 'tsk_tmp_leaver'));
    expect(task?.status).toBe('canceled');
    const [request] = await db.select().from(privacyRequests).where(and(eq(privacyRequests.userId, LEAVER), eq(privacyRequests.status, 'done')));
    expect(request?.completedAt).toEqual(due);
    expect((await db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.targetId, LEAVER))).map((row) => row.action)).toContain('account.deleted');
    // A last email at the old address.
    expect(sent.map((message) => [message.to, message.subject])).toEqual([['tmp-leaver@example.test', 'Your TasksNearMe account was deleted']]);
    // Once.
    expect(await processDueDeletions(db, deps, due, scope)).toEqual({ deleted: 0, waiting: 0 });
  });
});
