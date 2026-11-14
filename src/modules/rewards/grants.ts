import { and, eq, gte, ne, sql } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { REWARD_RULES, marketMonthStart } from './domain';
import { rewardGrants } from './schema';

export type GrantRow = typeof rewardGrants.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const centsOf = () => sql<number>`coalesce(sum(${rewardGrants.amountCents}), 0)::int`;

/**
 * Creates a grant within the helper's monthly cap (at most $75 a calendar month across programs, blueprint 05 §1),
 * or not at all: it waits, and a later sync tries again (in a later month, or once a void frees room). The check
 * and the insert share one transaction behind the helper's advisory lock, so parallel qualifications can't pass
 * the cap (T-26). `announce` adds outbox events in the same transaction (the welcome gift card's notification).
 * Returns the new row, or null (over the cap, or another request made the same grant first).
 */
export async function createGrant(db: Db, grants: GrantRow[], values: typeof rewardGrants.$inferInsert, now: Date, announce?: (tx: Tx, row: GrantRow) => Promise<void>): Promise<GrantRow | null> {
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`reward-cap:${values.helperUserId}`}))`);
    const [month] = await tx
      .select({ cents: centsOf() })
      .from(rewardGrants)
      .where(and(eq(rewardGrants.helperUserId, values.helperUserId), ne(rewardGrants.status, 'voided'), gte(rewardGrants.createdAt, marketMonthStart(now))));
    if ((month?.cents ?? 0) + values.amountCents > REWARD_RULES.monthlyCapCents) return null;
    // Another request created the same grant first (the partial unique indexes, or a fixed id): nothing to add.
    const [row] = await tx.insert(rewardGrants).values(values).onConflictDoNothing().returning();
    if (row && announce) await announce(tx, row);
    return row ?? null;
  });
  if (created) grants.push(created);
  return created;
}

/**
 * `reward.earned` / `reward.ready` in the outbox: the dispatcher turns them into the helper's notification
 * (`reward_earned`, `reward_ready`).
 */
export async function emitRewardEvent(tx: Pick<Db, 'insert'>, type: 'reward.earned' | 'reward.ready', grant: Pick<GrantRow, 'id' | 'helperUserId' | 'program' | 'amountCents'>): Promise<void> {
  await tx.insert(outboxEvents).values({
    id: newId('evt'),
    type,
    aggregateType: 'reward_grant',
    aggregateId: grant.id,
    payload: { userId: grant.helperUserId, grantId: grant.id, program: grant.program, amountCents: grant.amountCents },
  });
}
