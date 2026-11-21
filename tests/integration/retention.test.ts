import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FileStorage } from '@/integrations/storage';
import { bookingCompletionPhotos, bookingSeries, bookings } from '@/modules/bookings/schema';
import { messages, threads } from '@/modules/messaging/schema';
import { users } from '@/modules/accounts/schema';
import { addressDeleted, RETENTION_RULES, sweepAddresses, sweepAudit, sweepCompletionFiles, sweepDeletedAccountAddresses, sweepMessages, sweepTaskPhotos } from '@/modules/privacy/retention';
import { readExactAddress } from '@/modules/tasks/locations';
import { files, taskLocations, taskPhotos, tasks } from '@/modules/tasks/schema';
import { addressVerifications } from '@/modules/verification/schema';
import { auditLog } from '@/platform/audit/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';

/** Retention timers (blueprint 08 §5; completion plan 3.4), on throwaway rows only. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const cipher = fieldCipherFromEnv();
const stored = new Map<string, Buffer>();
const storage: FileStorage = { name: 'memory', put: async (key, body) => void stored.set(key, body), get: async (key) => stored.get(key) ?? null, delete: async (key) => void stored.delete(key) };
const DAY = 86_400_000;
const now = new Date();
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const OLD = 'loc_tmp_ret_old';
const RECENT = 'loc_tmp_ret_recent';
const OPEN = 'loc_tmp_ret_open';
const address = { line1: '9 Retention Way', city: 'Austin', state: 'TX', zip: '78723' };
const GONE = ['usr_tmp_ret_gone_old', 'usr_tmp_ret_gone_recent', 'usr_tmp_ret_gone_banned'];

beforeAll(async () => {
  const [deskTask] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [deskLocation] = await db.select().from(taskLocations).where(eq(taskLocations.id, deskTask!.locationId!));
  const [booking] = await db.select().from(bookings).limit(1);
  const location = (id: string) => ({ ...deskLocation!, id, addressEnc: cipher.encrypt(JSON.stringify(address)), createdAt: ago(400), deletedAt: null });
  await db.insert(taskLocations).values([location(OLD), location(RECENT), location(OPEN)]);
  const task = (id: string, locationId: string, status: string, updatedDaysAgo: number) => ({ ...deskTask!, id, slug: `${id}-slug`, locationId, status, createdAt: ago(400), updatedAt: ago(updatedDaysAgo) });
  await db.insert(tasks).values([task('tsk_tmp_ret_old', OLD, 'completed', 250), task('tsk_tmp_ret_recent', RECENT, 'completed', 250), task('tsk_tmp_ret_open', OPEN, 'open', 300), task('tsk_tmp_ret_files', OLD, 'completed', 800)]);
  const done = (id: string, taskId: string, daysAgo: number) => ({ ...booking!, id, taskId, status: 'completed', startAt: ago(daysAgo), completedAt: ago(daysAgo), updatedAt: ago(daysAgo), createdAt: ago(daysAgo + 1) });
  // The old place: last booked 250 days ago. The recent one: booked again 30 days ago.
  await db.insert(bookings).values([done('bkg_tmp_ret_old', 'tsk_tmp_ret_old', 250), done('bkg_tmp_ret_recent', 'tsk_tmp_ret_recent', 30), done('bkg_tmp_ret_files', 'tsk_tmp_ret_files', 800)]);
  await db.insert(files).values({ id: 'fil_tmp_ret_photo', ownerUserId: booking!.helperUserId, kind: 'evidence', storageKey: 'completion/tmp-ret.webp', contentType: 'image/webp', width: 1, height: 1, bytes: 4 });
  stored.set('completion/tmp-ret.webp', Buffer.from('webp'));
  await db.insert(bookingCompletionPhotos).values({ bookingId: 'bkg_tmp_ret_files', fileId: 'fil_tmp_ret_photo', position: 0 });
  await db.insert(threads).values([{ id: 'thr_tmp_ret_old', kind: 'booking', linkedId: 'bkg_tmp_ret_files', taskId: 'tsk_tmp_ret_old', createdAt: ago(900), lastMessageAt: ago(800) }, { id: 'thr_tmp_ret_new', kind: 'booking', linkedId: 'bkg_tmp_ret_recent', taskId: 'tsk_tmp_ret_recent', createdAt: ago(40), lastMessageAt: ago(30) }]);
  await db.insert(messages).values([
    { id: 'msg_tmp_ret_old', threadId: 'thr_tmp_ret_old', senderUserId: booking!.posterUserId, kind: 'text', body: 'Long ago.', createdAt: ago(800) },
    { id: 'msg_tmp_ret_new', threadId: 'thr_tmp_ret_new', senderUserId: booking!.posterUserId, kind: 'text', body: 'Last month.', createdAt: ago(30) },
  ]);
  // Task photos: on the task closed 800 days ago, on the one booked again last month, and two never posted (800 and 30
  // days old).
  const photo = (id: string, daysAgo: number) => ({ id, ownerUserId: booking!.posterUserId, kind: 'task_photo', storageKey: `task_photo/${id}.webp`, contentType: 'image/webp', width: 1, height: 1, bytes: 4, createdAt: ago(daysAgo) });
  await db.insert(files).values([photo('fil_tmp_ret_home_old', 800), photo('fil_tmp_ret_home_recent', 800), photo('fil_tmp_ret_unposted_old', 800), photo('fil_tmp_ret_unposted_new', 30)]);
  for (const id of ['fil_tmp_ret_home_old', 'fil_tmp_ret_home_recent', 'fil_tmp_ret_unposted_old', 'fil_tmp_ret_unposted_new']) stored.set(`task_photo/${id}.webp`, Buffer.from('webp'));
  await db.insert(taskPhotos).values([{ taskId: 'tsk_tmp_ret_files', fileId: 'fil_tmp_ret_home_old', position: 0 }, { taskId: 'tsk_tmp_ret_recent', fileId: 'fil_tmp_ret_home_recent', position: 0 }]);
  // Deleted accounts with a verified home address: last booked 800 days ago, last booked 30 days ago, and banned.
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  await db.insert(users).values(GONE.map((id) => ({ ...chris!, id, email: `deleted+${id}@deleted.invalid`, name: 'Deleted account', phone: null, phoneVerifiedAt: null, status: 'deleted' })));
  await db.insert(addressVerifications).values(GONE.map((id) => ({ id: `adr_${id}`, userId: id, status: 'verified', addressCiphertext: cipher.encrypt(JSON.stringify(address)), submittedAt: ago(900), decidedAt: ago(900), createdAt: ago(900) })));
  const ended = (id: string, helperUserId: string, daysAgo: number) => ({ ...booking!, id, taskId: 'tsk_tmp_ret_open', helperUserId, status: 'canceled', startAt: ago(daysAgo), canceledAt: ago(daysAgo), completedAt: null, updatedAt: ago(daysAgo), createdAt: ago(daysAgo + 1) });
  await db.insert(bookings).values([ended('bkg_tmp_ret_gone_old', GONE[0]!, 800), ended('bkg_tmp_ret_gone_recent', GONE[1]!, 30), ended('bkg_tmp_ret_gone_banned', GONE[2]!, 800)]);
  await db.insert(auditLog).values([
    { id: 'aud_tmp_ret_gone_banned', actorRole: 'system', action: 'account.deleted', targetType: 'user', targetId: GONE[2]!, metadata: { at: ago(700).toISOString(), banned: true } },
    { id: 'aud_tmp_ret_old', actorRole: 'system', action: 'tmp.retention', targetType: 'test', targetId: 'tmp_ret', at: ago(8 * 365).toISOString() },
    { id: 'aud_tmp_ret_new', actorRole: 'system', action: 'tmp.retention', targetType: 'test', targetId: 'tmp_ret', at: ago(30).toISOString() },
  ]);
});

afterAll(async () => {
  await db.delete(taskPhotos).where(inArray(taskPhotos.fileId, ['fil_tmp_ret_home_old', 'fil_tmp_ret_home_recent']));
  await db.delete(files).where(inArray(files.id, ['fil_tmp_ret_home_old', 'fil_tmp_ret_home_recent', 'fil_tmp_ret_unposted_old', 'fil_tmp_ret_unposted_new']));
  await db.delete(bookings).where(inArray(bookings.id, ['bkg_tmp_ret_gone_old', 'bkg_tmp_ret_gone_recent', 'bkg_tmp_ret_gone_banned']));
  await db.delete(addressVerifications).where(inArray(addressVerifications.userId, GONE));
  await db.delete(auditLog).where(inArray(auditLog.targetId, GONE));
  await db.delete(users).where(inArray(users.id, GONE));
  await db.delete(messages).where(inArray(messages.threadId, ['thr_tmp_ret_old', 'thr_tmp_ret_new']));
  await db.delete(threads).where(inArray(threads.id, ['thr_tmp_ret_old', 'thr_tmp_ret_new']));
  await db.delete(bookingCompletionPhotos).where(eq(bookingCompletionPhotos.bookingId, 'bkg_tmp_ret_files'));
  await db.delete(files).where(eq(files.id, 'fil_tmp_ret_photo'));
  await db.delete(bookings).where(inArray(bookings.id, ['bkg_tmp_ret_old', 'bkg_tmp_ret_recent', 'bkg_tmp_ret_files']));
  await db.delete(tasks).where(inArray(tasks.id, ['tsk_tmp_ret_old', 'tsk_tmp_ret_recent', 'tsk_tmp_ret_open', 'tsk_tmp_ret_files']));
  await db.delete(taskLocations).where(inArray(taskLocations.id, [OLD, RECENT, OPEN]));
  await db.delete(auditLog).where(eq(auditLog.targetId, 'tmp_ret'));
  await pool.end();
});

describe('retention timers', () => {
  it(`deletes an exact address ${RETENTION_RULES.addressDays} days after the last booking there, never one still in use`, async () => {
    expect(await sweepAddresses(db, now, { only: [OLD, RECENT, OPEN] })).toBe(1);
    expect(await addressDeleted(db, OLD)).toBe(true);
    expect(await addressDeleted(db, RECENT)).toBe(false);
    expect(await addressDeleted(db, OPEN)).toBe(false);
    // Readers treat it as gone.
    const [row] = await db.select().from(taskLocations).where(eq(taskLocations.id, OLD));
    expect(readExactAddress(cipher, row!.addressEnc)).toBeUndefined();
    expect(await sweepAddresses(db, now, { only: [OLD, RECENT, OPEN] })).toBe(0);
  });

  it('keeps an address while its regular visits are active or paused', async () => {
    // A place last booked 250 days ago, but the template of a running series.
    const [deskTask] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [deskLocation] = await db.select().from(taskLocations).where(eq(taskLocations.id, deskTask!.locationId!));
    await db.insert(taskLocations).values({ ...deskLocation!, id: 'loc_tmp_ret_series', addressEnc: cipher.encrypt(JSON.stringify(address)), createdAt: ago(400), deletedAt: null });
    await db.insert(tasks).values({ ...deskTask!, id: 'tsk_tmp_ret_series', slug: 'tsk-tmp-ret-series', locationId: 'loc_tmp_ret_series', status: 'completed', createdAt: ago(400), updatedAt: ago(250) });
    await db.insert(bookingSeries).values({
      id: 'srs_tmp_ret', posterUserId: deskTask!.posterUserId, helperUserId: 'usr_jordan', marketId: deskTask!.marketId, templateTaskId: 'tsk_tmp_ret_series', proposalId: 'rbp_tmp_ret',
      cadence: 'monthly', anchorDate: '2026-01-05', startTime: '09:00', durationMinutes: 120, pricingType: 'fixed', priceCents: 6000, scopeText: 'Monthly tidy', status: 'paused',
    });
    expect(await sweepAddresses(db, now, { only: ['loc_tmp_ret_series'] })).toBe(0);
    await db.update(bookingSeries).set({ status: 'ended' }).where(eq(bookingSeries.id, 'srs_tmp_ret'));
    expect(await sweepAddresses(db, now, { only: ['loc_tmp_ret_series'] })).toBe(1);
    await db.delete(bookingSeries).where(eq(bookingSeries.id, 'srs_tmp_ret'));
    await db.delete(tasks).where(eq(tasks.id, 'tsk_tmp_ret_series'));
    await db.delete(taskLocations).where(eq(taskLocations.id, 'loc_tmp_ret_series'));
  });

  it(`deletes a conversation's messages ${RETENTION_RULES.messageYears} years after its last one`, async () => {
    expect(await sweepMessages(db, { storage }, now, { only: ['thr_tmp_ret_old', 'thr_tmp_ret_new'] })).toBe(1);
    expect((await db.select({ id: messages.id }).from(messages).where(inArray(messages.threadId, ['thr_tmp_ret_old', 'thr_tmp_ret_new']))).map((row) => row.id)).toEqual(['msg_tmp_ret_new']);
  });

  it(`deletes completion photos ${RETENTION_RULES.completionFileYears} years after the booking`, async () => {
    expect(await sweepCompletionFiles(db, { storage }, now, { only: ['bkg_tmp_ret_files', 'bkg_tmp_ret_recent'] })).toBe(1);
    expect(stored.has('completion/tmp-ret.webp')).toBe(false);
    expect(await db.select().from(files).where(eq(files.id, 'fil_tmp_ret_photo'))).toEqual([]);
  });

  it(`deletes task photos ${RETENTION_RULES.taskPhotoYears} years after the task closed, and uploads never posted as long after`, async () => {
    const ids = ['fil_tmp_ret_home_old', 'fil_tmp_ret_home_recent', 'fil_tmp_ret_unposted_old', 'fil_tmp_ret_unposted_new'];
    expect(await sweepTaskPhotos(db, { storage }, now, { only: ids })).toBe(2);
    expect((await db.select({ id: files.id }).from(files).where(inArray(files.id, ids))).map((row) => row.id).sort()).toEqual(['fil_tmp_ret_home_recent', 'fil_tmp_ret_unposted_new']);
    expect(stored.has('task_photo/fil_tmp_ret_home_old.webp')).toBe(false);
    expect(await db.select().from(taskPhotos).where(eq(taskPhotos.fileId, 'fil_tmp_ret_home_old'))).toEqual([]);
  });

  it(`deletes a deleted account's verified home address ${RETENTION_RULES.deletedAccountAddressYears} years after its last booking; a banned one's stays`, async () => {
    expect(await sweepDeletedAccountAddresses(db, now, { only: GONE })).toBe(1);
    const rows = await db.select({ userId: addressVerifications.userId, kept: addressVerifications.addressCiphertext }).from(addressVerifications).where(inArray(addressVerifications.userId, GONE));
    expect(new Map(rows.map((row) => [row.userId, row.kept !== null]))).toEqual(new Map([[GONE[0], false], [GONE[1], true], [GONE[2], true]]));
  });

  it(`deletes audit entries after ${RETENTION_RULES.auditYears} years`, async () => {
    await sweepAudit(db, now);
    expect((await db.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.targetId, 'tmp_ret'))).map((row) => row.id)).toEqual(['aud_tmp_ret_new']);
  });
});
