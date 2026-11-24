import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  CONTACT_LEVELS,
  DIRECT_CHATS_PER_DAY,
  HELPER_CONTACT_EARNED_MIN,
  PLAN_DIRECT_CHATS_PER_DAY,
  routes,
  SPARK_LEVEL_THRESHOLDS,
  SPARK_LEVELS,
  SPARK_PACK_OFFERS,
  SPARK_PACKS,
  SPARK_GIVER_RULES,
  type ActionResult,
  type SparkPack,
  type SparkPurchaseView,
  type SparksPageData,
  type SparksSummary,
} from '@/contracts';
import type { BillingProvider } from '@/integrations/billing';
import { appUrl } from '@/integrations/oauth';
import { verifyStripeSignature } from '@/integrations/stripe-identity';
import { users } from '@/modules/accounts/schema';
import { activePlans, customerFor } from '@/modules/billing/service';
import { bookings } from '@/modules/bookings/schema';
import { communityPosts, communityReactions, communityReplies } from '@/modules/community/schema';
import { reviews } from '@/modules/reviews/schema';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { cappedReactions, directChatsPerDay, earnedSparks, nextSparkLevel, sparkRuleRows, sparksSummary, type SparkCounts } from './domain';
import { sparkPurchases } from './schema';

/**
 * Sparks (owner, 2026-11-21; decisions.md): counting them, buying them, and the page. Earned Sparks are counted from
 * the rows they come from each time (a post removed, a Helpful taken back or a review hidden stops counting at once),
 * in a few grouped queries for any number of people. Bought ones count once Stripe says the checkout is paid.
 */

/** Metadata on a Sparks checkout: how its return and its webhook find the purchase. */
export const SPARKS_CHECKOUT_KIND = 'sparks';

const isPack = (value: unknown): value is SparkPack => (SPARK_PACKS as readonly unknown[]).includes(value);

const emptyCounts = (): SparkCounts & { postsPerDay: number[]; repliesPerDay: number[] } => ({ postsPerDay: [], repliesPerDay: [], helpful: 0, thanks: 0, bookings: 0, reviews: 0 });

