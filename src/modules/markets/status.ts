import { and, eq, isNotNull, isNull, like, or } from 'drizzle-orm';
import { marketStatusInputSchema, type ActionResult, type MarketStatusInput } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import type { StaffActor } from '@/modules/support/staff';
import { placeByZip } from '@/modules/verification/helper-place';
import { emitVerificationEvent } from '@/modules/verification/state';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import { outboxEvents } from '@/platform/outbox/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { queueCityOpenEmails } from '@/modules/marketing/city-open';
import { helpersCoveredBy, isOpenMarketStatus, marketStatusChange, type MarketStatus } from './coverage';
import { CITY_AREA_PREFIX } from './city-areas';
import { areas, markets } from './schema';

/**
 * Opening cities in turn (owner, 2026-11-14). An admin moves a market between pre-launch, live and paused, with a
 * reason, audited. Whenever a market is open (pre-launch or live) after the change, it brings in the helpers who wait
 * with a ZIP it covers (no neighborhood yet) and whose home market isn't this one yet: their home market becomes this
 * one, and they're told to choose a neighborhood (the `city_open` notification). Their checks carry over; the home
 * address is asked for next. The home market is the mark: nobody is told twice, and a market opened some other way (a
 * migration's SQL) still brings its waiting helpers in at its next change here.
 *
 * Going live also tells the waitlist (completion plan 8.3): the entries whose ZIP it covers and that were never told
 * are queued in this transaction, and the job runner emails them (src/modules/marketing/city-open.ts).
 *
 * A market opens (pre-launch or live) only in a time zone dates are shown and checked in, the US zones
 * (`marketStatusChange`, completion plan 8.1); pausing works in any.
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
    const covered = isOpenMarketStatus(next) ? (await waitingHelpersFor(tx, { ...market, status: next })).filter((helper) => helper.homeMarketId !== market.id) : [];
    for (const helper of covered) {
      await tx.update(users).set({ homeMarketId: market.id, updatedAt: now }).where(eq(users.id, helper.userId));
      // Where they help moves into the city now open (2026-11-23): its nearest neighborhood to their ZIP, or their city's
      // area in it when they live past its service area (helper-place.ts).
      const placed = helper.homeZip && helper.homeState ? await placeByZip(tx, market.id, { zip: helper.homeZip, city: helper.homeCity ?? '', state: helper.homeState }) : null;
      if (placed) await tx.update(helperProfiles).set({ areaId: placed.areaId, homeZip: placed.homeZip, homeCity: placed.homeCity, homeState: placed.homeState, updatedAt: now.toISOString() }).where(eq(helperProfiles.userId, helper.userId));
      await emitVerificationEvent(tx, helper.userId, 'helper', 'city_open', { city: market.name });
    }
    const waitlistQueued = next === 'live' ? await queueCityOpenEmails(tx, market, now) : 0;
    // Its accounts hear that it's live (launch rehearsal J-L2): the dispatcher plans one message each, once per person and
    // city, so going live again after a pause or a pre-launch round trip tells nobody twice.
    if (next === 'live') {
      await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'market.live', aggregateType: 'market', aggregateId: market.id, payload: { marketId: market.id, city: market.name } });
    }
    await tx.insert(auditLog).values({
      id: newId('aud'),
      actorId: staff.id,
      actorRole: 'admin',
      action: 'config.market_status',
      targetType: 'market',
      targetId: market.id,
      reason: parsed.data.reason,
      metadata: { from: market.status, to: next, helpersBroughtIn: covered.length, waitlistQueued },
    });
  });
  return { ok: true, code: 'updated' };
}

/**
 * Helpers outside the market's neighborhoods with a ZIP the market covers, with their home market: those who help from
 * their city's area (2026-11-23, helper-place.ts) and those who chose a ZIP while helpers outside our cities waited (no
 * area yet). Those whose home market is already this one came in before (or started here) and aren't brought in again.
 */
export async function waitingHelpersFor(db: Pick<Db, 'select'>, market: { id: string; status: string; zipPrefixes: string[] }) {
  const waiting = await db
    .select({ userId: helperProfiles.userId, homeZip: helperProfiles.homeZip, homeCity: helperProfiles.homeCity, homeState: helperProfiles.homeState, areaId: helperProfiles.areaId, homeMarketId: users.homeMarketId })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .leftJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(and(isNotNull(helperProfiles.homeZip), eq(users.status, 'active'), or(isNull(helperProfiles.areaId), like(areas.slug, `${CITY_AREA_PREFIX}%`))));
  // A city's area isn't a neighborhood: for the market, they're all outside its neighborhoods.
  return helpersCoveredBy(market, waiting.map((helper) => ({ ...helper, areaId: null })));
}
