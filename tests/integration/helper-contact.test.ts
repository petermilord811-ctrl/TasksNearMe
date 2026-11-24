import { and, eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { communityPosts } from '@/modules/community/schema';
import { blocks } from '@/modules/messaging/schema';
import { getHelperContactAccess, HELPER_CONTACT_REVEALS_PER_DAY, revealHelperContact, saveContactSharing } from '@/modules/profiles/contact-sharing';
import { helperProfiles } from '@/modules/profiles/schema';
import { sparkPurchases } from '@/modules/sparks/schema';
import { sparksPageData } from '@/modules/sparks/service';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * Contact details on a helper's profile (owner, 2026-11-24): a helper shares them by choice, neighbors with 2,000
 * earned Sparks see them with "Show" (limited per day, written to the audit log), and bought Sparks never count.
 * Everyone here is made for the test and removed after it.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const HELPER = 'usr_tmp_contact_helper';
/** 402 visible posts over 134 days (3 a day count): 2,010 earned Sparks, a Pillar. */
const FAN = 'usr_tmp_contact_fan';
/** 180 posts (900 earned) and a 1,200 pack: 2,100 in all, a Pillar by total, short of 2,000 earned. */
const BUYER = 'usr_tmp_contact_buyer';
/** A client, no helper profile. */
const CLIENT = 'usr_tmp_contact_client';
const PEOPLE = [HELPER, FAN, BUYER, CLIENT];
const now = new Date();

function posts(author: string, days: number) {
  return Array.from({ length: days * 3 }, (_, n) => {
    const day = Math.floor(n / 3) + 1;
    const createdAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day, 12, n % 3));
    return { id: `cpo_tmp_contact_${author.slice(-5)}_${n}`, marketId: 'mkt_austin', authorUserId: author, kind: 'tip', title: `Tip ${n}`, body: 'A useful tip for neighbors.', status: 'visible', createdAt, lastActivityAt: createdAt, updatedAt: createdAt };
  });
}

async function cleanUp() {
  await db.delete(blocks).where(or(inArray(blocks.blockerId, PEOPLE), inArray(blocks.blockedId, PEOPLE)));
  await db.delete(communityPosts).where(inArray(communityPosts.authorUserId, PEOPLE));
  await db.delete(sparkPurchases).where(inArray(sparkPurchases.userId, PEOPLE));
  await db.delete(auditLog).where(or(inArray(auditLog.actorId, PEOPLE), and(eq(auditLog.targetType, 'user'), inArray(auditLog.targetId, PEOPLE))));
  await db.delete(rateLimits).where(like(rateLimits.key, 'helper-contact-reveal:usr_tmp_contact_%'));
  await db.delete(helperProfiles).where(inArray(helperProfiles.userId, PEOPLE));
  await db.delete(users).where(inArray(users.id, PEOPLE));
}

beforeAll(async () => {
  await cleanUp();
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
  if (!maya || !jordan || !profile) throw new Error('The seeded people are missing');
  await db.insert(users).values([
    { ...jordan, id: HELPER, email: 'tmp-contact-helper@example.test', emailVerified: true, name: 'Hal H.', firstName: 'Hal', lastName: 'Hart', phone: '+15125550194', phoneVerifiedAt: now, status: 'active', contactSharing: 'none' },
    { ...maya, id: FAN, email: 'tmp-contact-fan@example.test', name: 'Fay F.', firstName: 'Fay', lastName: 'Fox', phone: '+15125550195', status: 'active' },
    { ...maya, id: BUYER, email: 'tmp-contact-buyer@example.test', name: 'Bo B.', firstName: 'Bo', lastName: 'Bell', phone: '+15125550196', status: 'active' },
    { ...maya, id: CLIENT, email: 'tmp-contact-client@example.test', name: 'Cy C.', firstName: 'Cy', lastName: 'Cole', phone: '+15125550197', status: 'active' },
  ]);
  await db.insert(helperProfiles).values({ ...profile, userId: HELPER, handle: 'tmp-contact-helper', status: 'active', foundingNumber: null, completedCount: 0 });
  await db.insert(communityPosts).values([...posts(FAN, 134), ...posts(BUYER, 60)]);
  await db.insert(sparkPurchases).values({ id: 'spk_tmp_contact_buyer', userId: BUYER, pack: 'large', points: 1200, amountCents: 999, provider: 'dev', status: 'paid' });
});

afterAll(async () => {
  await cleanUp();
  await pool.end();
});