/** What counts toward each person's Sparks, and what they bought. */
export async function sparkTallies(db: Db, userIds: readonly string[]): Promise<Map<string, { counts: SparkCounts; bought: number }>> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, { counts: ReturnType<typeof emptyCounts>; bought: number }>(ids.map((id) => [id, { counts: emptyCounts(), bought: 0 }]));
  if (ids.length === 0) return out;
  const count = sql<number>`count(*)::int`;
  const givers = alias(users, 'spark_givers');
  const giverCounts = and(
    eq(givers.status, 'active'),
    sql`${communityReactions.createdAt} >= ${givers.createdAt} + ${SPARK_GIVER_RULES.minAccountDays}::int * interval '1 day'`,
  );
  const postDay = sql`date_trunc('day', ${communityPosts.createdAt} at time zone 'UTC')`;
  const replyDay = sql`date_trunc('day', ${communityReplies.createdAt} at time zone 'UTC')`;
  const [posts, replies, onPosts, onReplies, asClient, asHelper, written, bought] = await Promise.all([
    db
      .select({ userId: communityPosts.authorUserId, count })
      .from(communityPosts)
      .where(and(inArray(communityPosts.authorUserId, ids), eq(communityPosts.status, 'visible')))
      .groupBy(communityPosts.authorUserId, postDay),
    db
      .select({ userId: communityReplies.authorUserId, count })
      .from(communityReplies)
      .where(and(inArray(communityReplies.authorUserId, ids), eq(communityReplies.status, 'visible')))
      .groupBy(communityReplies.authorUserId, replyDay),
    // Helpful and Thanks from other people on what they wrote, while it's visible, per giver: only from accounts in good
    // standing that were old enough when they reacted (`SPARK_GIVER_RULES`), each giver capped below (sweep A2).
    db
      .select({ userId: communityPosts.authorUserId, giverId: communityReactions.userId, kind: communityReactions.kind, count })
      .from(communityReactions)
      .innerJoin(communityPosts, and(eq(communityReactions.targetKind, 'post'), eq(communityReactions.targetId, communityPosts.id)))
      .innerJoin(givers, eq(givers.id, communityReactions.userId))
      .where(and(inArray(communityPosts.authorUserId, ids), eq(communityPosts.status, 'visible'), ne(communityReactions.userId, communityPosts.authorUserId), giverCounts))
      .groupBy(communityPosts.authorUserId, communityReactions.userId, communityReactions.kind),
    db
      .select({ userId: communityReplies.authorUserId, giverId: communityReactions.userId, kind: communityReactions.kind, count })
      .from(communityReactions)
      .innerJoin(communityReplies, and(eq(communityReactions.targetKind, 'reply'), eq(communityReactions.targetId, communityReplies.id)))
      .innerJoin(givers, eq(givers.id, communityReactions.userId))
      .where(and(inArray(communityReplies.authorUserId, ids), eq(communityReplies.status, 'visible'), ne(communityReactions.userId, communityReplies.authorUserId), giverCounts))
      .groupBy(communityReplies.authorUserId, communityReactions.userId, communityReactions.kind),
    db.select({ userId: bookings.posterUserId, count }).from(bookings).where(and(inArray(bookings.posterUserId, ids), eq(bookings.status, 'completed'))).groupBy(bookings.posterUserId),
    db.select({ userId: bookings.helperUserId, count }).from(bookings).where(and(inArray(bookings.helperUserId, ids), eq(bookings.status, 'completed'))).groupBy(bookings.helperUserId),
    db
      .select({ userId: reviews.authorUserId, count })
      .from(reviews)
      .where(and(inArray(reviews.authorUserId, ids), inArray(reviews.status, ['submitted', 'published'])))
      .groupBy(reviews.authorUserId),
    db
      .select({ userId: sparkPurchases.userId, points: sql<number>`coalesce(sum(${sparkPurchases.points}), 0)::int` })
      .from(sparkPurchases)
      .where(and(inArray(sparkPurchases.userId, ids), eq(sparkPurchases.status, 'paid')))
      .groupBy(sparkPurchases.userId),
  ]);
  const of = (userId: string | null) => (userId ? out.get(userId) : undefined);
  for (const row of posts) of(row.userId)?.counts.postsPerDay.push(row.count);
  for (const row of replies) of(row.userId)?.counts.repliesPerDay.push(row.count);
  // One giver's reactions on posts and replies together, then each giver's cap (cappedReactions).
  const perGiver = new Map<string, Map<string, { kind: string; count: number }>>();
  for (const row of [...onPosts, ...onReplies]) {
    if (!row.userId || !of(row.userId)) continue;
    const byGiver = perGiver.get(row.userId) ?? new Map<string, { kind: string; count: number }>();
    perGiver.set(row.userId, byGiver);
    const key = `${row.giverId}:${row.kind}`;
    const seen = byGiver.get(key);
    if (seen) seen.count += row.count;
    else byGiver.set(key, { kind: row.kind, count: row.count });
  }
  for (const [userId, byGiver] of perGiver) {
    const entry = of(userId);
    if (!entry) continue;
    const reactions = cappedReactions(byGiver.values());
    entry.counts.helpful += reactions.helpful;
    entry.counts.thanks += reactions.thanks;
  }
  for (const row of [...asClient, ...asHelper]) {
    const entry = of(row.userId);
    if (entry) entry.counts.bookings += row.count;
  }
  for (const row of written) {
    const entry = of(row.userId);
    if (entry) entry.counts.reviews += row.count;
  }
  for (const row of bought) {
    const entry = of(row.userId);
    if (entry) entry.bought = row.points;
  }
  return out;
}

/** Each person's Sparks as others see them (people with none are left out). */
export async function sparksSummariesOf(db: Db, userIds: readonly string[]): Promise<Map<string, SparksSummary>> {
  const tallies = await sparkTallies(db, userIds);
  const out = new Map<string, SparksSummary>();
  for (const [userId, { counts, bought }] of tallies) {
    const summary = sparksSummary(earnedSparks(counts).earned, bought);
    if (summary) out.set(userId, summary);
  }
  return out;
}

export async function sparksSummaryOf(db: Db, userId: string): Promise<SparksSummary | undefined> {
  return (await sparksSummariesOf(db, [userId])).get(userId);
}

/** New direct conversations the person may start in any 24 hours: their level's allowance, or their plan's. */
export async function directChatAllowance(db: Db, userId: string, now: Date): Promise<number> {
  const [summary, plans] = await Promise.all([sparksSummaryOf(db, userId), activePlans(db, userId, now)]);
  return directChatsPerDay(summary?.total ?? 0, plans.keys());
}

// ---- Buying ---------------------------------------------------------------------------------------------------

type PurchaseRow = typeof sparkPurchases.$inferSelect;

