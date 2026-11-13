import { and, asc, eq, gte, inArray, isNotNull, lte, ne } from 'drizzle-orm';
import type { EmailProvider } from '@/integrations/email';
import type { ActionResult, RewardGrantView, RewardRiskSignal, RewardStatus, RewardVoidReason, RewardsPageData } from '@/contracts';
import type { GiftCardProvider } from '@/integrations/gift-cards';
import { users } from '@/modules/accounts/schema';
import { bookingCompletions, bookingTerms, bookings } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { tasks } from '@/modules/tasks/schema';
import { identityVerifications } from '@/modules/verification/schema';
import type { Db } from '@/platform/db/connect';
import { isUniqueViolation } from '@/platform/db/errors';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import { LAUNCH_PROGRAMS, REWARD_RULES, nextGrantState, repeatProgress, repeatTrigger, rewardOrder, welcomeCandidate, type BookingFact } from './domain';
import { sendGiftCardEmail } from './emails';
import { REVIEW_SIGNALS, riskSignalsOf } from './risk';
import { rewardGrants } from './schema';

/**
 * Rewards for helpers (blueprint 05). Grants are derived from booking facts by `syncRewards`, run
 * lazily when the helper looks at their rewards (the job runner takes this over later). Redeeming
 * orders a gift card through the provider with the grant id as the idempotency key.
 */

type GrantRow = typeof rewardGrants.$inferSelect;
const REDEEM_RULE = { limit: 10, windowSeconds: 60 * 60 };

async function helperBookingFacts(db: Db, helperUserId: string): Promise<BookingFact[]> {
  const rows = await db
    .select({
      id: bookings.id,
      title: tasks.title,
      posterUserId: bookings.posterUserId,
      status: bookings.status,
      confirmedAt: bookings.confirmedAt,
      termsVersion: bookings.termsVersion,
    })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .where(and(eq(bookings.helperUserId, helperUserId), isNotNull(bookings.confirmedAt)));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [terms, completions, transfers] = await Promise.all([
    db.select({ bookingId: bookingTerms.bookingId, version: bookingTerms.version, breakdown: bookingTerms.breakdown }).from(bookingTerms).where(inArray(bookingTerms.bookingId, ids)),
    db.select({ bookingId: bookingCompletions.bookingId, finalBreakdown: bookingCompletions.finalBreakdown }).from(bookingCompletions).where(inArray(bookingCompletions.bookingId, ids)),
    db
      .select({ bookingId: earnings.bookingId, transferredAt: earnings.transferredAt })
      .from(earnings)
      .where(and(inArray(earnings.bookingId, ids), eq(earnings.kind, 'earnings'), isNotNull(earnings.transferredAt))),
  ]);
  return rows.map((row) => {
    const current = terms.find((term) => term.bookingId === row.id && term.version === row.termsVersion);
    const completion = completions.find((item) => item.bookingId === row.id);
    const transfer = transfers.find((item) => item.bookingId === row.id);
    return {
      id: row.id,
      title: row.title,
      posterUserId: row.posterUserId,
      status: row.status,
      fundedAt: row.confirmedAt!,
      priceCents: current?.breakdown.taskPriceCents ?? 0,
      ...(completion ? { finalPriceCents: completion.finalBreakdown.taskPriceCents } : {}),
      ...(transfer?.transferredAt ? { transferredAt: transfer.transferredAt } : {}),
    };
  });
}

/** The helper's place among verified helpers (the founding cohort is the first 100). */
async function cohortFacts(db: Db, helperUserId: string): Promise<{ verifiedAt: Date; rank: number } | null> {
  const [mine] = await db
    .select({ verifiedAt: identityVerifications.verifiedAt })
    .from(identityVerifications)
    .where(and(eq(identityVerifications.userId, helperUserId), eq(identityVerifications.status, 'verified'), isNotNull(identityVerifications.verifiedAt)))
    .orderBy(asc(identityVerifications.verifiedAt))
    .limit(1);
  if (!mine?.verifiedAt) return null;
  const earlier = await db
    .selectDistinct({ userId: identityVerifications.userId })
    .from(identityVerifications)
    .where(and(eq(identityVerifications.status, 'verified'), lte(identityVerifications.verifiedAt, mine.verifiedAt), ne(identityVerifications.userId, helperUserId)));
  return { verifiedAt: mine.verifiedAt, rank: earlier.length + 1 };
}

const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const live = (grant: GrantRow) => grant.status !== 'voided';
/** Staff rejected it after a risk review: that program is over for the helper (welcome) or the pair (repeat). */
const rejected = (grant: GrantRow) => grant.status === 'voided' && grant.voidReason === 'risk_review';

