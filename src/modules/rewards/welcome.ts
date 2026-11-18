import { and, asc, desc, eq, gte, inArray, isNotNull, ne, notExists, or, sql } from 'drizzle-orm';
import { type OnboardingProgress, type OnboardingStepState, type RewardStatus, type WelcomeGiftCard, type WelcomeGiftCheck } from '@/contracts';
import { smsAvailable } from '@/integrations/sms';
import { users } from '@/modules/accounts/schema';
import { getFlags } from '@/modules/markets/queries';
import { areas, markets } from '@/modules/markets/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import {
  BUDGET_TIME_ZONE,
  REWARD_BUDGETS,
  REWARD_RULES,
  WELCOME_QUEUED_STATUSES,
  WELCOME_RELEASED_STATUSES,
  marketMonthStart,
  nextMarketMonthStart,
  welcomeChecksDone,
  welcomeChecksFor,
  welcomeEarnedAt,
  welcomeReleases,
  type RewardBudgets,
  type WelcomeFacts,
} from './domain';
import { createGrant, emitRewardEvent, type GrantRow } from './grants';
import { rewardGrants } from './schema';

/**
 * The welcome gift card (blueprint 05 §2; the owner's rule of 2026-11-14): $50 for every helper whose phone, ID
 * (both stages) and background checks have passed. No booking, no window, no cohort. The founding numbers stay a
 * badge for the first 100 helpers in a market (`founding.ts`).
 *
 * Life of a grant: earned → `pending` (in line, with a `reward.earned` event for the helper's notification) →
 * `in_review` when it leaves the line, oldest first, while the calendar month's budget has room (`holdUntil` is
 * that moment) → `redeemable` once our team's quick check approves it (`reward.ready`) → delivered as the gift card
 * the helper picks. Three paths give it out, all idempotent: the verification events (src/modules/badges/
 * reactions.ts), the job runner's sweep (`runWelcomeRewards`, which also gave cards to helpers verified before the
 * change), and the rewards page's lazy sync.
 */

interface WelcomePerson extends WelcomeFacts {
  status: string;
  isHelper: boolean;
  marketId: string;
  foundingNumber: number | null;
}

const toDate = (value: string | Date | null) => (value === null ? null : new Date(value));

async function welcomePerson(db: Db, userId: string): Promise<WelcomePerson | null> {
  const [row] = await db
    .select({
      status: users.status,
      phoneVerifiedAt: users.phoneVerifiedAt,
      homeMarket: users.homeMarketId,
      profileUserId: helperProfiles.userId,
      idVerifiedAt: helperProfiles.idVerifiedAt,
      backgroundCheckedAt: helperProfiles.backgroundCheckedAt,
      foundingNumber: helperProfiles.foundingNumber,
      areaMarket: areas.marketId,
    })
    .from(users)
    .leftJoin(helperProfiles, eq(helperProfiles.userId, users.id))
    .leftJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    status: row.status,
    isHelper: row.profileUserId !== null,
    marketId: row.areaMarket ?? row.homeMarket,
    foundingNumber: row.foundingNumber ?? null,
    phoneVerifiedAt: row.phoneVerifiedAt,
    idVerifiedAt: toDate(row.idVerifiedAt),
    backgroundCheckedAt: toDate(row.backgroundCheckedAt),
  };
}

const programOn = async (db: Db, marketId: string) => (await getFlags(marketId, db))['reward.welcome'] === true;

/** Staff turned the helper's welcome gift card down after a review: the program is over for them. */
const turnedDown = (grant: GrantRow) => grant.program === 'welcome' && grant.status === 'voided' && grant.voidReason === 'risk_review';

/**
 * Gives the helper their welcome gift card as soon as it's earned: a helper profile, an active account, the program
 * on in their market, and the three checks passed. The grant starts in line (`pending`) with its `reward.earned`
 * event, within the helper's monthly cap like every grant; then the line moves (`release: false` leaves that to
 * the caller). Returns the helper's live welcome grant (new or existing), or null.
 */
