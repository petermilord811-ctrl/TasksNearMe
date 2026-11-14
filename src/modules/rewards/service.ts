import { and, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import type { EmailProvider } from '@/integrations/email';
import type { ActionResult, RewardGrantView, RewardRiskSignal, RewardStatus, RewardVoidReason, RewardsPageData } from '@/contracts';
import type { GiftCardProvider } from '@/integrations/gift-cards';
import { users } from '@/modules/accounts/schema';
import { bookingCompletions, bookingSeries, bookingTerms, bookings } from '@/modules/bookings/schema';
import { getFlags } from '@/modules/markets/queries';
import { earnings } from '@/modules/earnings/schema';
import { tasks } from '@/modules/tasks/schema';
import { computeOnboarding } from '@/modules/verification/progress';
import { loadOnboardingState } from '@/modules/verification/state';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import {
  LAUNCH_PROGRAMS,
  REWARD_RULES,
  WELCOME_QUEUED_STATUSES,
  marketMonthStart,
  nextGrantState,
  nextMarketMonthStart,
  recurringMonthTrigger,
  repeatProgress,
  repeatTrigger,
  rewardOrder,
  type BookingFact,
  type RewardBudgets,
} from './domain';
import { sendGiftCardEmail } from './emails';
import { createGrant, emitRewardEvent, type GrantRow } from './grants';
import { REVIEW_SIGNALS, riskSignalsOf } from './risk';
import { rewardGrants } from './schema';
import { ensureWelcomeGrant, welcomeCardFor } from './welcome';

/**
 * Rewards for helpers (blueprint 05). Booking rewards are derived from booking facts by `syncRewards`, run
 * lazily when the helper looks at their rewards; the welcome gift card comes from the helper's checks
 * (`welcome.ts`, also given out by the job runner). Redeeming orders a gift card through the provider with the
 * grant id as the idempotency key.
 */

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

/** The monthly cap's month: the calendar month in market time. */
const monthStart = marketMonthStart;
const live = (grant: GrantRow) => grant.status !== 'voided';
/** Staff rejected it after a risk review: that program is over for the helper (welcome) or the pair (repeat). */
const rejected = (grant: GrantRow) => grant.status === 'voided' && grant.voidReason === 'risk_review';

/**
 * The recurring-month reward (blueprint 05 variant B): once per series, after the first calendar month in which
 * every visit (at least 2) was completed and paid. The grant's id is the series', so it can never repeat (a
 * rejected one included). Behind the market's `reward.recurring_month` flag.
 */
async function syncRecurringMonth(db: Db, helperUserId: string, grants: GrantRow[], now: Date): Promise<void> {
  const series = await db
    .select({ id: bookingSeries.id, posterUserId: bookingSeries.posterUserId, marketId: bookingSeries.marketId })
    .from(bookingSeries)
    .where(eq(bookingSeries.helperUserId, helperUserId));
  const waiting = series.filter((row) => !grants.some((grant) => grant.id === recurringGrantId(row.id)));
  if (waiting.length === 0) return;
  const visits = await db
    .select({ bookingId: bookings.id, seriesId: bookings.seriesId, startAt: bookings.startAt, status: bookings.status, transferredAt: earnings.transferredAt })
    .from(bookings)
    .leftJoin(earnings, and(eq(earnings.bookingId, bookings.id), eq(earnings.kind, 'earnings')))
    .where(and(eq(bookings.helperUserId, helperUserId), inArray(bookings.seriesId, waiting.map((row) => row.id))));
  for (const row of waiting) {
    const flags = await getFlags(row.marketId, db);
    if (flags['reward.recurring_month'] !== true) continue;
    const trigger = recurringMonthTrigger(
      visits.filter((visit) => visit.seriesId === row.id).map((visit) => ({ bookingId: visit.bookingId, startAt: visit.startAt, status: visit.status, ...(visit.transferredAt ? { transferredAt: visit.transferredAt } : {}) })),
      now,
    );
    if (!trigger) continue;
    await createGrant(db, grants, { id: recurringGrantId(row.id), helperUserId, program: 'recurring_month', amountCents: REWARD_RULES.recurringMonth.amountCents, status: 'pending', bookingId: trigger.bookingId, posterUserId: row.posterUserId, createdAt: now, updatedAt: now }, now);
  }
}

/** One recurring-month grant per series: its id says which. */
const recurringGrantId = (seriesId: string) => `rwd_month_${seriesId}`;

/**
 * Brings the helper's grants up to date with their checks and bookings. Idempotent. `budgets`: the monthly program
 * budgets (`REWARD_BUDGETS` unless given).
 */
export async function syncRewards(db: Db, helperUserId: string, now: Date, options: { budgets?: RewardBudgets } = {}): Promise<void> {
  const [facts, grants] = await Promise.all([helperBookingFacts(db, helperUserId), db.select().from(rewardGrants).where(eq(rewardGrants.helperUserId, helperUserId))]);
  const bookingOf = new Map(facts.map((fact) => [fact.id, fact]));

  // Grants whose hold ended: risk signals decide between review and redeemable.
  const leaving = grants.filter((grant) => grant.status === 'qualified' && grant.holdUntil && grant.holdUntil <= now);
  const signalsOf = leaving.length > 0 ? await riskSignalsOf(db, leaving) : new Map<string, RewardRiskSignal[]>();
  const needsReview = (id: string) => (signalsOf.get(id) ?? []).some((signal) => REVIEW_SIGNALS.includes(signal));

  // Move existing grants along.
  for (const grant of grants) {
    const change = nextGrantState({ program: grant.program, status: grant.status as RewardStatus, holdUntil: grant.holdUntil, expiresAt: grant.expiresAt, needsReview: needsReview(grant.id) }, grant.bookingId ? bookingOf.get(grant.bookingId) : undefined, now);
    if (!change) continue;
    // Ready to redeem: the helper hears about it (`reward_ready`) in the same transaction as the move.
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(rewardGrants)
        .set({ ...change, updatedAt: now })
        .where(and(eq(rewardGrants.id, grant.id), eq(rewardGrants.status, grant.status)))
        .returning();
      if (row?.status === 'redeemable') await emitRewardEvent(tx, 'reward.ready', row);
      return row;
    });
    if (updated) Object.assign(grant, updated);
  }

  // Welcome: the gift card for the helper's three checks (phone, ID, background), and the waiting line.
  await ensureWelcomeGrant(db, helperUserId, now, { grants, ...(options.budgets ? { budgets: options.budgets } : {}) });

  // Repeat: the third paid booking with the same client within 90 days, once per pair.
  for (const posterUserId of new Set(facts.map((fact) => fact.posterUserId))) {
    if (grants.some((grant) => grant.program === 'repeat' && grant.posterUserId === posterUserId && (live(grant) || rejected(grant)))) continue;
    const trigger = repeatTrigger(facts, posterUserId);
    if (trigger) {
      await createGrant(db, grants, { id: newId('rwd'), helperUserId, program: 'repeat', amountCents: REWARD_RULES.repeat.amountCents, status: 'pending', bookingId: trigger.id, posterUserId, createdAt: now, updatedAt: now }, now);
    }
  }

  // Recurring month: a month of regular visits, all completed and paid.
  await syncRecurringMonth(db, helperUserId, grants, now);
}

