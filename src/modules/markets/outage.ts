import { and, desc, eq, inArray } from 'drizzle-orm';
import { outageSwitchInputSchema, type ActionResult, type AdminOutageSwitch, type OutageSwitchInput, type ShellNotice } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import type { StaffActor } from '@/modules/support/staff';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { featureFlags, markets } from './schema';

/**
 * The outage switch (completion plan 5.15; docs/runbooks/payments-incident.md). A market-specific feature flag
 * row: on, nobody in the market can start a booking (book an offer, request a helper or take their counter,
 * accept a rebook or regular visits, or a helper accept a request), tip, or pay for a change. Each of those
 * refuses with `paused` before any money moves, and every signed-in page says so. Bookings that exist go ahead:
 * scheduled charges, Pay now, finishing a bank step already started, refunds, transfers and payouts carry on,
 * because stopping them only pushes bookings into cancellation at their deadlines (`JOBS_DISABLED` is the
 * runbook's lever for the job runner). Posting, offers and messages are unaffected. Admins switch it at
 * `/admin/config` with a reason; every switch is audited.
 */

export const OUTAGE_FLAG = 'pause.bookings';
const AUDIT_ACTION = 'config.outage_switch';

/** What a refused booking or payment returns while the switch is on. */
export const PAUSED: ActionResult = { ok: false, code: 'paused' };

/** Whether the market's outage switch is on (a market row overrides a global one, as with every flag). */
export async function bookingsPaused(db: Db, marketId: string): Promise<boolean> {
  const rows = await db
    .select({ marketId: featureFlags.marketId, enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(and(eq(featureFlags.key, OUTAGE_FLAG), inArray(featureFlags.marketId, ['global', marketId])));
  const own = rows.find((row) => row.marketId === marketId) ?? rows.find((row) => row.marketId === 'global');
  return own?.enabled === true;
}

/** `PAUSED` when the market's switch is on, otherwise null: `const paused = await pausedIn(db, id); if (paused) return paused;`. */
export async function pausedIn(db: Db, marketId: string): Promise<ActionResult | null> {
  return (await bookingsPaused(db, marketId)) ? PAUSED : null;
}

/** The notices for the signed-in shell: the switch of the person's home market. */
export async function shellNoticesFor(db: Db, userId: string): Promise<ShellNotice[]> {
  const [user] = await db.select({ marketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1);
  return user && (await bookingsPaused(db, user.marketId)) ? ['bookings_paused'] : [];
}

const isoOf = (value: string | Date) => new Date(value instanceof Date ? value : value.includes('T') ? value : value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toISOString();

/** The switch for the config page: on or off, and the last change from the audit log. */
export async function getOutageSwitch(db: Db, marketId: string): Promise<AdminOutageSwitch> {
  const [paused, [last]] = await Promise.all([
    bookingsPaused(db, marketId),
    db
      .select({ at: auditLog.at, reason: auditLog.reason, by: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(and(eq(auditLog.action, AUDIT_ACTION), eq(auditLog.targetType, 'market'), eq(auditLog.targetId, marketId)))
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(1),
  ]);
  return { paused, ...(last ? { changed: { at: isoOf(last.at), by: last.by ?? 'Staff', reason: last.reason ?? '' } } : {}) };
}

/** An admin turns the market's switch on or off. Switching to the state it's already in changes nothing. */
export async function setOutageSwitch(db: Db, staff: StaffActor, marketId: string, input: OutageSwitchInput, now: Date): Promise<ActionResult> {
  // Market config is for admins (blueprint 08 §4; `canManageConfig` in ./admin-config, which imports this file).
  if (!staff.roles.includes('admin')) return { ok: false, code: 'not_allowed' };
  const parsed = outageSwitchInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const [market] = await db.select({ id: markets.id, name: markets.name }).from(markets).where(eq(markets.id, String(marketId))).limit(1);
  if (!market) return { ok: false, code: 'not_found' };
  const paused = parsed.data.state === 'paused';
  if ((await bookingsPaused(db, market.id)) === paused) return { ok: true, code: 'updated' };
  await db.transaction(async (tx) => {
    await tx
      .insert(featureFlags)
      .values({ key: OUTAGE_FLAG, marketId: market.id, enabled: paused, description: `Outage switch: new bookings and payments in ${market.name} wait (completion plan 5.15)` })
      .onConflictDoUpdate({ target: [featureFlags.key, featureFlags.marketId], set: { enabled: paused, updatedAt: now.toISOString() } });
    await tx.insert(auditLog).values({
      id: newId('aud'),
      at: now.toISOString(),
      actorId: staff.id,
      actorRole: 'admin',
      action: AUDIT_ACTION,
      targetType: 'market',
      targetId: market.id,
      reason: parsed.data.reason,
      metadata: { paused },
    });
  });
  return { ok: true, code: 'updated' };
}
