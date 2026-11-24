import { and, asc, eq, gte, inArray, ne, sql, type SQL } from 'drizzle-orm';
import type { AvailabilityStatus, CategorySlug, NeighborhoodDayCardView, NeighborhoodDayFormData, NeighborhoodDayManageView, NeighborhoodDayTeaser } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { shownPerson } from '@/modules/accounts/shown-name';
import { avatarPhoto } from '@/modules/files/photos';
import { distanceKm } from '@/modules/markets/geo';
import { areas, categories } from '@/modules/markets/schema';
import { marketTimeZones } from '@/modules/markets/time-zone';
import { helperProfiles } from '@/modules/profiles/schema';
import type { Db } from '@/platform/db/connect';
import { canCancelDay, dayStateOf, visitStateOf } from './neighborhood-day-domain';
import { availabilityPosts, neighborhoodDays } from './schema';

/**
 * Neighborhood day cards (2026-11-24): the day, its neighborhood (a name only, never an address), and its visits as
 * open, taken or closed. Read by Neighbors, the helper's profile, Find helpers, the request dialog and the helper's
 * own page. No invites import here: the invites service reads it.
 */

export type DayCard = NeighborhoodDayCardView & { areaId: string; marketId: string; status: string; visitStatuses: { slotId: string; status: AvailabilityStatus; end: Date }[] };

export interface DayFilter {
  ids?: string[];
  helperIds?: string[];
  marketId?: string;
  /** Only days in these neighborhoods (null or absent: anywhere). */
  areaIds?: string[] | null;
  /** Only days that aren't canceled and whose last visit hasn't started. */
  upcoming?: boolean;
  limit?: number;
  /**
   * The helper's own page: their days whatever their standing. Everywhere else a day shows only while its helper can be
   * requested, an active profile on an active account (sweep 2026-11-24 A5: a paused, suspended or banned helper's days
   * stayed on Neighbors, and every visit opened a 404).
   */
  withInactive?: boolean;
}

/** The database's clock, for cached pages (the profile), as `openSlotsOf` reads it. */
export async function databaseNow(db: Db): Promise<Date> {
  const result = await db.execute<{ now: Date | string }>(sql`select now() as now`);
  const value = result.rows[0]?.now;
  return value ? new Date(value) : new Date(0);
}

/** The cards for the days matching `filter`, soonest first. */
export async function dayCardsOf(db: Db, filter: DayFilter, now: Date): Promise<DayCard[]> {
  if (filter.ids?.length === 0 || filter.helperIds?.length === 0 || filter.areaIds?.length === 0) return [];
  const where: (SQL | undefined)[] = [
    filter.ids ? inArray(neighborhoodDays.id, filter.ids) : undefined,
    filter.helperIds ? inArray(neighborhoodDays.helperUserId, filter.helperIds) : undefined,
    filter.marketId ? eq(neighborhoodDays.marketId, filter.marketId) : undefined,
    filter.areaIds ? inArray(neighborhoodDays.areaId, filter.areaIds) : undefined,
    // A day ahead in any zone: yesterday in UTC is early enough; the visits decide the rest.
    filter.upcoming ? and(eq(neighborhoodDays.status, 'open'), gte(neighborhoodDays.day, new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10))) : undefined,
    filter.withInactive ? undefined : and(eq(helperProfiles.status, 'active'), eq(users.status, 'active')),
  ];
  const rows = await db
    .select({ day: neighborhoodDays, areaName: areas.name, slug: categories.slug, handle: helperProfiles.handle, user: { name: users.name, firstName: users.firstName, lastName: users.lastName, status: users.status, avatarFileId: users.avatarFileId } })
    .from(neighborhoodDays)
    .innerJoin(areas, eq(areas.id, neighborhoodDays.areaId))
    .innerJoin(categories, eq(categories.id, neighborhoodDays.categoryId))
    .innerJoin(helperProfiles, eq(helperProfiles.userId, neighborhoodDays.helperUserId))
    .innerJoin(users, eq(users.id, neighborhoodDays.helperUserId))
    .where(and(...where))
    .orderBy(asc(neighborhoodDays.day), asc(neighborhoodDays.createdAt));
  if (rows.length === 0) return [];
  const [visits, zones] = await Promise.all([
    db
      .select({ id: availabilityPosts.id, dayId: availabilityPosts.dayId, status: availabilityPosts.status, startAt: availabilityPosts.startAt, endAt: availabilityPosts.endAt })
      .from(availabilityPosts)
      .where(and(inArray(availabilityPosts.dayId, rows.map(({ day }) => day.id)), ne(availabilityPosts.status, 'canceled')))
      .orderBy(asc(availabilityPosts.startAt)),
    marketTimeZones(db, [...new Set(rows.map(({ day }) => day.marketId))]),
  ]);
  const cards = rows.map(({ day, areaName, slug, handle, user }): DayCard => {
    const mine = visits.filter((visit) => visit.dayId === day.id);
    const shown = mine.map((visit) => ({ slotId: visit.id, start: visit.startAt.toISOString(), end: visit.endAt.toISOString(), state: visitStateOf(visit.status as AvailabilityStatus, visit.startAt, now) }));
    const person = shownPerson(user);
    return {
      id: day.id,
      helper: { id: day.helperUserId, handle, displayName: person.displayName, initials: person.initials, ...(user.avatarFileId ? { photo: avatarPhoto(user.avatarFileId, user.name) } : {}) },
      areaName,
      date: day.day,
      timeZone: zones.get(day.marketId) ?? 'America/New_York',
      categorySlug: slug as CategorySlug,
      visitPriceCents: day.neighborPriceCents ?? day.priceCents,
      ...(day.neighborPriceCents !== null ? { usualPriceCents: day.priceCents } : {}),
      visits: shown,
      openCount: shown.filter((visit) => visit.state === 'open').length,
      totalCount: shown.length,
      state: dayStateOf(day.status, mine.map((visit, index) => ({ state: shown[index]!.state, start: visit.startAt })), now),
      areaId: day.areaId,
      marketId: day.marketId,
      status: day.status,
      visitStatuses: mine.map((visit) => ({ slotId: visit.id, status: visit.status as AvailabilityStatus, end: visit.endAt })),
    };
  });
  const kept = filter.upcoming ? cards.filter((card) => card.state !== 'past' && card.state !== 'canceled') : cards;
  return filter.limit ? kept.slice(0, filter.limit) : kept;
}

