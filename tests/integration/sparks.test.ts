import { createHmac } from 'node:crypto';
import { eq, inArray, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevBilling, type BillingCheckoutSession, type BillingProvider } from '@/integrations/billing';
import { users } from '@/modules/accounts/schema';
import { billingCustomers } from '@/modules/billing/schema';
import { communityPosts, communityReactions, communityReplies } from '@/modules/community/schema';
import { sparkPurchases } from '@/modules/sparks/schema';
import { buySparks, directChatAllowance, handleSparksWebhook, isSparksCheckoutEvent, sparksPageData, sparksSummariesOf } from '@/modules/sparks/service';
import { createDb } from '@/platform/db/connect';

/** Sparks (owner, 2026-11-21): counting what people did, buying packs, and confirming them only from Stripe. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const AUTHOR = 'usr_tmp_sparks_author';
const FAN = 'usr_tmp_sparks_fan';
const PEOPLE = [AUTHOR, FAN];
const now = new Date();
const SECRET = 'whsec_tmp_sparks';

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values([
    { ...maya!, id: AUTHOR, email: 'tmp-sparks-author@example.test', name: 'Ari S.', firstName: 'Ari', lastName: 'Stone', phone: '+15125550691' },
    { ...maya!, id: FAN, email: 'tmp-sparks-fan@example.test', name: 'Fay F.', firstName: 'Fay', lastName: 'Fox', phone: '+15125550692' },
  ]);
});

afterAll(async () => {
  const posts = await db.select({ id: communityPosts.id }).from(communityPosts).where(inArray(communityPosts.authorUserId, PEOPLE));
  await db.delete(communityReactions).where(inArray(communityReactions.userId, PEOPLE));
  if (posts.length) await db.delete(communityReplies).where(inArray(communityReplies.postId, posts.map((row) => row.id)));
  await db.delete(communityReplies).where(inArray(communityReplies.authorUserId, PEOPLE));
  await db.delete(communityPosts).where(inArray(communityPosts.authorUserId, PEOPLE));
  await db.delete(sparkPurchases).where(inArray(sparkPurchases.userId, PEOPLE));
  await db.delete(billingCustomers).where(inArray(billingCustomers.userId, PEOPLE));
  await db.delete(users).where(or(inArray(users.id, PEOPLE)));
  await pool.end();
});

describe('Sparks', () => {
  it('counts visible posts up to 3 a day, replies, and Helpful and Thanks from others only', async () => {
    expect((await sparksSummariesOf(db, [AUTHOR])).has(AUTHOR)).toBe(false);
    const day = (offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset, 12));
    // Five posts today (three count), one yesterday, and one removed (it doesn't).
    const post = (id: string, createdAt: Date, status = 'visible') => ({ id, marketId: 'mkt_austin', authorUserId: AUTHOR, kind: 'tip', title: `Tip ${id}`, body: 'A useful tip for neighbors.', status, createdAt, lastActivityAt: createdAt, updatedAt: createdAt });
    await db.insert(communityPosts).values([...[1, 2, 3, 4, 5].map((n) => post(`cpo_tmp_sparks_${n}`, day(0))), post('cpo_tmp_sparks_6', day(1)), post('cpo_tmp_sparks_7', day(1), 'removed')]);
    await db.insert(communityReplies).values({ id: 'crp_tmp_sparks_1', postId: 'cpo_tmp_sparks_1', authorUserId: AUTHOR, body: 'And one more thing.', createdAt: day(0) });
    await db.insert(communityReactions).values([
      { targetKind: 'post', targetId: 'cpo_tmp_sparks_1', userId: FAN, kind: 'helpful' },
      { targetKind: 'post', targetId: 'cpo_tmp_sparks_1', userId: FAN, kind: 'thanks' },
      { targetKind: 'reply', targetId: 'crp_tmp_sparks_1', userId: FAN, kind: 'helpful' },
      // Their own, and one on the removed post: neither counts.
      { targetKind: 'post', targetId: 'cpo_tmp_sparks_2', userId: AUTHOR, kind: 'helpful' },
      { targetKind: 'post', targetId: 'cpo_tmp_sparks_7', userId: FAN, kind: 'helpful' },
    ]);
    // Posts 4 × 5 = 20, a reply 2, Helpful 2 × 3 = 6, Thanks 2: 30.
    expect((await sparksSummariesOf(db, [AUTHOR, FAN])).get(AUTHOR)).toEqual({ total: 30, bought: 0, level: 'newcomer' });
    const page = await sparksPageData(db, null, AUTHOR, now);
    expect(page.breakdown.slice(0, 4)).toEqual([
      { source: 'posts', count: 4, points: 20 },
      { source: 'replies', count: 1, points: 2 },
      { source: 'helpful', count: 2, points: 6 },
      { source: 'thanks', count: 1, points: 2 },
    ]);
    expect(page).toMatchObject({ earned: 30, nextLevel: { level: 'neighbor', at: 50 }, directChatsPerDay: 3, unavailable: true });
  });

  it('buys a pack with the stand-in: counted at once, shown with the bought part, and raising the level and allowance', async () => {
    const bought = await buySparks(db, createDevBilling(), AUTHOR, { pack: 'small' }, now);
    expect(bought).toMatchObject({ ok: true, code: 'opened', redirectTo: expect.stringMatching(/^\/app\/sparks\?purchase=spk_/) });
    expect((await sparksSummariesOf(db, [AUTHOR])).get(AUTHOR)).toEqual({ total: 130, bought: 100, level: 'neighbor' });
    // A Neighbor starts 10 new direct conversations a day (2026-11-22; a Newcomer 3).
    expect(await directChatAllowance(db, AUTHOR, now)).toBe(10);
    const purchase = bought.ok ? new URL(bought.redirectTo!, 'http://x').searchParams.get('purchase')! : '';
    const page = await sparksPageData(db, createDevBilling(), AUTHOR, now, { purchase });
    expect(page).toMatchObject({ notice: 'purchased', summary: { total: 130, bought: 100 }, purchases: [{ id: purchase, points: 100, priceCents: 99, status: 'paid' }] });
    expect(await buySparks(db, createDevBilling(), AUTHOR, { pack: 'huge' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await buySparks(db, null, AUTHOR, { pack: 'small' }, now)).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('with Stripe: counts a pack only once Stripe says its checkout is paid, for its amount, from the return or the webhook', async () => {
    const sessions = new Map<string, BillingCheckoutSession>();
    const stripe: BillingProvider = {
      ...createDevBilling(),
      name: 'stripe',
      createCustomer: async () => ({ customerId: 'cus_tmp_sparks' }),
      createPaymentCheckout: async (input) => {
        const id = `cs_tmp_sparks_${sessions.size + 1}`;
        sessions.set(id, { id, mode: 'payment', paymentStatus: 'unpaid', status: 'open', amountTotalCents: input.amountCents, metadata: input.metadata });
        return { url: `https://checkout.stripe.test/${id}`, sessionId: id };
      },
      getCheckoutSession: async (id) => sessions.get(id)!,
    };
    const opened = await buySparks(db, stripe, FAN, { pack: 'medium' }, now);
    expect(opened).toEqual({ ok: true, code: 'opened', redirectTo: 'https://checkout.stripe.test/cs_tmp_sparks_1' });
    const [row] = await db.select().from(sparkPurchases).where(eq(sparkPurchases.userId, FAN));
    expect(row).toMatchObject({ status: 'pending', points: 550, amountCents: 499, provider: 'stripe', providerSessionId: 'cs_tmp_sparks_1' });
    // Back before paying: still pending, nothing counted.
    expect((await sparksPageData(db, stripe, FAN, now, { purchase: row!.id })).notice).toBe('purchase_pending');
    expect((await sparksSummariesOf(db, [FAN])).has(FAN)).toBe(false);
    // A session that says paid for another amount isn't believed.
    sessions.set('cs_tmp_sparks_1', { ...sessions.get('cs_tmp_sparks_1')!, paymentStatus: 'paid', amountTotalCents: 1 });
    expect((await sparksPageData(db, stripe, FAN, now, { purchase: row!.id })).notice).toBe('purchase_pending');
    // Paid for the right amount: the webhook counts it, once.
    sessions.set('cs_tmp_sparks_1', { ...sessions.get('cs_tmp_sparks_1')!, amountTotalCents: 499 });
    const payload = JSON.stringify({ id: 'evt_tmp_sparks', type: 'checkout.session.completed', data: { object: { id: 'cs_tmp_sparks_1', mode: 'payment', metadata: { kind: 'sparks' } } } });
    expect(isSparksCheckoutEvent(payload)).toBe(true);
    expect(isSparksCheckoutEvent(JSON.stringify({ type: 'checkout.session.completed', data: { object: { mode: 'subscription' } } }))).toBe(false);
    const t = Math.floor(now.getTime() / 1000);
    const signature = `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex')}`;
    expect(await handleSparksWebhook(db, stripe, { payload, signature: 'bad', secret: SECRET }, now)).toEqual({ status: 400, body: { ok: false } });
    expect(await handleSparksWebhook(db, stripe, { payload, signature, secret: SECRET }, now)).toEqual({ status: 200, body: { ok: true } });
    expect(await handleSparksWebhook(db, stripe, { payload, signature, secret: SECRET }, now)).toEqual({ status: 200, body: { ok: true } });
    expect((await sparksSummariesOf(db, [FAN])).get(FAN)).toEqual({ total: 550, bought: 550, level: 'good_neighbor' });
    expect((await sparksPageData(db, stripe, FAN, now, { purchase: row!.id })).notice).toBe('purchased');
  });
});