describe('contact details on a helper profile', () => {
  it('shows nothing until the helper chooses to share, and only a helper can choose', async () => {
    expect(await getHelperContactAccess(db, FAN, HELPER)).toBeUndefined();
    expect(await saveContactSharing(db, CLIENT, { setting: 'email' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await saveContactSharing(db, HELPER, { setting: 'everything' }, now)).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await saveContactSharing(db, HELPER, { setting: 'email_phone' }, now)).toEqual({ ok: true, code: 'updated' });
    const [consent] = await db.select().from(auditLog).where(and(eq(auditLog.actorId, HELPER), eq(auditLog.action, 'account.contact_sharing_changed')));
    expect(consent?.metadata).toEqual({ from: 'none', to: 'email_phone' });
  });

  it('opens with 2,000 earned Sparks; a bought total short of that stays locked', async () => {
    expect(await getHelperContactAccess(db, FAN, HELPER)).toEqual({ state: 'reveal', shares: ['email', 'phone'] });
    expect(await getHelperContactAccess(db, BUYER, HELPER)).toEqual({ state: 'locked', shares: ['email', 'phone'], earned: 900, at: 2000 });
    expect(await getHelperContactAccess(db, null, HELPER)).toBeUndefined();
    expect(await getHelperContactAccess(db, HELPER, HELPER)).toBeUndefined();
    // The Sparks page says the same: the buyer is a Pillar by total, but bought Sparks don't open contact details.
    const buyerPage = await sparksPageData(db, null, BUYER, now);
    expect(buyerPage.summary).toMatchObject({ total: 2100, bought: 1200, level: 'pillar' });
    expect(buyerPage.helperContact).toEqual({ at: 2000, unlocked: false });
    expect(buyerPage.levels.filter((row) => row.helperContact).map((row) => row.level)).toEqual(['pillar', 'local_legend']);
    expect((await sparksPageData(db, null, FAN, now)).helperContact).toEqual({ at: 2000, unlocked: true });
  });

  it('gives the details only to a viewer who may see them, and records who saw them', async () => {
    expect(await revealHelperContact(db, BUYER, { helperId: HELPER }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await revealHelperContact(db, FAN, { helperId: 42 }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await revealHelperContact(db, FAN, { helperId: HELPER }, now)).toEqual({ ok: true, email: 'tmp-contact-helper@example.test', phone: '+15125550194' });
    const [seen] = await db.select().from(auditLog).where(and(eq(auditLog.actorId, FAN), eq(auditLog.action, 'helper_contact.revealed')));
    expect(seen).toMatchObject({ actorRole: 'user', targetType: 'user', targetId: HELPER, metadata: { shares: ['email', 'phone'] } });
    // Nothing for the buyer's attempt.
    expect(await db.select().from(auditLog).where(and(eq(auditLog.actorId, BUYER), eq(auditLog.action, 'helper_contact.revealed')))).toEqual([]);
  });

  it('keeps an unverified phone and anything no longer shared out', async () => {
    await db.update(users).set({ phoneVerifiedAt: null }).where(eq(users.id, HELPER));
    expect(await revealHelperContact(db, FAN, { helperId: HELPER }, now)).toEqual({ ok: true, email: 'tmp-contact-helper@example.test' });
    await saveContactSharing(db, HELPER, { setting: 'phone' }, now);
    // Only the phone, which isn't verified: nothing to show.
    expect(await getHelperContactAccess(db, FAN, HELPER)).toBeUndefined();
    expect(await revealHelperContact(db, FAN, { helperId: HELPER }, now)).toEqual({ ok: false, code: 'not_allowed' });
    await db.update(users).set({ phoneVerifiedAt: now }).where(eq(users.id, HELPER));
    await saveContactSharing(db, HELPER, { setting: 'email_phone' }, now);
  });

  it('shows nothing across a block, to a limited account, or for a paused profile', async () => {
    await db.insert(blocks).values({ blockerId: HELPER, blockedId: FAN });
    expect(await getHelperContactAccess(db, FAN, HELPER)).toBeUndefined();
    expect(await revealHelperContact(db, FAN, { helperId: HELPER }, now)).toEqual({ ok: false, code: 'not_allowed' });
    await db.delete(blocks).where(eq(blocks.blockerId, HELPER));

    await db.update(users).set({ status: 'restricted' }).where(eq(users.id, FAN));
    expect(await getHelperContactAccess(db, FAN, HELPER)).toBeUndefined();
    await db.update(users).set({ status: 'active' }).where(eq(users.id, FAN));

    await db.update(helperProfiles).set({ status: 'paused' }).where(eq(helperProfiles.userId, HELPER));
    expect(await getHelperContactAccess(db, FAN, HELPER)).toBeUndefined();
    await db.update(helperProfiles).set({ status: 'active' }).where(eq(helperProfiles.userId, HELPER));
    expect(await getHelperContactAccess(db, FAN, HELPER)).toEqual({ state: 'reveal', shares: ['email', 'phone'] });
  });

  it(`allows ${HELPER_CONTACT_REVEALS_PER_DAY} reveals a day`, async () => {
    // A fresh day's window, so the reveals above don't count.
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 9));
    for (let n = 0; n < HELPER_CONTACT_REVEALS_PER_DAY; n += 1) expect(await revealHelperContact(db, FAN, { helperId: HELPER }, day)).toMatchObject({ ok: true });
    const refused = await revealHelperContact(db, FAN, { helperId: HELPER }, day);
    expect(refused).toMatchObject({ ok: false, code: 'rate_limited' });
    expect(refused.ok === false && refused.retryAt ? new Date(refused.retryAt).getTime() : 0).toBeGreaterThan(day.getTime());
  });

  it("refuses sharing a phone that can't be verified here, where texts are off (sweep 2026-11-24 A6)", async () => {
    const textsOff = { NODE_ENV: 'production' };
    const [before] = await db.select({ contactSharing: users.contactSharing, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, HELPER));
    await db.update(users).set({ phoneVerifiedAt: null, contactSharing: 'none' }).where(eq(users.id, HELPER));
    try {
      expect(await saveContactSharing(db, HELPER, { setting: 'phone' }, now, textsOff)).toEqual({ ok: false, code: 'not_allowed' });
      expect(await saveContactSharing(db, HELPER, { setting: 'email_phone' }, now, textsOff)).toEqual({ ok: false, code: 'not_allowed' });
      expect(await saveContactSharing(db, HELPER, { setting: 'email' }, now, textsOff)).toEqual({ ok: true, code: 'updated' });
      // Where texts work, it can be chosen and shows once verified.
      expect(await saveContactSharing(db, HELPER, { setting: 'phone' }, now)).toEqual({ ok: true, code: 'updated' });
    } finally {
      await db.update(users).set({ phoneVerifiedAt: before!.phoneVerifiedAt, contactSharing: before!.contactSharing }).where(eq(users.id, HELPER));
    }
  });
});