/** The public card: without the fields the server keeps. */
export function publicCard({ areaId: _area, marketId: _market, status: _status, visitStatuses: _visits, ...card }: DayCard, viewerId?: string): NeighborhoodDayCardView {
  return viewerId && card.helper.id === viewerId ? { ...card, own: true } : card;
}

/** The day a slot belongs to, when it's a visit. */
export async function dayOfSlot(db: Db, slotId: string, now: Date): Promise<DayCard | null> {
  const [row] = await db.select({ dayId: availabilityPosts.dayId }).from(availabilityPosts).where(eq(availabilityPosts.id, String(slotId))).limit(1);
  if (!row?.dayId) return null;
  return (await dayCardsOf(db, { ids: [row.dayId] }, now))[0] ?? null;
}

/** The area of the day a slot belongs to (null for a slot of its own). */
export async function dayAreaOfSlot(db: Db, slotId: string): Promise<string | null> {
  const [row] = await db
    .select({ areaId: neighborhoodDays.areaId })
    .from(availabilityPosts)
    .innerJoin(neighborhoodDays, eq(neighborhoodDays.id, availabilityPosts.dayId))
    .where(eq(availabilityPosts.id, String(slotId)))
    .limit(1);
  return row?.areaId ?? null;
}

/** Find helpers: each helper's next day with an open visit within 14 days. */
export async function dayTeasersOf(db: Db, helperIds: string[], now: Date): Promise<Map<string, NeighborhoodDayTeaser>> {
  const cards = await dayCardsOf(db, { helperIds, upcoming: true }, now);
  const horizon = now.getTime() + 14 * 86_400_000;
  const teasers = new Map<string, NeighborhoodDayTeaser>();
  for (const card of cards) {
    const first = card.visits.find((visit) => visit.state === 'open');
    if (!first || Date.parse(first.start) > horizon || teasers.has(card.helper.id)) continue;
    teasers.set(card.helper.id, { id: card.id, areaName: card.areaName, date: card.date, firstOpenSlotId: first.slotId, openCount: card.openCount, visitPriceCents: card.visitPriceCents });
  }
  return teasers;
}

/** The neighborhoods a helper can open a day in: their own area first, then the market's areas within their radius, nearest first. */
export async function neighborhoodAreasOf(db: Db, helperId: string): Promise<{ id: string; slug: string; name: string }[]> {
  const [me] = await db
    .select({ areaId: helperProfiles.areaId, radiusKm: helperProfiles.serviceRadiusKm, marketId: areas.marketId, lat: areas.centerLat, lng: areas.centerLng })
    .from(helperProfiles)
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(eq(helperProfiles.userId, helperId))
    .limit(1);
  if (!me) return [];
  const all = await db.select({ id: areas.id, slug: areas.slug, name: areas.name, lat: areas.centerLat, lng: areas.centerLng }).from(areas).where(eq(areas.marketId, me.marketId));
  return all
    .map((area) => ({ area, km: area.id === me.areaId ? -1 : distanceKm({ lat: me.lat, lng: me.lng }, { lat: area.lat, lng: area.lng }) }))
    .filter(({ km }) => km <= me.radiusKm)
    .sort((a, b) => a.km - b.km || a.area.name.localeCompare(b.area.name))
    .map(({ area }) => ({ id: area.id, slug: area.slug, name: area.name }));
}

/** The helper's days for `/app/availability`: upcoming ones soonest first, then the five latest past or canceled. */
export async function myNeighborhoodDays(db: Db, helperId: string, now: Date): Promise<NeighborhoodDayFormData> {
  const [choices, cards] = await Promise.all([neighborhoodAreasOf(db, helperId), dayCardsOf(db, { helperIds: [helperId], withInactive: true }, now)]);
  const upcoming = cards.filter((card) => card.state !== 'past' && card.state !== 'canceled');
  const done = cards.filter((card) => !upcoming.includes(card)).reverse().slice(0, 5);
  const days = [...upcoming, ...done].map((card): NeighborhoodDayManageView => ({ ...publicCard(card), actions: canCancelDay(card.status, card.visitStatuses, now) ? ['cancel_day'] : [] }));
  return { areas: choices.map(({ slug, name }) => ({ slug, name })), days };
}