async function markPaid(db: Db, row: PurchaseRow, now: Date): Promise<boolean> {
  const updated = await db
    .update(sparkPurchases)
    .set({ status: 'paid', paidAt: now })
    .where(and(eq(sparkPurchases.id, row.id), eq(sparkPurchases.status, 'pending')))
    .returning({ id: sparkPurchases.id });
  if (updated.length === 0) return false;
  await db.insert(auditLog).values({ id: newId('aud'), actorId: row.userId, actorRole: 'user', action: 'sparks.purchased', targetType: 'spark_purchase', targetId: row.id, metadata: { pack: row.pack, points: row.points, amountCents: row.amountCents, provider: row.provider } });
  return true;
}

/**
 * Counts a pending purchase once Stripe says its checkout is paid, for the amount and the purchase it was made for.
 * Asks Stripe; never the browser. Returns the purchase's status afterwards.
 */
export async function confirmSparkPurchase(db: Db, provider: BillingProvider | null, row: PurchaseRow, now: Date): Promise<PurchaseRow['status']> {
  if (row.status !== 'pending') return row.status;
  if (row.provider !== 'stripe' || provider?.name !== 'stripe' || !provider.getCheckoutSession || !row.providerSessionId) return row.status;
  try {
    const session = await provider.getCheckoutSession(row.providerSessionId);
    const matches = session.metadata.purchaseId === row.id && session.metadata.kind === SPARKS_CHECKOUT_KIND && session.amountTotalCents === row.amountCents;
    if (session.paymentStatus === 'paid' && matches) {
      await markPaid(db, row, now);
      return 'paid';
    }
  } catch (error) {
    console.error('[sparks] checkout read', error);
  }
  return 'pending';
}

/**
 * Buy a pack: Stripe Checkout (its URL to go to), or the stand-in (development and tests), which counts it at once and
 * comes back. Refused where buying isn't offered.
 */
