import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FileStorage } from '@/integrations/storage';
import { createDevPaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { methodForChoice } from '@/modules/bookings/confirm';
import { addCard } from '@/modules/earnings/service';
import { blocks } from '@/modules/messaging/schema';
import { paymentMethods, payments } from '@/modules/payments/schema';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import { anonymizeAccount } from '@/modules/privacy/requests';
import { BLOCK_EVASION_REASON, flagBlockEvasion } from '@/modules/trust/card-fingerprints';
import { auditLog } from '@/platform/audit/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';

/**
 * Cards and accounts (abuse rehearsal J-AB4, ab's decision): a card's provider fingerprint is kept on saved cards and
 * payments. A card a banned account used is refused to anyone else, at adding it and at paying, neutrally; reaching
 * someone who blocked another account on the same card opens a case for staff, once, and does nothing else. This
 * file's own people (cf-*@example.test).
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const dev = createDevPaymentProvider();
const now = new Date();
const PEOPLE = { banned: 'usr_cf_banned', newcomer: 'usr_cf_newcomer', blocked: 'usr_cf_blocked', returner: 'usr_cf_returner', blocker: 'usr_cf_blocker', stranger: 'usr_cf_stranger', gone: 'usr_cf_gone', next: 'usr_cf_next' } as const;
const ids = Object.values(PEOPLE);
/** What the stand-in gives `owner` for its test card: the same id a banned account's row carries in these tests. */
const fingerprintFor = (owner: string) => dev.collectDevCard!('success', owner).fingerprint!;
const savedCard = (id: string, userId: string, fingerprint: string) => ({ id, userId, provider: 'dev', providerRef: 'devpm_success', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030, fingerprint });

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values(ids.map((id) => ({ ...maya!, id, email: `${id.replace('usr_', '').replace(/_/g, '-')}@example.test`, phone: null, phoneVerifiedAt: null, status: id === PEOPLE.banned || id === PEOPLE.gone ? 'banned' : 'active' })));
  // The banned account used the card the newcomer is about to add.
  await db.insert(paymentMethods).values(savedCard('pm_cf_banned', PEOPLE.banned, fingerprintFor(PEOPLE.newcomer)));
  // The blocker blocked an account; that account and the returner paid with one card (the returner never saved it).
  await db.insert(blocks).values({ blockerId: PEOPLE.blocker, blockedId: PEOPLE.blocked });
  await db.insert(paymentMethods).values(savedCard('pm_cf_blocked', PEOPLE.blocked, 'fp_cf_shared'));
  await db.insert(payments).values({ id: 'pay_cf_returner', payerUserId: PEOPLE.returner, purpose: 'booking_funding', amountCents: 5000, status: 'captured', provider: 'dev', methodRef: 'devpm_success', methodFingerprint: 'fp_cf_shared', idempotencyKey: 'cf-returner-1' });
});

afterAll(async () => {
  const cases = await db.select({ id: supportCases.id }).from(supportCases).where(inArray(supportCases.subjectUserId, ids));
  if (cases.length) await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, cases.map((row) => row.id)));
  await db.delete(supportCases).where(inArray(supportCases.subjectUserId, ids));
  await db.delete(payments).where(inArray(payments.payerUserId, ids));
  await db.delete(paymentMethods).where(inArray(paymentMethods.userId, ids));
  await db.delete(blocks).where(inArray(blocks.blockerId, ids));
  await db.delete(auditLog).where(inArray(auditLog.targetId, ids));
  await db.delete(users).where(inArray(users.id, ids));
  await pool.end();
});

