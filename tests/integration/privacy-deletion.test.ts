import { and, eq, gte, inArray, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BillingProvider } from '@/integrations/billing';
import type { EmailMessage, EmailProvider } from '@/integrations/email';
import type { FileStorage } from '@/integrations/storage';
import { passkeys, sessions, users } from '@/modules/accounts/schema';
import { billingCustomers } from '@/modules/billing/schema';
import { forgetBillingCustomerOf } from '@/modules/billing/service';
import { clientSummary } from '@/modules/bookings/people';
import { bookings, bookingTerms } from '@/modules/bookings/schema';
import { invites } from '@/modules/invites/schema';
import { notificationDeliveries, notifications, privacyRequests, pushSubscriptions } from '@/modules/notifications/schema';
import { dispatchNotifications } from '@/modules/notifications/service';
import { offers } from '@/modules/offers/schema';
import { prepareDueExports, processDueDeletions, readReadyExport, requestAccountDeletion, requestDataExport } from '@/modules/privacy/requests';
import { readZip } from '@/modules/privacy/zip';
import { rebookProposals } from '@/modules/rebook/schema';
import { getHelperProfile, getHelperSummaries } from '@/modules/profiles/queries';
import { reviews } from '@/modules/reviews/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { userBadges } from '@/modules/badges/schema';
import { savedSearches } from '@/modules/searches/schema';
import { waitlistEntries } from '@/modules/marketing/schema';
import { addressVerifications, backgroundChecks } from '@/modules/verification/schema';
import { files, taskLocations, taskPhotos, tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { cacheTagInvalidations } from '@/platform/cache/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * The privacy rehearsal (2026-11-21, J-PR1 onward): a client and a helper with full histories ask for a copy of their
 * data and then delete their accounts. The copy is in the person's language, with where they're signed in and their
 * devices, and never a token or key. The deletion takes their personal data (photos, addresses, sign-ins, devices,
 * saved searches, notifications and what was sent for them), ends every open request either way, leaves the booking
 * that happened, expires the cached pages they were on, and nobody tells a deleted account anything again. One
 * deletion that fails is tried again next run without holding up the ones behind it. This file's own people
 * (pr-*@example.test, 555 numbers); seeded rows are only copied.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const cipher = fieldCipherFromEnv();
const stored = new Map<string, Buffer>();
const failOnce = new Set<string>();
const storage: FileStorage = {
  name: 'memory',
  put: async (key, body) => void stored.set(key, body),
  get: async (key) => stored.get(key) ?? null,
  delete: async (key) => {
    if (failOnce.delete(key)) throw new Error('storage is down');
    stored.delete(key);
  },
};
const sent: EmailMessage[] = [];
const email: EmailProvider = { name: 'memory', send: vi.fn(async (message: EmailMessage) => void sent.push(message)) };
// Plain arrays, not mocks: vitest clears mocks' calls before each test, and the deletions run in an earlier one.
const canceledInvitations: string[] = [];
const deps = { storage, cipher, email, appUrl: 'http://localhost:3000', background: { cancelInvitations: async (ref: string) => void canceledInvitations.push(ref) } };
const DAY = 86_400_000;

const CLIENT = 'usr_pr_client';
const HELPER = 'usr_pr_helper';
const OTHER = 'usr_pr_other';
const FAILER = 'usr_pr_failer';
const ids = [CLIENT, HELPER, OTHER, FAILER];
const asked = new Date('2026-11-21T15:00:00.000Z');
const due = new Date(asked.getTime() + 8 * DAY);
const scope = { userIds: ids };
const startedAt = Date.now();

async function photo(id: string, owner: string, taskId?: string) {
  await storage.put(`task_photo/${id}.jpg`, Buffer.from('jpeg'), 'image/jpeg');
  await db.insert(files).values({ id, ownerUserId: owner, kind: 'task_photo', storageKey: `task_photo/${id}.jpg`, contentType: 'image/jpeg', width: 800, height: 600, bytes: 4 });
  if (taskId) await db.insert(taskPhotos).values({ taskId, fileId: id, position: 0 });
}

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [place] = await db.select().from(taskLocations).where(eq(taskLocations.id, desk!.locationId!));
  const [offer] = await db.select().from(offers).where(eq(offers.taskId, 'tsk_desk')).limit(1);
  const [tv] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [terms] = await db.select({ breakdown: bookingTerms.breakdown }).from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv')).limit(1);

  const person = (base: typeof maya, id: string, first: string, last: string, extra: Partial<typeof users.$inferInsert> = {}) => ({
    ...base!, id, email: `${id.replace('usr_', '').replace(/_/g, '-')}@example.test`, firstName: first, lastName: last, name: `${first} ${last[0]}.`, phone: null, phoneVerifiedAt: null, homeMarketId: 'mkt_austin', ...extra,
  });
  await db.insert(users).values([
    person(maya, CLIENT, 'Paula', 'Reyes', { locale: 'es', phone: '+13525550141' }),
    person(jordan, HELPER, 'Pat', 'Hale', { phone: '+13525550142' }),
    person(maya, OTHER, 'Omar', 'Ortiz'),
    person(maya, FAILER, 'Fay', 'Lin'),
  ]);
  await db.insert(helperProfiles).values({ ...profile!, userId: HELPER, handle: 'pr-helper', foundingNumber: null, completedCount: 1, idVerifiedAt: asked.toISOString(), backgroundCheckedAt: asked.toISOString(), addressVerifiedAt: asked.toISOString() });
  await db.insert(userBadges).values({ id: 'ubg_pr_helper', userId: HELPER, code: 'tasks_completed', tier: 1, tierEarnedAt: asked });

  // Paula: signed in on a laptop, a passkey, a phone that gets her notifications, a saved search with alerts.
  await db.insert(sessions).values({ id: 'ses_pr_client', token: 'tok_pr_client_secret', userId: CLIENT, ipAddress: '203.0.113.7', userAgent: 'Firefox on Linux', expiresAt: new Date('2099-01-01T00:00:00.000Z') });
  await db.insert(passkeys).values({ id: 'pk_pr_client', name: 'Mi teléfono', publicKey: 'pk_pr_public_key_secret', userId: CLIENT, credentialID: 'cred_pr_client', counter: 0, deviceType: 'multiDevice', backedUp: true, createdAt: asked });
  await db.insert(pushSubscriptions).values({ id: 'psh_pr_client', userId: CLIENT, endpoint: 'https://push.example.test/pr-client-endpoint', p256dh: 'p256dh_pr', auth: 'auth_pr_secret', userAgent: 'Chrome on Android' });
  await db.insert(savedSearches).values({ id: 'srch_pr_client', userId: CLIENT, marketId: 'mkt_austin', name: 'Escritorios', source: 'board', params: { q: 'desk' }, alert: 'instant' });
  // Her customer for a plan (the stand-in's here; Stripe's is checked on its own below).
  await db.insert(billingCustomers).values({ userId: CLIENT, provider: 'dev', providerCustomerId: 'devcus_usr_pr_client' });
  // Her bell, and the email sent for it.
  await db.insert(notifications).values({ id: 'ntf_pr_client', userId: CLIENT, type: 'offer_received', title: 'Desk', actorName: 'Pat H.', target: { kind: 'new_task' }, sourceEventId: 'evt_pr_client_seed' });
  await db.insert(notificationDeliveries).values({ id: 'ndl_pr_client', notificationId: 'ntf_pr_client', userId: CLIENT, channel: 'email', status: 'sent', sentAt: asked });

  // Her tasks: one open (with a photo of her home, at her address, and Pat's offer with a phone number in it), one
  // that was booked and done, an old canceled one nobody booked, and the draft of a request to Pat.
  await db.insert(taskLocations).values({ ...place!, id: 'loc_pr_client', ownerUserId: CLIENT, deletedAt: null });
  const task = (id: string, status: string, extra: Partial<typeof tasks.$inferInsert> = {}) => ({ ...desk!, id, slug: id.replace(/_/g, '-'), posterUserId: CLIENT, locationId: 'loc_pr_client', status, offerCount: 0, requestKey: null, ...extra });
  await db.insert(tasks).values([
    task('tsk_pr_open', 'open', { offerCount: 1 }),
    task('tsk_pr_booked', 'completed', { description: 'Mount the TV in the living room.' }),
    task('tsk_pr_old', 'canceled', { title: 'Old desk', description: 'Old desk by the park, the gate code is 4417.' }),
    task('tsk_pr_request', 'draft'),
    { ...task('tsk_pr_other', 'draft'), posterUserId: OTHER },
  ]);
  await photo('fil_pr_client_home', CLIENT, 'tsk_pr_open');
  await db.insert(offers).values({ ...offer!, id: 'ofr_pr_helper', taskId: 'tsk_pr_open', helperUserId: HELPER, status: 'pending', message: 'Happy to help! Text me at 352-555-0199.' });
  await db.insert(bookings).values({ ...tv!, id: 'bkg_pr_done', taskId: 'tsk_pr_booked', posterUserId: CLIENT, helperUserId: HELPER, offerId: null, status: 'completed', completedAt: asked });
  // Open requests either way: hers to Pat, and Omar's to Pat, which Pat countered.
  const request = { pricingType: 'fixed', priceCents: 6000, startAt: new Date(due.getTime() + 3 * DAY), breakdown: terms!.breakdown, expiresAt: new Date(due.getTime() + DAY) };
  await db.insert(invites).values([
    { ...request, id: 'inv_pr_sent', taskId: 'tsk_pr_request', posterUserId: CLIENT, helperUserId: HELPER, status: 'sent' },
    { ...request, id: 'inv_pr_countered', taskId: 'tsk_pr_other', posterUserId: OTHER, helperUserId: HELPER, status: 'countered', counterPriceCents: 7000 },
  ]);
  // Pat offered to do her TV job again; the proposal waits for her.
  await db.insert(rebookProposals).values({ id: 'rbp_pr_tv', helperUserId: HELPER, posterUserId: CLIENT, fromBookingId: 'bkg_pr_done', status: 'sent', startAt: request.startAt, pricingType: 'fixed', priceCents: 6000, breakdown: terms!.breakdown, expiresAt: request.expiresAt });
  // Pat's verified home address and a background check invitation he never opened; Fay's address, with no booking.
  await db.insert(addressVerifications).values([
    { id: 'adr_pr_helper', userId: HELPER, status: 'verified', addressCiphertext: cipher.encrypt(JSON.stringify({ line1: '5 Hale Ct', city: 'Austin', state: 'TX', zip: '78723' })), submittedAt: asked, decidedAt: asked },
    { id: 'adr_pr_failer', userId: FAILER, status: 'verified', addressCiphertext: cipher.encrypt(JSON.stringify({ line1: '7 Lin Rd', city: 'Austin', state: 'TX', zip: '78723' })), submittedAt: asked, decidedAt: asked },
  ]);
  await db.insert(backgroundChecks).values({ id: 'bgc_pr_helper', userId: HELPER, provider: 'checkr', providerRef: 'cand_pr_helper', status: 'invited', invitationExpiresAt: new Date(due.getTime() + DAY), createdAt: asked, updatedAt: asked });
  // Paula changed her email once and added a passkey (both audited), and joined the waitlist before signing up.
  await db.insert(auditLog).values([
    { id: 'aud_pr_email', actorId: CLIENT, actorRole: 'user', action: 'account.email_changed', targetType: 'user', targetId: CLIENT, metadata: { previousEmail: 'paula.old@example.test', newEmail: 'pr-client@example.test' }, ip: '203.0.113.7' },
    { id: 'aud_pr_passkey', actorId: CLIENT, actorRole: 'user', action: 'account.passkey_added', targetType: 'user', targetId: CLIENT, metadata: { name: 'Mi teléfono' }, ip: '203.0.113.7' },
  ]);
  await db.insert(waitlistEntries).values({ id: 'wle_pr_client', email: 'pr-client@example.test', zip: '78723', interest: 'need_help', locale: 'es' });
  // Fay's photo is the one storage fails to delete the first time.
  await db.insert(tasks).values({ ...task('tsk_pr_failer', 'canceled'), posterUserId: FAILER, locationId: null });
  await photo('fil_pr_failer', FAILER, 'tsk_pr_failer');
});