export async function buySparks(db: Db, provider: BillingProvider | null, userId: string, input: { pack?: unknown }, now: Date): Promise<ActionResult> {
  if (!provider || !isPack(input?.pack)) return { ok: false, code: 'not_allowed' };
  const pack = input.pack;
  const offer = SPARK_PACK_OFFERS[pack];
  const [user] = await db.select({ email: users.email, name: users.name, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status === 'deleted' || user.status === 'banned') return { ok: false, code: 'not_allowed' };
  const id = newId('spk');
  if (provider.name === 'dev') {
    const [row] = await db.insert(sparkPurchases).values({ id, userId, pack, points: offer.points, amountCents: offer.priceCents, provider: 'dev', createdAt: now }).returning();
    await markPaid(db, row!, now);
    return { ok: true, code: 'opened', redirectTo: routes.app.sparks({ purchase: id }) };
  }
  if (!provider.createPaymentCheckout) return { ok: false, code: 'not_allowed' };
  const customerId = await customerFor(db, provider, { id: userId, email: user.email, name: user.name });
  await db.insert(sparkPurchases).values({ id, userId, pack, points: offer.points, amountCents: offer.priceCents, provider: provider.name, createdAt: now });
  const base = appUrl();
  const session = await provider.createPaymentCheckout({
    customerId,
    userId,
    amountCents: offer.priceCents,
    productName: `${offer.points.toLocaleString('en-US')} Sparks`,
    metadata: { kind: SPARKS_CHECKOUT_KIND, purchaseId: id, userId, pack, points: String(offer.points) },
    successUrl: `${base}${routes.app.sparks({ purchase: id })}`,
    cancelUrl: `${base}${routes.app.sparks({ purchase: id, canceled: true })}`,
    idempotencyKey: `sparks-checkout:${id}`,
  });
  await db.update(sparkPurchases).set({ providerSessionId: session.sessionId }).where(eq(sparkPurchases.id, id));
  return { ok: true, code: 'opened', redirectTo: session.url };
}

/** A Stripe event about a Sparks checkout (routing only: the handler checks the signature before believing it). */
export function isSparksCheckoutEvent(payload: string): boolean {
  try {
    const event = JSON.parse(payload) as { type?: unknown; data?: { object?: { mode?: unknown; metadata?: { kind?: unknown } } } };
    return (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && event.data?.object?.mode === 'payment' && event.data.object.metadata?.kind === SPARKS_CHECKOUT_KIND;
  } catch {
    return false;
  }
}

/** Stripe's checkout events for Sparks: the purchase is read back from Stripe and counted once. */
export async function handleSparksWebhook(db: Db, provider: BillingProvider | null, input: { payload: string; signature: string | null; secret: string }, now: Date): Promise<{ status: number; body: { ok: boolean; ignored?: boolean } }> {
  if (!verifyStripeSignature({ payload: input.payload, header: input.signature, secret: input.secret, now })) return { status: 400, body: { ok: false } };
  let sessionId: string | undefined;
  try {
    const event = JSON.parse(input.payload) as { data?: { object?: { id?: unknown } } };
    sessionId = typeof event.data?.object?.id === 'string' ? event.data.object.id : undefined;
  } catch {
    return { status: 400, body: { ok: false } };
  }
  if (!sessionId) return { status: 200, body: { ok: true, ignored: true } };
  const [row] = await db.select().from(sparkPurchases).where(and(eq(sparkPurchases.provider, 'stripe'), eq(sparkPurchases.providerSessionId, sessionId))).limit(1);
  if (!row) return { status: 200, body: { ok: true, ignored: true } };
  await confirmSparkPurchase(db, provider, row, now);
  return { status: 200, body: { ok: true } };
}

// ---- The page -------------------------------------------------------------------------------------------------

/**
 * `/app/sparks`. `returned`: back from checkout (`purchase`, and `canceled` when the person left it): a pending
 * purchase is read back from Stripe first, so a paid one counts on this very page.
 */
export async function sparksPageData(db: Db, provider: BillingProvider | null, userId: string, now: Date, returned: { purchase?: string; canceled?: boolean } = {}): Promise<SparksPageData> {
  let notice: SparksPageData['notice'];
  if (returned.purchase) {
    const [row] = await db.select().from(sparkPurchases).where(and(eq(sparkPurchases.id, String(returned.purchase)), eq(sparkPurchases.userId, userId))).limit(1);
    if (row) {
      const status = await confirmSparkPurchase(db, provider, row, now);
      notice = status === 'paid' ? 'purchased' : returned.canceled ? 'purchase_canceled' : status === 'pending' ? 'purchase_pending' : undefined;
    }
  }
  const [tallies, plans, purchaseRows] = await Promise.all([
    sparkTallies(db, [userId]),
    activePlans(db, userId, now),
    db.select().from(sparkPurchases).where(and(eq(sparkPurchases.userId, userId), or(ne(sparkPurchases.status, 'pending'), sql`${sparkPurchases.createdAt} > ${new Date(now.getTime() - 86_400_000)}`))).orderBy(desc(sparkPurchases.createdAt)).limit(20),
  ]);
  const tally = tallies.get(userId) ?? { counts: emptyCounts(), bought: 0 };
  const { earned, breakdown } = earnedSparks(tally.counts);
  const total = earned + tally.bought;
  const hasPlan = plans.size > 0;
  const purchases: SparkPurchaseView[] = purchaseRows.map((row) => ({
    id: row.id,
    pack: isPack(row.pack) ? row.pack : 'small',
    points: row.points,
    priceCents: row.amountCents,
    status: row.status === 'paid' || row.status === 'refunded' ? row.status : 'pending',
    createdAt: row.createdAt.toISOString(),
  }));
  const next = nextSparkLevel(total);
  return {
    summary: sparksSummary(earned, tally.bought) ?? { total: 0, bought: 0, level: 'newcomer' },
    earned,
    breakdown,
    ...(next ? { nextLevel: next } : {}),
    levels: SPARK_LEVELS.map((level) => ({ level, at: SPARK_LEVEL_THRESHOLDS[level], directChatsPerDay: DIRECT_CHATS_PER_DAY[level], ...((CONTACT_LEVELS as readonly string[]).includes(level) ? { helperContact: true as const } : {}) })),
    // Seeing the contact details helpers share (2026-11-24) counts earned Sparks only.
    helperContact: { at: HELPER_CONTACT_EARNED_MIN, unlocked: earned >= HELPER_CONTACT_EARNED_MIN },
    directChatsPerDay: directChatsPerDay(total, plans.keys()),
    planDirectChatsPerDay: PLAN_DIRECT_CHATS_PER_DAY,
    hasPlan,
    ...(hasPlan ? { yourPlanDirectChatsPerDay: Math.max(...[...plans.keys()].map((plan) => PLAN_DIRECT_CHATS_PER_DAY[plan])) } : {}),
    rules: sparkRuleRows(),
    giverMinAccountDays: SPARK_GIVER_RULES.minAccountDays,
    packs: SPARK_PACKS.map((pack) => ({ pack, ...SPARK_PACK_OFFERS[pack] })),
    purchases,
    ...(provider ? {} : { unavailable: true as const }),
    ...(notice ? { notice } : {}),
  };
}
