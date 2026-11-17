import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { marketStatusInputSchema, type ActionResult, type MarketStatusInput } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import type { StaffActor } from '@/modules/support/staff';
import { emitVerificationEvent } from '@/modules/verification/state';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { helpersCoveredBy, isOpenMarketStatus, marketStatusChange, type MarketStatus } from './coverage';
import { markets } from './schema';

/**
 * Opening cities in turn (owner, 2026-11-14). An admin moves a market between pre-launch, live and paused, with a
 * reason, audited. A market that becomes open (pre-launch or live) brings in the helpers who waited outside every
 * open market with a ZIP it covers: their home market becomes this one, and they're told to choose a
 * neighborhood (the `city_open` notification). Their checks carry over; the home address is asked for next.
 *
 * Until dates follow each market's own time zone (completion plan 8.1), a market outside America/Chicago can't
 * go live (`marketStatusChange`).
 */
export async function setMarketStatus(db: Db, staff: StaffActor, marketId: string, input: MarketStatusInput, now: Date): Promise<ActionResult> {
  if (!staff.roles.includes('admin')) return { ok: false, code: 'not_allowed' };
  const parsed = marketStatusInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const next = parsed.data.status as MarketStatus;
  const [market] = await db.select().from(markets).where(eq(markets.id, String(marketId))).limit(1);
  if (!market) return { ok: false, code: 'not_found' };
  const change = marketStatusChange(market, next);
  if (!change.ok) {
    // The same status again changes nothing. A market whose time zone dates can't be shown in yet can't open: the
    // refusal names the market's zone (its `timeZone`), so the config page says why instead of blaming the status.
    return change.code === 'unchanged' ? { ok: true, code: 'updated' } : { ok: false, code: 'validation_failed', fieldErrors: { timeZone: ['not_supported'] } };
  }
  await db.transaction(async (tx) => {
    await tx.update(markets).set({ status: next, updatedAt: now.toISOString() }).where(eq(markets.id, market.id));
    const opened = { ...market, status: next };
    const covered = isOpenMarketStatus(next) ? await waitingHelpersFor(tx, opened) : [];
    for (const helper of covered) {
      await tx.update(users).set({ homeMarketId: market.id, updatedAt: now }).where(eq(users.id, helper.userId));
      await emitVerificationEvent(tx, helper.userId, 'helper', 'city_open', { city: market.name });
    }
    await tx.insert(auditLog).values({
      id: newId('aud'),
      actorId: staff.id,
      actorRole: 'admin',
      action: 'config.market_status',
      targetType: 'market',
      targetId: market.id,
      reason: parsed.data.reason,
      metadata: { from: market.status, to: next, helpersBroughtIn: covered.length },
    });
  });
  return { ok: true, code: 'updated' };
}

/** Helpers outside every open market (a ZIP, no neighborhood) whose ZIP the market covers. */
export async function waitingHelpersFor(db: Pick<Db, 'select'>, market: { id: string; status: string; zipPrefixes: string[] }) {
  const waiting = await db
    .select({ userId: helperProfiles.userId, homeZip: helperProfiles.homeZip, areaId: helperProfiles.areaId })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .where(and(isNull(helperProfiles.areaId), isNotNull(helperProfiles.homeZip), eq(users.status, 'active')));
  return helpersCoveredBy(market, waiting);
}