afterAll(async () => {
  const mine = await db.select({ id: notifications.id }).from(notifications).where(inArray(notifications.userId, ids));
  if (mine.length) await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.notificationId, mine.map((row) => row.id)));
  await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.userId, ids));
  await db.delete(notifications).where(inArray(notifications.userId, ids));
  await db.delete(invites).where(or(inArray(invites.posterUserId, ids), inArray(invites.helperUserId, ids)));
  await db.delete(rebookProposals).where(eq(rebookProposals.id, 'rbp_pr_tv'));
  await db.delete(bookings).where(eq(bookings.id, 'bkg_pr_done'));
  await db.delete(offers).where(eq(offers.id, 'ofr_pr_helper'));
  await db.delete(taskPhotos).where(inArray(taskPhotos.fileId, ['fil_pr_client_home', 'fil_pr_failer']));
  await db.delete(files).where(inArray(files.ownerUserId, ids));
  await db.delete(tasks).where(inArray(tasks.posterUserId, ids));
  await db.delete(taskLocations).where(inArray(taskLocations.ownerUserId, ids));
  await db.delete(sessions).where(inArray(sessions.userId, ids));
  await db.delete(passkeys).where(inArray(passkeys.userId, ids));
  await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.userId, ids));
  await db.delete(savedSearches).where(inArray(savedSearches.userId, ids));
  await db.delete(addressVerifications).where(inArray(addressVerifications.userId, ids));
  await db.delete(backgroundChecks).where(inArray(backgroundChecks.userId, ids));
  await db.delete(waitlistEntries).where(eq(waitlistEntries.id, 'wle_pr_client'));
  await db.delete(billingCustomers).where(inArray(billingCustomers.userId, ids));
  await db.delete(privacyRequests).where(inArray(privacyRequests.userId, ids));
  await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, [...ids, 'tsk_pr_open', 'ofr_pr_helper', 'inv_pr_sent', 'inv_pr_countered', 'rbp_pr_tv']));
  await db.delete(auditLog).where(inArray(auditLog.targetId, ids));
  await db.delete(userBadges).where(inArray(userBadges.userId, ids));
  await db.delete(helperProfiles).where(inArray(helperProfiles.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
  await pool.end();
});