function grantView(grant: GrantRow, booking: BookingFact | undefined, clientName: string | undefined, now: Date): RewardGrantView {
  const status = grant.status as RewardStatus;
  // A welcome gift card still in line for the month's budget moves on by the next month's start.
  const queued = grant.program === 'welcome' && WELCOME_QUEUED_STATUSES.includes(status);
  const actions: RewardGrantView['actions'] = status === 'redeemable' ? ['redeem'] : status === 'delivered' && grant.deliveryUrl ? ['open_gift_card'] : [];
  return {
    id: grant.id,
    program: grant.program as RewardGrantView['program'],
    amountCents: grant.amountCents,
    status,
    ...(booking ? { booking: { id: booking.id, title: booking.title } } : {}),
    ...(grant.program === 'repeat' && clientName ? { clientDisplayName: clientName } : {}),
    ...(grant.holdUntil && !queued && grant.program !== 'welcome' ? { holdUntil: grant.holdUntil.toISOString() } : {}),
    ...(queued ? { queuedUntil: nextMarketMonthStart(now).toISOString() } : {}),
    ...(grant.redeemableAt ? { redeemableAt: grant.redeemableAt.toISOString() } : {}),
    ...(grant.expiresAt ? { expiresAt: grant.expiresAt.toISOString() } : {}),
    ...(grant.voidReason ? { voidReason: grant.voidReason as RewardVoidReason } : {}),
    ...(grant.deliveryUrl && status === 'delivered' ? { deliveryUrl: grant.deliveryUrl } : {}),
    actions,
  };
}