async function createGrant(db: Db, grants: GrantRow[], values: typeof rewardGrants.$inferInsert, now: Date): Promise<void> {
  // At most $75 a calendar month across programs (the grant waits for a later month otherwise).
  const thisMonth = grants.filter((grant) => live(grant) && grant.createdAt >= monthStart(now)).reduce((sum, grant) => sum + grant.amountCents, 0);
  if (thisMonth + values.amountCents > REWARD_RULES.monthlyCapCents) return;
  try {
    const [row] = await db.insert(rewardGrants).values(values).returning();
    if (row) grants.push(row);
  } catch (error) {
    // Another request created it first (the partial unique indexes).
    if (!isUniqueViolation(error)) throw error;
  }
}

/** Brings the helper's grants up to date with their bookings. Idempotent. */
export async function syncRewards(db: Db, helperUserId: string, now: Date): Promise<void> {
  const [facts, cohort, grants] = await Promise.all([
    helperBookingFacts(db, helperUserId),
    cohortFacts(db, helperUserId),
    db.select().from(rewardGrants).where(eq(rewardGrants.helperUserId, helperUserId)),
  ]);
  const bookingOf = new Map(facts.map((fact) => [fact.id, fact]));

  // Grants whose hold ended: risk signals decide between review and redeemable.
  const leaving = grants.filter((grant) => grant.status === 'qualified' && grant.holdUntil && grant.holdUntil <= now);
  const signalsOf = leaving.length > 0 ? await riskSignalsOf(db, leaving) : new Map<string, RewardRiskSignal[]>();
  const needsReview = (id: string) => (signalsOf.get(id) ?? []).some((signal) => REVIEW_SIGNALS.includes(signal));

  // Move existing grants along.
  for (const grant of grants) {
    const change = nextGrantState({ program: grant.program, status: grant.status as RewardStatus, holdUntil: grant.holdUntil, expiresAt: grant.expiresAt, needsReview: needsReview(grant.id) }, grant.bookingId ? bookingOf.get(grant.bookingId) : undefined, now);
    if (!change) continue;
    const [updated] = await db
      .update(rewardGrants)
      .set({ ...change, updatedAt: now })
      .where(and(eq(rewardGrants.id, grant.id), eq(rewardGrants.status, grant.status)))
      .returning();
    if (updated) Object.assign(grant, updated);
  }

  // Welcome: the founding cohort's first qualifying booking within 60 days of the ID check.
  if (cohort && cohort.rank <= REWARD_RULES.welcome.cohortSize && !grants.some((grant) => grant.program === 'welcome' && (live(grant) || rejected(grant)))) {
    const used = new Set(grants.filter((grant) => grant.program === 'welcome').map((grant) => grant.bookingId));
    const candidate = welcomeCandidate(facts.filter((fact) => !used.has(fact.id)), cohort.verifiedAt);
    if (candidate) {
      await createGrant(db, grants, { id: newId('rwd'), helperUserId, program: 'welcome', amountCents: REWARD_RULES.welcome.amountCents, status: 'pending', bookingId: candidate.id, createdAt: now, updatedAt: now }, now);
    }
  }

  // Repeat: the third paid booking with the same client within 90 days, once per pair.
  for (const posterUserId of new Set(facts.map((fact) => fact.posterUserId))) {
    if (grants.some((grant) => grant.program === 'repeat' && grant.posterUserId === posterUserId && (live(grant) || rejected(grant)))) continue;
    const trigger = repeatTrigger(facts, posterUserId);
    if (trigger) {
      await createGrant(db, grants, { id: newId('rwd'), helperUserId, program: 'repeat', amountCents: REWARD_RULES.repeat.amountCents, status: 'pending', bookingId: trigger.id, posterUserId, createdAt: now, updatedAt: now }, now);
    }
  }
}

function grantView(grant: GrantRow, booking: BookingFact | undefined, clientName: string | undefined): RewardGrantView {
  const status = grant.status as RewardStatus;
  const actions: RewardGrantView['actions'] = status === 'redeemable' ? ['redeem'] : status === 'delivered' && grant.deliveryUrl ? ['open_gift_card'] : [];
  return {
    id: grant.id,
    program: grant.program as RewardGrantView['program'],
    amountCents: grant.amountCents,
    status,
    ...(booking ? { booking: { id: booking.id, title: booking.title } } : {}),
    ...(grant.program === 'repeat' && clientName ? { clientDisplayName: clientName } : {}),
    ...(grant.holdUntil ? { holdUntil: grant.holdUntil.toISOString() } : {}),
    ...(grant.redeemableAt ? { redeemableAt: grant.redeemableAt.toISOString() } : {}),
    ...(grant.expiresAt ? { expiresAt: grant.expiresAt.toISOString() } : {}),
    ...(grant.voidReason ? { voidReason: grant.voidReason as RewardVoidReason } : {}),
    ...(grant.deliveryUrl && status === 'delivered' ? { deliveryUrl: grant.deliveryUrl } : {}),
    actions,
  };
}