export async function ensureWelcomeGrant(
  db: Db,
  userId: string,
  now: Date,
  options: { budgets?: RewardBudgets; grants?: GrantRow[]; release?: boolean } = {},
): Promise<GrantRow | null> {
  const grants = options.grants ?? (await db.select().from(rewardGrants).where(eq(rewardGrants.helperUserId, userId)));
  const existing = grants.find((grant) => grant.program === 'welcome' && grant.status !== 'voided');
  if (existing) {
    // Still in line: the line moves now if the month has room again (a voided card freed its share).
    if (options.release !== false && WELCOME_QUEUED_STATUSES.includes(existing.status as RewardStatus) && (await releaseWelcomeQueue(db, now, options.budgets)).includes(existing.id)) {
      Object.assign(existing, { status: 'in_review', holdUntil: now, updatedAt: now });
    }
    return existing;
  }
  if (grants.some(turnedDown)) return null;
  const person = await welcomePerson(db, userId);
  if (!person?.isHelper || person.status !== 'active' || !welcomeEarnedAt(person, welcomeChecksFor(smsAvailable()))) return null;
  if (!(await programOn(db, person.marketId))) return null;
  const created = await createGrant(
    db,
    grants,
    { id: newId('rwd'), helperUserId: userId, program: 'welcome', amountCents: REWARD_RULES.welcome.amountCents, status: 'pending', createdAt: now, updatedAt: now },
    now,
    (tx, row) => emitRewardEvent(tx, 'reward.earned', row),
  );
  if (!created) return null;
  if (options.release !== false && (await releaseWelcomeQueue(db, now, options.budgets)).includes(created.id)) {
    Object.assign(created, { status: 'in_review', holdUntil: now, updatedAt: now });
  }
  return created;
}

/**
 * Moves the welcome gift cards waiting in line to review, oldest first, while this calendar month's budget (market
 * time) has room: what left the line this month counts against it. Behind one advisory lock, so parallel callers
 * can't pass the budget together (T-26). Returns the grants that left the line.
 */
