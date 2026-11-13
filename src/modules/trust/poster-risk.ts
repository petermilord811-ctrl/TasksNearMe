import { and, asc, count, eq, gte, inArray, isNull, ne, or } from 'drizzle-orm';
import type { PosterIdReason } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { payments } from '@/modules/payments/schema';
import { supportCases } from '@/modules/support/schema';
import { identityStanding } from '@/modules/verification/standing';
import { identityVerifications } from '@/modules/verification/schema';
import type { Db } from '@/platform/db/connect';

/**
 * When a client has to verify their ID before posting or paying (blueprint 01 P2; contracts
 * `POSTER_ID_REASONS`). Pure rules over a few facts, so the same answer gates the pages and the actions.
 * A cleared ID check ends it, whatever the reason.
 */

export const POSTER_ID_RULES = {
  reportsWithinDays: 30,
  reports: 2,
  failedPaymentsWithinHours: 24,
  failedPayments: 5,
  newAccountDays: 7,
  largeBookingCents: 50_000,
} as const;

const DAY_MS = 86_400_000;
const REPORT_TYPES = ['report_user', 'report_content', 'safety'];

export interface PosterRiskFacts {
  /** A verified ID (and no open name check). */
  cleared: boolean;
  /** Staff asked for a new ID check since the last verified one. */
  staffRequested: boolean;
  recentReports: number;
  recentFailedPayments: number;
  accountCreatedAt: Date;
}

/** Why an ID check is needed now, or null. `amountCents`: what they're about to pay, when they're paying. */
export function posterIdReason(facts: PosterRiskFacts, now: Date, amountCents?: number): PosterIdReason | null {
  if (facts.cleared) return null;
  if (facts.staffRequested) return 'staff_request';
  if (facts.recentReports >= POSTER_ID_RULES.reports) return 'reports';
  if (facts.recentFailedPayments >= POSTER_ID_RULES.failedPayments) return 'failed_payments';
  const newAccount = now.getTime() - facts.accountCreatedAt.getTime() < POSTER_ID_RULES.newAccountDays * DAY_MS;
  if (amountCents !== undefined && newAccount && amountCents >= POSTER_ID_RULES.largeBookingCents) return 'new_account_large_booking';
  return null;
}

export async function posterRiskFacts(db: Db, userId: string, now: Date): Promise<PosterRiskFacts | null> {
  const [user] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const rows = await db.select().from(identityVerifications).where(eq(identityVerifications.userId, userId)).orderBy(asc(identityVerifications.createdAt));
  const standing = identityStanding(rows, now);
  const lastVerified = rows.filter((row) => row.status === 'verified').at(-1)?.createdAt ?? new Date(0);
  const staffRequested = rows.some((row) => row.requestedReason === 'staff_request' && row.createdAt > lastVerified);
  const [reports] = await db
    .select({ value: count() })
    .from(supportCases)
    .where(
      and(
        eq(supportCases.subjectUserId, userId),
        inArray(supportCases.type, REPORT_TYPES),
        gte(supportCases.createdAt, new Date(now.getTime() - POSTER_ID_RULES.reportsWithinDays * DAY_MS)),
        // Reports staff looked at and dismissed don't count.
        or(isNull(supportCases.resolution), ne(supportCases.resolution, 'no_action')),
      ),
    );
  const [failed] = await db
    .select({ value: count() })
    .from(payments)
    .where(and(eq(payments.payerUserId, userId), eq(payments.status, 'failed'), gte(payments.createdAt, new Date(now.getTime() - POSTER_ID_RULES.failedPaymentsWithinHours * 3_600_000))));
  return { cleared: standing.cleared, staffRequested, recentReports: reports?.value ?? 0, recentFailedPayments: failed?.value ?? 0, accountCreatedAt: user.createdAt };
}

/** The requirement for this person now (null: none). Pass the amount when they're about to pay. */
export async function posterIdentityRequirement(db: Db, userId: string, now: Date, amountCents?: number): Promise<{ reason: PosterIdReason } | null> {
  const facts = await posterRiskFacts(db, userId, now);
  const reason = facts ? posterIdReason(facts, now, amountCents) : null;
  return reason ? { reason } : null;
}
