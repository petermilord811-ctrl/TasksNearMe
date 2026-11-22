import { and, asc, eq, inArray, isNotNull, isNull, lt, ne, notInArray, or, sql } from 'drizzle-orm';
import { users } from '@/modules/accounts/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { tasks } from '@/modules/tasks/schema';
import { areas, markets } from '@/modules/markets/schema';
import { blockedPeopleOf } from '@/modules/trust/blocks';
import type { Db } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';
import { realRowsOnly, samplesHiddenInThisBuild } from '@/shared/sample-data';
import { DIGEST_MIN_POSTS, digestDue, digestSendFrom, ENGAGEMENT, milesBetween, NEARBY_MILES, UNANSWERED_KINDS } from './domain';
import { communityPosts } from './schema';

/**
 * The weekly Neighbors digest (plan 10.14; Nextdoor's best habit): on Sunday from 9 am on each market's clock, every
 * member whose place had at least `DIGEST_MIN_POSTS` posts that week hears "This week in Mueller: 6 posts, 2 asks waiting
 * for an answer", with the liveliest titles. One a week per person (`users.community_digest_at`), skipped when quiet,
 * by email (its own topic, on by default, one-click unsubscribe; src/modules/notifications). Real posts only where
 * samples are hidden, never the person's own, nobody blocked either way. Runs every tick; does its work once a week.
 */

/** People looked at per run (the job runs every minute; a city's Sunday is long). */
const PEOPLE_PER_RUN = 200;

interface Place {
  /** Neighborhood ids "near you" covers; null for the whole city. */
  areaIds: string[] | null;
  /** "Mueller" or the city. */
  name: string;
}

/** A person's place, as Neighbors' "Near you" sees it: their neighborhood and those within 3 miles, else the city. */
async function placeOf(db: Db, person: { id: string; homeAreaId: string | null; marketId: string; marketName: string }, marketAreas: { id: string; name: string; lat: number; lng: number }[]): Promise<Place> {
  let areaId = person.homeAreaId && marketAreas.some((area) => area.id === person.homeAreaId) ? person.homeAreaId : null;
  if (!areaId) {
    const [profile] = await db.select({ areaId: helperProfiles.areaId }).from(helperProfiles).where(eq(helperProfiles.userId, person.id)).limit(1);
    areaId = profile?.areaId ?? null;
  }
  if (!areaId) {
    const [task] = await db.select({ areaId: tasks.publicAreaId }).from(tasks).where(and(eq(tasks.posterUserId, person.id), isNotNull(tasks.publicAreaId), eq(tasks.marketId, person.marketId))).orderBy(sql`${tasks.createdAt} desc`).limit(1);
    areaId = task?.areaId ?? null;
  }
  const home = areaId ? marketAreas.find((area) => area.id === areaId) : undefined;
  if (!home) return { areaIds: null, name: person.marketName };
  return { areaIds: marketAreas.filter((area) => milesBetween(home, area) <= NEARBY_MILES).map((area) => area.id), name: home.name };
}

/** What the week brought to a place: its posts (not the person's own, nobody blocked), asks waiting, the liveliest titles. */
async function weekIn(db: Db, marketId: string, place: Place, userId: string, since: Date, now: Date): Promise<{ count: number; waiting: number; titles: string[] }> {
  const blocked = await blockedPeopleOf(db, userId);
  const conditions = [
    eq(communityPosts.marketId, marketId),
    eq(communityPosts.status, 'visible'),
    ne(communityPosts.authorUserId, userId),
    sql`${communityPosts.createdAt} >= ${since} and ${communityPosts.createdAt} <= ${now}`,
  ];
  if (blocked.length > 0) conditions.push(notInArray(communityPosts.authorUserId, blocked));
  if (place.areaIds) conditions.push(place.areaIds.length > 0 ? or(isNull(communityPosts.areaId), inArray(communityPosts.areaId, place.areaIds))! : isNull(communityPosts.areaId));
  if (samplesHiddenInThisBuild()) conditions.push(realRowsOnly(communityPosts.id));
  const rows = await db
    .select({ title: communityPosts.title, kind: communityPosts.kind, replyCount: communityPosts.replyCount, helpful: communityPosts.helpfulCount, thanks: communityPosts.thanksCount, createdAt: communityPosts.createdAt })
    .from(communityPosts)
    .where(and(...conditions))
    .limit(200);
  const engagement = (row: (typeof rows)[number]) => ENGAGEMENT.helpful * row.helpful + ENGAGEMENT.thanks * row.thanks + ENGAGEMENT.reply * row.replyCount;
  const titles = [...rows].sort((a, b) => engagement(b) - engagement(a) || b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 3).map((row) => row.title);
  const waiting = rows.filter((row) => (UNANSWERED_KINDS as readonly string[]).includes(row.kind) && row.replyCount === 0).length;
  return { count: rows.length, waiting, titles };
}

/** Sends the week's digests that are due (a job; idempotent per person and week). */
export async function runCommunityDigests(db: Db, now: Date): Promise<number> {
  const marketRows = await db.select({ id: markets.id, name: markets.name, timeZone: markets.timeZone }).from(markets).where(inArray(markets.status, ['live', 'prelaunch']));
  let sent = 0;
  for (const market of marketRows) {
    const sendFrom = digestSendFrom(now, market.timeZone, marketLocalToUtc, (at, zone) => marketDayKey(at, zone));
    if (!digestDue(null, sendFrom, now)) continue;
    const people = await db
      .select({ id: users.id, homeAreaId: users.homeAreaId, digestAt: users.communityDigestAt })
      .from(users)
      .where(
        and(
          eq(users.homeMarketId, market.id),
          eq(users.status, 'active'),
          isNotNull(users.termsAcceptedAt),
          or(isNull(users.communityDigestAt), lt(users.communityDigestAt, sendFrom)),
          samplesHiddenInThisBuild() ? realRowsOnly(users.id) : undefined,
        ),
      )
      .orderBy(asc(users.communityDigestAt), asc(users.id))
      .limit(PEOPLE_PER_RUN);
    if (people.length === 0) continue;
    const marketAreas = await db.select({ id: areas.id, name: areas.name, lat: areas.centerLat, lng: areas.centerLng }).from(areas).where(eq(areas.marketId, market.id));
    const since = new Date(sendFrom.getTime() - 7 * 86_400_000);
    const week = marketDayKey(sendFrom, market.timeZone);
    for (const person of people) {
      if (!digestDue(person.digestAt, sendFrom, now)) continue;
      const place = await placeOf(db, { id: person.id, homeAreaId: person.homeAreaId, marketId: market.id, marketName: market.name }, marketAreas);
      const summary = await weekIn(db, market.id, place, person.id, since, now);
      await db.transaction(async (tx) => {
        await tx.update(users).set({ communityDigestAt: now }).where(eq(users.id, person.id));
        if (summary.count < DIGEST_MIN_POSTS) return;
        await tx
          .insert(outboxEvents)
          .values({
            id: `evt_cdigest_${person.id}_${week}`,
            type: 'community.digest',
            aggregateType: 'user',
            aggregateId: person.id,
            payload: { userId: person.id, marketId: market.id, area: place.name, count: summary.count, waiting: summary.waiting, titles: summary.titles },
          })
          .onConflictDoNothing();
        sent += 1;
      });
    }
  }
  return sent;
}