export async function releaseWelcomeQueue(db: Db, now: Date, budgets: RewardBudgets = REWARD_BUDGETS): Promise<string[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('reward-budget:welcome'))`);
    const queue = await tx
      .select({ id: rewardGrants.id, amountCents: rewardGrants.amountCents })
      .from(rewardGrants)
      .where(and(eq(rewardGrants.program, 'welcome'), inArray(rewardGrants.status, [...WELCOME_QUEUED_STATUSES])))
      .orderBy(asc(rewardGrants.createdAt), asc(rewardGrants.id));
    if (queue.length === 0) return [];
    const [released] = await tx
      .select({ cents: sql<number>`coalesce(sum(${rewardGrants.amountCents}), 0)::int` })
      .from(rewardGrants)
      .where(and(eq(rewardGrants.program, 'welcome'), inArray(rewardGrants.status, [...WELCOME_RELEASED_STATUSES]), gte(rewardGrants.holdUntil, marketMonthStart(now, BUDGET_TIME_ZONE))));
    const ids = welcomeReleases(queue, released?.cents ?? 0, budgets.welcome);
    if (ids.length === 0) return [];
    const moved = await tx
      .update(rewardGrants)
      .set({ status: 'in_review', holdUntil: now, updatedAt: now })
      .where(and(inArray(rewardGrants.id, ids), inArray(rewardGrants.status, [...WELCOME_QUEUED_STATUSES])))
      .returning({ id: rewardGrants.id });
    return moved.map((row) => row.id);
  });
}

/**
 * The job runner's sweep (every minute): every helper whose three checks have passed and who holds no welcome gift
 * card yet gets one (this also gave cards to the helpers verified before 2026-11-14), then the line moves. Only
 * markets with the program on are looked at, so helpers where it's off never crowd the batch.
 */
export async function runWelcomeRewards(db: Db, now: Date, options: { budgets?: RewardBudgets; limit?: number } = {}): Promise<number> {
  const marketIds = (await db.select({ id: markets.id }).from(markets)).map((row) => row.id);
  const on = (await Promise.all(marketIds.map(async (id) => ((await programOn(db, id)) ? id : null)))).filter((id): id is string => id !== null);
  let made = 0;
  if (on.length > 0) {
    const waiting = await db
      .select({ userId: helperProfiles.userId })
      .from(helperProfiles)
      .innerJoin(users, eq(users.id, helperProfiles.userId))
      .leftJoin(areas, eq(areas.id, helperProfiles.areaId))
      .where(
        and(
          isNotNull(helperProfiles.idVerifiedAt),
          isNotNull(helperProfiles.backgroundCheckedAt),
          // The phone counts only where texts work (plan 9.2).
          ...(smsAvailable() ? [isNotNull(users.phoneVerifiedAt)] : []),
          eq(users.status, 'active'),
          inArray(sql`coalesce(${areas.marketId}, ${users.homeMarketId})`, on),
          notExists(
            db
              .select({ one: sql`1` })
              .from(rewardGrants)
              .where(
                and(
                  eq(rewardGrants.helperUserId, helperProfiles.userId),
                  eq(rewardGrants.program, 'welcome'),
                  or(ne(rewardGrants.status, 'voided'), eq(rewardGrants.voidReason, 'risk_review')),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(helperProfiles.backgroundCheckedAt), asc(helperProfiles.userId))
      .limit(options.limit ?? 200);
    for (const row of waiting) {
      if (await ensureWelcomeGrant(db, row.userId, now, { ...(options.budgets ? { budgets: options.budgets } : {}), release: false })) made += 1;
    }
  }
  await releaseWelcomeQueue(db, now, options.budgets);
  return made;
}

/**
 * The welcome gift card as the helper sees it (`WelcomeGiftCard`): where the three checks stand (from onboarding's
 * `progress` when given, so "in review" and "skipped" show), and the grant's state once it's earned. A helper whose
 * checks have all passed gets the grant right here if the event hasn't given it yet, so the page never shows three
 * done checks without the card. Absent when the program is off in their market, the card expired unredeemed, or
 * our team turned it down.
 */
export async function welcomeCardFor(db: Db, userId: string, now: Date, progress?: OnboardingProgress): Promise<WelcomeGiftCard | undefined> {
  const person = await welcomePerson(db, userId);
  if (!person || !(await programOn(db, person.marketId))) return undefined;
  const grants = await db
    .select()
    .from(rewardGrants)
    .where(and(eq(rewardGrants.helperUserId, userId), eq(rewardGrants.program, 'welcome')))
    .orderBy(desc(rewardGrants.createdAt));
  let live = grants.find((grant) => grant.status !== 'voided');
  if (!live && grants.some(turnedDown)) return undefined;
  const checks = welcomeChecksFor(smsAvailable());
  if (!live && person.isHelper && welcomeEarnedAt(person, checks)) live = (await ensureWelcomeGrant(db, userId, now)) ?? undefined;
  const done = new Set(welcomeChecksDone(person, checks));
  const stepState = (check: WelcomeGiftCheck): OnboardingStepState => {
    if (done.has(check)) return 'done';
    // The checks are onboarding steps of the same names.
    const step = progress?.steps.find((entry) => entry.step === check);
    return step && step.state !== 'done' ? step.state : 'todo';
  };
  const base: WelcomeGiftCard = {
    state: 'open',
    amountCents: live?.amountCents ?? REWARD_RULES.welcome.amountCents,
    checks: checks.map((check) => ({ check, state: stepState(check) })),
    ...(person.foundingNumber !== null ? { foundingNumber: person.foundingNumber } : {}),
  };
  if (!live) return base;
  switch (live.status) {
    case 'pending':
    case 'qualified':
      return { ...base, state: 'earned', queuedUntil: nextMarketMonthStart(now, BUDGET_TIME_ZONE).toISOString() };
    case 'in_review':
    case 'failed':
      return { ...base, state: 'earned' };
    case 'redeemable':
      return { ...base, state: 'ready', ...(live.expiresAt ? { expiresAt: live.expiresAt.toISOString() } : {}) };
    case 'issuing':
    case 'delivered':
      return { ...base, state: 'delivered' };
    default:
      return undefined;
  }
}
