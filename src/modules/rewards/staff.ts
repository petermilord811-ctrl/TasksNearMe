import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ActionResult, AdminRewardFilter, AdminRewardRow, AdminRewardsPageData, RewardDecisionInput, RewardProgramCode, RewardRiskSignal, RewardStatus, StaffRewardActionId } from '@/contracts';
import { ADMIN_REWARD_FILTERS, rewardDecisionInputSchema } from '@/contracts';
import type { GiftCardProvider } from '@/integrations/gift-cards';
import { users } from '@/modules/accounts/schema';
import { bookingCompletions, bookingTerms, bookings } from '@/modules/bookings/schema';
import { personSummaryOf, type StaffActor } from '@/modules/support/staff';
import { tasks } from '@/modules/tasks/schema';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { REWARD_RULES } from './domain';
import { riskSignalsOf } from './risk';
import { rewardGrants } from './schema';

/**
 * Reward administration for staff (UI-020; B-057; blueprint 05 §1): the review queue with risk signals,
 * approving or rejecting reviews (leads), voiding and reissuing (agents), and program budgets. Every
 * decision is audited with its note.
 */

type GrantRow = typeof rewardGrants.$inferSelect;
const DAY = 86_400_000;

/** At launch: the welcome reward's founding-cohort budget (100 × $50). */
const BUDGETS: Partial<Record<RewardProgramCode, number>> = { welcome: REWARD_RULES.welcome.cohortSize * REWARD_RULES.welcome.amountCents };
const COMMITTED: RewardStatus[] = ['pending', 'qualified', 'in_review', 'redeemable', 'issuing', 'delivered', 'failed'];

const LEADS = ['support_lead', 'admin'] as const;
const WORKERS = ['support_agent', 'support_lead', 'trust_safety', 'admin'] as const;
const has = (staff: StaffActor, roles: readonly string[]) => staff.roles.some((role) => roles.includes(role));

export function staffRewardActions(staff: StaffActor, status: RewardStatus): StaffRewardActionId[] {
  const actions: StaffRewardActionId[] = [];
  if (status === 'in_review' && has(staff, LEADS)) actions.push('approve_review');
  if (status === 'in_review' && has(staff, [...LEADS, 'trust_safety'])) actions.push('reject_review');
  if (status === 'failed' && has(staff, WORKERS)) actions.push('reissue');
  if (!['delivered', 'voided', 'expired', 'issuing'].includes(status) && has(staff, WORKERS)) actions.push('void');
  return actions;
}

async function rowsOf(db: Db, staff: StaffActor, grants: GrantRow[]): Promise<AdminRewardRow[]> {
  if (grants.length === 0) return [];
  const bookingIds = grants.flatMap((grant) => (grant.bookingId ? [grant.bookingId] : []));
  const bookingRows = bookingIds.length
    ? await db
        .select({ booking: bookings, title: tasks.title, breakdown: bookingTerms.breakdown, finalBreakdown: bookingCompletions.finalBreakdown })
        .from(bookings)
        .innerJoin(tasks, eq(tasks.id, bookings.taskId))
        .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
        .leftJoin(bookingCompletions, eq(bookingCompletions.bookingId, bookings.id))
        .where(inArray(bookings.id, bookingIds))
    : [];
  const peopleIds = [...new Set([...grants.map((grant) => grant.helperUserId), ...bookingRows.map((row) => row.booking.posterUserId)])];
  const [people, signalsOf] = await Promise.all([db.select().from(users).where(inArray(users.id, peopleIds)), riskSignalsOf(db, grants)]);
  const personOf = new Map(people.map((user) => [user.id, user]));
  return grants.flatMap((grant): AdminRewardRow[] => {
    const helper = personOf.get(grant.helperUserId);
    if (!helper) return [];
    const row = grant.bookingId ? bookingRows.find((item) => item.booking.id === grant.bookingId) : undefined;
    const client = row ? personOf.get(row.booking.posterUserId) : undefined;
    const signals: RewardRiskSignal[] = signalsOf.get(grant.id) ?? [];
    const status = grant.status as RewardStatus;
    return [
      {
        id: grant.id,
        program: grant.program as RewardProgramCode,
        amountCents: grant.amountCents,
        status,
        helper: personSummaryOf(helper),
        ...(row && client
          ? {
              booking: {
                id: row.booking.id,
                title: row.title,
                client: personSummaryOf(client),
                priceCents: (row.finalBreakdown ?? row.breakdown).taskPriceCents,
                ...(row.booking.completedAt ? { completedAt: row.booking.completedAt.toISOString() } : {}),
              },
            }
          : {}),
        ...(grant.holdUntil ? { holdUntil: grant.holdUntil.toISOString() } : {}),
        createdAt: grant.createdAt.toISOString(),
        signals,
        actions: staffRewardActions(staff, status),
      },
    ];
  });
}