describe('the privacy rehearsal: a copy of the data, then deleting the account (J-PR)', () => {
  it('gives her a copy in her language, with where she is signed in and her devices, and never a token or key', async () => {
    expect(await requestDataExport(db, CLIENT, asked)).toEqual({ ok: true, code: 'submitted' });
    expect(await prepareDueExports(db, { storage, cipher }, asked, { userIds: [CLIENT] })).toBe(1);
    const file = await readReadyExport(db, storage, CLIENT, asked);
    expect(file?.filename).toBe('tasksnearme-data-2026-11-21.zip');
    const zip = readZip(file!.body);
    const text = zip.get('tasksnearme-data-2026-11-21.json')!.toString('utf8');
    const data = JSON.parse(text);
    // The photo of her home comes with it, listed in the JSON (J-PR10); nobody else's files do.
    expect([...zip.keys()]).toEqual(['tasksnearme-data-2026-11-21.json', 'photos/tasks/fil_pr_client_home.jpg']);
    expect(zip.get('photos/tasks/fil_pr_client_home.jpg')?.toString()).toBe('jpeg');
    expect(data.photos).toEqual([{ file: 'photos/tasks/fil_pr_client_home.jpg', kind: 'tasks', task: expect.any(String), addedAt: expect.any(String) }]);
    expect(data.about).toContain('Los documentos de identidad no se incluyen');
    expect(data.about).toMatch(/^Todo lo vinculado a tu cuenta de TasksNearMe/);
    expect(data.account).toMatchObject({ id: CLIENT, firstName: 'Paula', lastName: 'Reyes', language: 'es', homeCity: 'Austin, TX', phone: '+13525550141' });
    expect(data.account.signInMethods[0].method).toBe('código por correo');
    expect(data.signedIn).toEqual([expect.objectContaining({ browser: 'Firefox on Linux', ip: '203.0.113.7' })]);
    expect(data.passkeys).toEqual([{ name: 'Mi teléfono', device: 'multiDevice', backedUp: true, addedAt: asked.toISOString() }]);
    expect(data.notificationDevices).toEqual([expect.objectContaining({ browser: 'Chrome on Android' })]);
    expect(data.savedSearches).toEqual([expect.objectContaining({ name: 'Escritorios', alerts: 'instant' })]);
    // Pat's offer as she sees it in the app: his number hidden, in Spanish; Pat by display name only.
    expect(data.offersReceived).toEqual([expect.objectContaining({ from: 'Pat H.', message: 'Happy to help! Text me at [teléfono oculto].' })]);
    expect(data.bookings).toEqual([expect.objectContaining({ id: 'bkg_pr_done', role: 'client', with: 'Pat H.', status: 'completed' })]);
    expect(data.invites).toEqual([expect.objectContaining({ role: 'client', with: 'Pat H.', status: 'sent' })]);
    expect(data.tasksPosted.find((row: { id: string }) => row.id === 'tsk_pr_open').address).toMatchObject({ line1: expect.any(String) });
    // No sign-in token, passkey key, push endpoint or secret, and nothing of Pat's but his display name.
    for (const secret of ['tok_pr_client_secret', 'pk_pr_public_key_secret', 'pr-client-endpoint', 'auth_pr_secret', 'cred_pr_client', '352-555-0199', 'pr-helper@example.test', 'Hale', '+13525550142']) {
      expect(text).not.toContain(secret);
    }
  });

  it('tries a deletion that fails again next run, without holding up the ones behind it (J-PR1)', async () => {
    expect(await requestAccountDeletion(db, FAILER, new Date(asked.getTime() - 60_000))).toEqual({ ok: true, code: 'submitted' });
    expect(await requestAccountDeletion(db, CLIENT, asked)).toEqual({ ok: true, code: 'submitted' });
    // Pat asks a moment after Paula, so her request to him is hers to cancel (his deletion would decline it).
    expect(await requestAccountDeletion(db, HELPER, new Date(asked.getTime() + 1_000))).toEqual({ ok: true, code: 'submitted' });
    failOnce.add('task_photo/fil_pr_failer.jpg');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await processDueDeletions(db, deps, due, scope)).toEqual({ deleted: 2, waiting: 0 });
    expect(logged).toHaveBeenCalledWith(`[privacy] deleting ${FAILER} failed; trying again next run`, 'storage is down');
    logged.mockRestore();
    // Fay's account is whole (her photo's row and file are still there), so the next run does it all.
    const [fay] = await db.select({ status: users.status, email: users.email }).from(users).where(eq(users.id, FAILER));
    expect(fay).toEqual({ status: 'active', email: 'pr-failer@example.test' });
    expect(await db.select({ id: files.id }).from(files).where(eq(files.ownerUserId, FAILER))).toEqual([{ id: 'fil_pr_failer' }]);
    expect(await processDueDeletions(db, deps, due, scope)).toEqual({ deleted: 1, waiting: 0 });
    expect((await db.select({ status: users.status }).from(users).where(eq(users.id, FAILER)))[0]?.status).toBe('deleted');
    expect(stored.has('task_photo/fil_pr_failer.jpg')).toBe(false);
    expect(await db.select().from(files).where(eq(files.ownerUserId, FAILER))).toEqual([]);
  });

  it('takes her personal data: name, contacts, sign-ins, devices, photos, addresses, searches and notifications (J-PR3)', async () => {
    const [paula] = await db.select().from(users).where(eq(users.id, CLIENT));
    expect(paula).toMatchObject({ name: 'Deleted account', firstName: 'Deleted', lastName: 'Account', email: `deleted+${CLIENT}@deleted.invalid`, phone: null, status: 'deleted' });
    const left = await Promise.all([
      db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, CLIENT)),
      db.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.userId, CLIENT)),
      db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, CLIENT)),
      db.select({ id: savedSearches.id }).from(savedSearches).where(eq(savedSearches.userId, CLIENT)),
      db.select({ id: notifications.id }).from(notifications).where(eq(notifications.userId, CLIENT)),
      db.select({ id: notificationDeliveries.id }).from(notificationDeliveries).where(eq(notificationDeliveries.userId, CLIENT)),
    ]);
    expect(left).toEqual([[], [], [], [], [], []]);
    expect(await db.select().from(billingCustomers).where(eq(billingCustomers.userId, CLIENT))).toEqual([]);
    // The photo of her home: its link to the task, its row and its file.
    expect(await db.select().from(taskPhotos).where(eq(taskPhotos.fileId, 'fil_pr_client_home'))).toEqual([]);
    expect(await db.select().from(files).where(eq(files.ownerUserId, CLIENT))).toEqual([]);
    expect([...stored.keys()].filter((key) => key.includes('pr_client'))).toEqual([]);
    // Her address: emptied now, not 180 days after her last booking.
    expect(await db.select({ addressEnc: taskLocations.addressEnc }).from(taskLocations).where(eq(taskLocations.ownerUserId, CLIENT))).toEqual([{ addressEnc: '' }]);
    // Her open task closed; the old one nobody booked lost its description, and its search text with it.
    const rows = await db.select({ id: tasks.id, status: tasks.status, description: tasks.description, searchText: tasks.searchText }).from(tasks).where(eq(tasks.posterUserId, CLIENT));
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get('tsk_pr_open')?.status).toBe('canceled');
    expect(byId.get('tsk_pr_old')).toMatchObject({ description: '', searchText: expect.not.stringContaining('4417') });
    // The booking that happened stays for Pat's records and the law, with the task's words as agreed.
    expect(byId.get('tsk_pr_booked')?.description).toBe('Mount the TV in the living room.');
    expect((await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, 'bkg_pr_done')))[0]?.status).toBe('completed');
    // The goodbye email went to her old address, in Spanish.
    expect(sent.filter((message) => message.to === 'pr-client@example.test').map((message) => message.subject)).toEqual(['Se eliminó tu cuenta de TasksNearMe']);
    // Her ready copy went with the account.
    expect([...stored.keys()].filter((key) => key.includes(CLIENT))).toEqual([]);
  });

  it('ends every open request either way, and the helper leaves the public lists (J-PR3)', async () => {
    const requests = await db.select({ id: invites.id, status: invites.status }).from(invites).where(inArray(invites.id, ['inv_pr_sent', 'inv_pr_countered']));
    expect(new Map(requests.map((row) => [row.id, row.status]))).toEqual(new Map([['inv_pr_sent', 'canceled'], ['inv_pr_countered', 'declined']]));
    expect((await db.select({ status: rebookProposals.status }).from(rebookProposals).where(eq(rebookProposals.id, 'rbp_pr_tv')))[0]?.status).toBe('declined');
    // The drafts the requests made are closed too.
    expect((await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, 'tsk_pr_other')))[0]?.status).toBe('canceled');
    const [pat] = await db
      .select({ handle: helperProfiles.handle, status: helperProfiles.status, bio: helperProfiles.bio, homeZip: helperProfiles.homeZip, idVerifiedAt: helperProfiles.idVerifiedAt, backgroundCheckedAt: helperProfiles.backgroundCheckedAt, addressVerifiedAt: helperProfiles.addressVerifiedAt })
      .from(helperProfiles)
      .where(eq(helperProfiles.userId, HELPER));
    expect(pat).toEqual({ handle: `deleted-${HELPER}`, status: 'paused', bio: '', homeZip: null, idVerifiedAt: null, backgroundCheckedAt: null, addressVerifiedAt: null });
    // No trust or achievement badges on his card where others still see it (J-PR16).
    expect(await db.select().from(userBadges).where(eq(userBadges.userId, HELPER))).toEqual([]);
    // Omar's copy names Pat as a deleted account, in Omar's language.
    expect(await requestDataExport(db, OTHER, due)).toEqual({ ok: true, code: 'submitted' });
    expect(await prepareDueExports(db, { storage, cipher }, due, { userIds: [OTHER] })).toBe(1);
    const copy = readZip((await readReadyExport(db, storage, OTHER, due))!.body);
    const data = JSON.parse([...copy.values()][0]!.toString('utf8'));
    expect(data.invites).toEqual([expect.objectContaining({ with: 'Deleted account', status: 'declined' })]);
  });

  it("keeps a verified home address with bookings behind it, deletes one without, and cancels a waiting background check (J-PR11, J-PR12)", async () => {
    const kept = await db.select({ id: addressVerifications.id, address: addressVerifications.addressCiphertext }).from(addressVerifications).where(inArray(addressVerifications.id, ['adr_pr_helper', 'adr_pr_failer']));
    expect(new Map(kept.map((row) => [row.id, row.address !== null]))).toEqual(new Map([['adr_pr_helper', true], ['adr_pr_failer', false]]));
    expect(canceledInvitations).toEqual(['cand_pr_helper']);
    expect((await db.select({ status: backgroundChecks.status }).from(backgroundChecks).where(eq(backgroundChecks.id, 'bgc_pr_helper')))[0]?.status).toBe('canceled');
  });

  it('shows them to others as "Deleted account", flagged so nothing links to the profile that\'s gone (J-PR15)', async () => {
    // In the reader's language on a page; English here, with no page in reach.
    expect(await clientSummary(db, CLIENT)).toMatchObject({ displayName: 'Deleted account', initials: 'DA', deleted: true });
    expect((await getHelperSummaries([HELPER], db)).get(HELPER)).toMatchObject({ displayName: 'Deleted account', initials: 'DA', deleted: true });
    // Everyone else is as they were.
    expect((await clientSummary(db, 'usr_maya'))?.deleted).toBeUndefined();
    // A review she wrote stays on the helper's profile, flagged, so the page names her in its own language (J-PR15 b):
    // Chris's seeded review of Sam, lent to her for the check.
    await db.update(reviews).set({ authorUserId: CLIENT }).where(eq(reviews.id, 'rev_seed_2'));
    try {
      const review = (await getHelperProfile('sam-k', db))?.reviews.find((row) => row.id === 'rev_seed_2');
      expect(review?.author).toEqual({ displayName: 'Deleted account', initials: 'DA', deleted: true });
    } finally {
      await db.update(reviews).set({ authorUserId: 'usr_chris' }).where(eq(reviews.id, 'rev_seed_2'));
    }
  });

  it('leaves her audit rows ids and what happened, not her contact details, and takes her waitlist entry (J-PR13)', async () => {
    const rows = await db.select({ id: auditLog.id, action: auditLog.action, metadata: auditLog.metadata, ip: auditLog.ip }).from(auditLog).where(eq(auditLog.targetId, CLIENT));
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get('aud_pr_email')).toMatchObject({ metadata: {}, ip: null });
    expect(byId.get('aud_pr_passkey')).toMatchObject({ metadata: {}, ip: null });
    expect(rows.find((row) => row.action === 'account.deleted')?.metadata).toEqual({ at: due.toISOString() });
    expect(JSON.stringify(rows)).not.toMatch(/paula\.old|pr-client@|Mi teléfono|203\.0\.113/);
    expect(await db.select().from(waitlistEntries).where(eq(waitlistEntries.id, 'wle_pr_client'))).toEqual([]);
  });

  it('expires the cached pages they were on: the helper lists, the old profile, the tasks and the city (J-PR4)', async () => {
    const tags = await db
      .select({ tag: cacheTagInvalidations.tag })
      .from(cacheTagInvalidations)
      .where(and(inArray(cacheTagInvalidations.tag, ['tasks', 'helpers', 'helper:pr-helper', 'market:austin']), gte(cacheTagInvalidations.expiredAt, startedAt)));
    expect(tags.map((row) => row.tag).sort()).toEqual(['helper:pr-helper', 'helpers', 'market:austin', 'tasks']);
  });

  it("deletes the plans' Stripe customer too, once its plans ended, and keeps it when Stripe isn't there to ask (J-PR9)", async () => {
    await db.insert(billingCustomers).values({ userId: OTHER, provider: 'stripe', providerCustomerId: 'cus_pr_other' });
    // A server without Stripe's keys can't delete it there: the row stays for one that can.
    await forgetBillingCustomerOf(db, { name: 'dev' } as BillingProvider, OTHER);
    expect(await db.select({ id: billingCustomers.providerCustomerId }).from(billingCustomers).where(eq(billingCustomers.userId, OTHER))).toEqual([{ id: 'cus_pr_other' }]);
    const forgetCustomer = vi.fn(async () => undefined);
    await forgetBillingCustomerOf(db, { name: 'stripe', forgetCustomer } as unknown as BillingProvider, OTHER);
    expect(forgetCustomer).toHaveBeenCalledExactlyOnceWith('cus_pr_other');
    expect(await db.select().from(billingCustomers).where(eq(billingCustomers.userId, OTHER))).toEqual([]);
  });

  it('tells a deleted account nothing again (J-PR5)', async () => {
    await db.insert(outboxEvents).values({ id: 'evt_pr_after', type: 'privacy.export_ready', aggregateType: 'user', aggregateId: CLIENT, payload: { userId: CLIENT, requestId: 'prv_pr_after', expiresAt: due.toISOString() } });
    // Dispatch takes the oldest events first (200 a run): again until this one is done, whatever other files left.
    for (let run = 0; run < 10; run += 1) {
      const [event] = await db.select({ dispatchedAt: outboxEvents.dispatchedAt }).from(outboxEvents).where(eq(outboxEvents.id, 'evt_pr_after'));
      if (event?.dispatchedAt) break;
      await dispatchNotifications(db, due);
    }
    expect((await db.select({ dispatchedAt: outboxEvents.dispatchedAt }).from(outboxEvents).where(eq(outboxEvents.id, 'evt_pr_after')))[0]?.dispatchedAt).toBeTruthy();
    expect(await db.select().from(notifications).where(eq(notifications.userId, CLIENT))).toEqual([]);
  });
});