/** The welcome gift card with where its checks stand in onboarding (in review, skipped). */
async function welcomeCardWithProgress(db: Db, userId: string, now: Date) {
  const state = await loadOnboardingState(db, userId, now);
  return welcomeCardFor(db, userId, now, computeOnboarding(state.facts).progress);
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
  if (!user.helperReady) {
    // Not set up yet: the gift card the three checks earn is the reason to finish.
    const welcome = await welcomeCardWithProgress(db, user.id, now);
    return { ...empty, ...(welcome ? { welcome } : {}) };
  }
  await syncRewards(db, user.id, now);
  const welcome = await welcomeCardWithProgress(db, user.id, now);
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
    .map((grant) => grantView(grant, grant.bookingId ? bookingOf.get(grant.bookingId) : undefined, grant.posterUserId ? nameOf.get(grant.posterUserId) : undefined, now))
    .sort((a, b) => rewardOrder(a.status) - rewardOrder(b.status));
  const progress = posterIds.flatMap((posterId) => {
    if (grants.some((grant) => grant.program === 'repeat' && grant.posterUserId === posterId && live(grant))) return [];
    const found = repeatProgress(facts, posterId, now);
    return found ? [{ clientDisplayName: nameOf.get(posterId) ?? 'Client', paidBookings: found.paidBookings, needed: REWARD_RULES.repeat.needed, windowEndsAt: found.windowEndsAt.toISOString() }] : [];
  });
  return {
    ...empty,
    ...(welcome ? { welcome } : {}),
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

/** Who a gift card is for: the helper's name and email (the provider's page greets them). */
export async function giftCardRecipient(db: Db, helperUserId: string): Promise<{ name: string; email: string } | undefined> {
  const [person] = await db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email }).from(users).where(eq(users.id, helperUserId)).limit(1);
  return person ? { name: [person.firstName, person.lastName].filter(Boolean).join(' '), email: person.email } : undefined;
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
  const recipient = await giftCardRecipient(db, helperUserId);
  const result = await giftCards.order({ externalId: claimed.id, amountCents: claimed.amountCents, ...(recipient ? { recipient } : {}) });
  await db
    .update(rewardGrants)
    .set(result.ok ? { status: 'delivered', providerOrderId: result.orderId, deliveryUrl: result.deliveryUrl, deliveredAt: now, updatedAt: now } : { status: 'failed', updatedAt: now })
    .where(eq(rewardGrants.id, claimed.id));
  // The link also goes by email (B-051), in case the page is closed before it's opened.
  if (result.ok && deps.email) await sendGiftCardEmail({ db, email: deps.email.provider, appUrl: deps.email.appUrl }, { ...claimed, deliveryUrl: result.deliveryUrl });
  return result.ok ? { ok: true, code: 'submitted' } : { ok: false, code: 'unknown' };
}