/** `/app/rewards` for a helper (after bringing the grants up to date). */
export async function getRewardsPage(db: Db, user: { id: string; helperReady: boolean }, now: Date): Promise<RewardsPageData> {
  const empty: RewardsPageData = {
    helperReady: user.helperReady,
    totals: { pendingCents: 0, redeemableCents: 0, redeemedThisYearCents: 0 },
    grants: [],
    repeatProgress: [],
    programs: LAUNCH_PROGRAMS,
    monthly: { capCents: REWARD_RULES.monthlyCapCents, usedCents: 0 },
  };
  if (!user.helperReady) return empty;
  await syncRewards(db, user.id, now);
  const [grants, facts] = await Promise.all([
    db.select().from(rewardGrants).where(eq(rewardGrants.helperUserId, user.id)),
    helperBookingFacts(db, user.id),
  ]);
  const posterIds = [...new Set(facts.map((fact) => fact.posterUserId))];
  const names = posterIds.length > 0 ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, posterIds)) : [];
  const nameOf = new Map(names.map((row) => [row.id, row.name]));
  const bookingOf = new Map(facts.map((fact) => [fact.id, fact]));

  const sum = (list: GrantRow[]) => list.reduce((total, grant) => total + grant.amountCents, 0);
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const views = grants
    .map((grant) => grantView(grant, grant.bookingId ? bookingOf.get(grant.bookingId) : undefined, grant.posterUserId ? nameOf.get(grant.posterUserId) : undefined))
    .sort((a, b) => rewardOrder(a.status) - rewardOrder(b.status));
  const progress = posterIds.flatMap((posterId) => {
    if (grants.some((grant) => grant.program === 'repeat' && grant.posterUserId === posterId && live(grant))) return [];
    const found = repeatProgress(facts, posterId, now);
    return found ? [{ clientDisplayName: nameOf.get(posterId) ?? 'Client', paidBookings: found.paidBookings, needed: REWARD_RULES.repeat.needed, windowEndsAt: found.windowEndsAt.toISOString() }] : [];
  });
  return {
    ...empty,
    totals: {
      pendingCents: sum(grants.filter((grant) => ['pending', 'qualified', 'in_review', 'issuing'].includes(grant.status))),
      redeemableCents: sum(grants.filter((grant) => grant.status === 'redeemable')),
      redeemedThisYearCents: sum(grants.filter((grant) => grant.status === 'delivered' && grant.deliveredAt && grant.deliveredAt >= yearStart)),
    },
    grants: views,
    repeatProgress: progress,
    monthly: { capCents: REWARD_RULES.monthlyCapCents, usedCents: sum(grants.filter((grant) => live(grant) && grant.createdAt >= monthStart(now))) },
  };
}

/** Redeems a redeemable grant: the gift card is ordered (the grant id is the idempotency key) and delivered as a link. */
export async function redeemReward(
  deps: { db: Db; giftCards: GiftCardProvider | null; email?: { provider: EmailProvider; appUrl: string } },
  helperUserId: string,
  grantId: string,
  now: Date,
): Promise<ActionResult> {
  const { db, giftCards } = deps;
  if (!giftCards) return { ok: false, code: 'unknown' };
  const limited = await consumeRateLimit(db, `rewards:${helperUserId}`, REDEEM_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  await syncRewards(db, helperUserId, now);
  const [claimed] = await db
    .update(rewardGrants)
    .set({ status: 'issuing', updatedAt: now })
    .where(and(eq(rewardGrants.id, String(grantId)), eq(rewardGrants.helperUserId, helperUserId), eq(rewardGrants.status, 'redeemable'), gte(rewardGrants.expiresAt, now)))
    .returning();
  if (!claimed) return { ok: false, code: 'not_allowed' };
  const result = await giftCards.order({ externalId: claimed.id, amountCents: claimed.amountCents });
  await db
    .update(rewardGrants)
    .set(result.ok ? { status: 'delivered', providerOrderId: result.orderId, deliveryUrl: result.deliveryUrl, deliveredAt: now, updatedAt: now } : { status: 'failed', updatedAt: now })
    .where(eq(rewardGrants.id, claimed.id));
  // The link also goes by email (B-051), in case the page is closed before it's opened.
  if (result.ok && deps.email) await sendGiftCardEmail({ db, email: deps.email.provider, appUrl: deps.email.appUrl }, { ...claimed, deliveryUrl: result.deliveryUrl });
  return result.ok ? { ok: true, code: 'submitted' } : { ok: false, code: 'unknown' };
}