describe('cards and accounts (abuse rehearsal J-AB4)', () => {
  it("gives each person's test card its own fingerprint, so test cards never match across accounts", () => {
    expect(fingerprintFor(PEOPLE.newcomer)).toMatch(/^devfp_[0-9a-f]{16}$/);
    expect(fingerprintFor(PEOPLE.newcomer)).not.toBe(fingerprintFor(PEOPLE.stranger));
  });

  it("refuses a banned account's card when it's added, neutrally, and saves a fine card with its fingerprint", async () => {
    expect(await addCard(db, PEOPLE.newcomer, { card: 'success', makeDefault: true }, now, dev)).toEqual({ ok: false, code: 'card_not_allowed' });
    expect(await db.select().from(paymentMethods).where(eq(paymentMethods.userId, PEOPLE.newcomer))).toEqual([]);
    expect(await addCard(db, PEOPLE.stranger, { card: 'success', makeDefault: true }, now, dev)).toMatchObject({ ok: true });
    const [saved] = await db.select({ fingerprint: paymentMethods.fingerprint }).from(paymentMethods).where(eq(paymentMethods.userId, PEOPLE.stranger));
    expect(saved?.fingerprint).toBe(fingerprintFor(PEOPLE.stranger));
  });

  it("refuses it at paying too, a new card or a saved one, and lets it through once the account isn't banned", async () => {
    const deps = { db, payments: dev };
    expect(await methodForChoice(deps, PEOPLE.newcomer, { kind: 'dev_card', card: 'success', save: false })).toEqual({ ok: false, code: 'card_not_allowed' });
    await db.insert(paymentMethods).values(savedCard('pm_cf_newcomer_old', PEOPLE.newcomer, fingerprintFor(PEOPLE.newcomer)));
    expect(await methodForChoice(deps, PEOPLE.newcomer, { kind: 'saved', methodId: 'pm_cf_newcomer_old' })).toEqual({ ok: false, code: 'card_not_allowed' });
    // Staff lift the ban: the card is fine again, and the payment carries its fingerprint.
    await db.update(users).set({ status: 'active' }).where(eq(users.id, PEOPLE.banned));
    expect(await methodForChoice(deps, PEOPLE.newcomer, { kind: 'dev_card', card: 'success', save: false })).toMatchObject({ providerRef: 'devpm_success', fingerprint: fingerprintFor(PEOPLE.newcomer) });
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, PEOPLE.banned));
  });

  it("keeps refusing the card of a banned account that was deleted afterwards (32's review)", async () => {
    // The banned account's card, then its deletion through the privacy flow (status 'deleted', the ban kept in the audit).
    await db.insert(paymentMethods).values(savedCard('pm_cf_gone', PEOPLE.gone, fingerprintFor(PEOPLE.next)));
    const storage: FileStorage = { name: 'memory', put: async () => undefined, get: async () => null, delete: async () => undefined };
    await anonymizeAccount(db, { storage, cipher: fieldCipherFromEnv(), email: { name: 'memory', send: async () => undefined }, appUrl: 'http://localhost:3000' }, PEOPLE.gone, now);
    expect((await db.select({ status: users.status }).from(users).where(eq(users.id, PEOPLE.gone)))[0]?.status).toBe('deleted');
    expect(await methodForChoice({ db, payments: dev }, PEOPLE.next, { kind: 'dev_card', card: 'success', save: false })).toEqual({ ok: false, code: 'card_not_allowed' });
  });

  it('opens one case for staff when someone reaches a person who blocked another account on the same card, and does nothing else', async () => {
    const message = { type: 'message.sent', payload: { threadId: 'thr_cf', senderUserId: PEOPLE.returner, recipientIds: [PEOPLE.blocker] } };
    const caseId = await flagBlockEvasion(db, message, now);
    expect(caseId).toBeTruthy();
    const [row] = await db.select().from(supportCases).where(eq(supportCases.id, caseId!));
    expect(row).toMatchObject({ type: 'report_user', status: 'open', priority: 'normal', reason: BLOCK_EVASION_REASON, subjectUserId: PEOPLE.returner, openedByUserId: null, context: { threadId: 'thr_cf', recipientUserId: PEOPLE.blocker, blockedUserId: PEOPLE.blocked } });
    // Once while it's open, whatever way they reach them next.
    expect(await flagBlockEvasion(db, { type: 'offer.submitted', payload: { helperUserId: PEOPLE.returner, posterUserId: PEOPLE.blocker, taskId: 'tsk_cf' } }, now)).toBeNull();
    expect(await db.select().from(supportCases).where(eq(supportCases.subjectUserId, PEOPLE.returner))).toHaveLength(1);
    // Nothing happened to either account.
    expect(new Set((await db.select({ status: users.status }).from(users).where(inArray(users.id, [PEOPLE.returner, PEOPLE.blocked]))).map((user) => user.status))).toEqual(new Set(['active']));
    // Someone with no card in common reaching the blocker: no case.
    expect(await flagBlockEvasion(db, { type: 'question.asked', payload: { askerUserId: PEOPLE.stranger, posterUserId: PEOPLE.blocker, taskId: 'tsk_cf' } }, now)).toBeNull();
  });
});