/** Reward rows with their booking, people and risk signals (also used on a person's page). */
export const getAdminRewardRows = rowsOf;

/** `routes.admin.rewards(filter)`: in review oldest first; otherwise newest first. */
export async function getAdminRewards(db: Db, staff: StaffActor, filter: AdminRewardFilter): Promise<AdminRewardsPageData> {
  const all = await db.select().from(rewardGrants).orderBy(desc(rewardGrants.createdAt)).limit(500);
  const selected =
    filter === 'in_review'
      ? all.filter((grant) => grant.status === 'in_review').sort((a, b) => (a.holdUntil?.getTime() ?? 0) - (b.holdUntil?.getTime() ?? 0))
      : filter === 'failed'
        ? all.filter((grant) => grant.status === 'failed')
        : all;
  const programs = [...new Set(all.map((grant) => grant.program as RewardProgramCode)), 'welcome' as RewardProgramCode];
  return {
    filter,
    rows: await rowsOf(db, staff, selected.slice(0, 100)),
    counts: { in_review: all.filter((grant) => grant.status === 'in_review').length, failed: all.filter((grant) => grant.status === 'failed').length, all: all.length },
    budgets: [...new Set(programs)].map((program) => ({
      program,
      ...(BUDGETS[program] !== undefined ? { budgetCents: BUDGETS[program] } : {}),
      committedCents: all.filter((grant) => grant.program === program && COMMITTED.includes(grant.status as RewardStatus)).reduce((sum, grant) => sum + grant.amountCents, 0),
      deliveredCents: all.filter((grant) => grant.program === program && grant.status === 'delivered').reduce((sum, grant) => sum + grant.amountCents, 0),
    })),
  };
}

export const parseRewardFilter = (value: string | string[] | undefined): AdminRewardFilter => {
  const one = Array.isArray(value) ? value[0] : value;
  return (ADMIN_REWARD_FILTERS as readonly string[]).includes(one ?? '') ? (one as AdminRewardFilter) : 'in_review';
};

/** Approve or reject a review, void, or reissue a failed delivery (audited with the note). */
export async function decideReward(db: Db, giftCards: GiftCardProvider | null, staff: StaffActor, input: RewardDecisionInput, now: Date): Promise<ActionResult> {
  const parsed = rewardDecisionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const [grant] = await db.select().from(rewardGrants).where(eq(rewardGrants.id, parsed.data.grantId)).limit(1);
  if (!grant || !staffRewardActions(staff, grant.status as RewardStatus).includes(parsed.data.action)) return { ok: false, code: 'not_allowed' };
  const from = grant.status;
  const guarded = (set: Partial<typeof rewardGrants.$inferInsert>) =>
    db.update(rewardGrants).set({ ...set, updatedAt: now }).where(and(eq(rewardGrants.id, grant.id), eq(rewardGrants.status, from))).returning({ id: rewardGrants.id });
  let moved: { id: string }[] = [];
  switch (parsed.data.action) {
    case 'approve_review':
      moved = await guarded({ status: 'redeemable', redeemableAt: now, expiresAt: new Date(now.getTime() + REWARD_RULES.redeemDays * DAY) });
      break;
    case 'reject_review':
    case 'void':
      moved = await guarded({ status: 'voided', voidReason: 'risk_review' });
      break;
    case 'reissue': {
      if (!giftCards) return { ok: false, code: 'not_allowed' };
      moved = await guarded({ status: 'issuing' });
      if (moved.length > 0) {
        // The grant id stays the order's key (the provider dedupes; a real reissue gets a new order there).
        const result = await giftCards.order({ externalId: grant.id, amountCents: grant.amountCents });
        await db
          .update(rewardGrants)
          .set(result.ok ? { status: 'delivered', providerOrderId: result.orderId, deliveryUrl: result.deliveryUrl, deliveredAt: now, updatedAt: now } : { status: 'failed', updatedAt: now })
          .where(eq(rewardGrants.id, grant.id));
      }
      break;
    }
  }
  if (moved.length === 0) return { ok: false, code: 'not_allowed' };
  await db.insert(auditLog).values({
    id: newId('aud'),
    at: now.toISOString(),
    actorId: staff.id,
    actorRole: staff.roles[0] ?? 'staff',
    action: `reward.${parsed.data.action}`,
    targetType: 'reward_grant',
    targetId: grant.id,
    reason: parsed.data.note,
    metadata: { from, helperUserId: grant.helperUserId },
  });
  return { ok: true, code: 'updated' };
}
