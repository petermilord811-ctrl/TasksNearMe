import { and, count, eq, isNotNull, sql } from 'drizzle-orm';
import { DEFAULT_LOCALE, type AppLocale, type WaitlistCity, type WaitlistDemand, type WaitlistInterest } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { stateOfZip, tidyCityName, zip3Of } from '@/shared/us-zip';
import { rowScopeCondition, type RowScope } from '@/shared/sample-data';
import { COMING_NEXT_LIMIT, rankCities, type CityCount } from './demand';
import { waitlistEntries } from './schema';

/** The cache tag of the waitlist page's counts; joining refreshes it. */
export const WAITLIST_TAG = 'waitlist';

/**
 * Adds a waitlist entry, one per email. Joining again keeps the first answer: the form needs no sign-in, so
 * anyone could otherwise change someone else's ZIP and interest. The answer is "submitted" either way, so the
 * form never tells whether an email is on the list. The city (optional) is kept tidied, and the state comes from
 * the ZIP (src/shared/us-zip.ts), so demand can be counted per city (owner, 2026-11-14: national, cities open in turn).
 * The page's language is kept too: the email telling them their city opened goes out in it (completion plan 8.3).
 */
export async function joinWaitlist(
  db: Db,
  entry: { email: string; zip: string; city?: string; interest: WaitlistInterest; locale?: AppLocale },
  now: Date = new Date(),
): Promise<void> {
  await db
    .insert(waitlistEntries)
    .values({
      id: newId('wl'),
      email: entry.email,
      zip: entry.zip,
      city: tidyCityName(entry.city),
      state: stateOfZip(entry.zip),
      interest: entry.interest,
      locale: entry.locale ?? DEFAULT_LOCALE,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: waitlistEntries.email });
}

/**
 * Helpers outside every market's neighborhoods (they gave a ZIP and help from their city's area, helper-place.ts; the
 * profile keeps the ZIP only then) whose account is active.
 */
const waitingHelper = and(isNotNull(helperProfiles.homeZip), eq(users.status, 'active'));

/**
 * People waiting near a ZIP: waitlist entries and waiting helpers that share its ZIP3 prefix (about one metro
 * area). Null for a ZIP we can't serve.
 */
export async function waitlistDemand(db: Db, zip: string): Promise<WaitlistDemand | null> {
  const prefix = zip3Of(zip);
  const state = stateOfZip(zip);
  if (!prefix || !state) return null;
  const [[waiting], [helpers]] = await Promise.all([
    db.select({ value: count() }).from(waitlistEntries).where(sql`left(${waitlistEntries.zip}, 3) = ${prefix}`),
    db
      .select({ value: count() })
      .from(helperProfiles)
      .innerJoin(users, eq(users.id, helperProfiles.userId))
      .where(and(waitingHelper, sql`left(${helperProfiles.homeZip}, 3) = ${prefix}`)),
  ]);
  return { zip: zip.slice(0, 5), state, waiting: waiting?.value ?? 0, helpersWaiting: helpers?.value ?? 0 };
}

/**
 * The cities people ask for most, outside the ZIP3 prefixes we already cover (`coveredPrefixes`, the open
 * markets'). Grouped by the tidied city name and state; at least 3 people per city.
 */
/**
 * `rows: 'real'` counts only real helpers (5.24: public pages and search engines never see sample people as demand);
 * waitlist entries are always real, since no seed writes them.
 */
export async function citiesComingNext(db: Db, coveredPrefixes: readonly string[], limit = COMING_NEXT_LIMIT, rows: RowScope = 'all'): Promise<WaitlistCity[]> {
  const covered = sql`${sql.raw(`'{${coveredPrefixes.filter((prefix) => /^\d{3}$/.test(prefix)).join(',')}}'`)}::text[]`;
  const [waitlistRows, helperRows] = await Promise.all([
    db
      .select({
        key: sql<string>`lower(${waitlistEntries.city})`,
        state: sql<string>`${waitlistEntries.state}`,
        name: sql<string>`mode() within group (order by ${waitlistEntries.city})`,
        count: sql<number>`count(*)::int`,
      })
      .from(waitlistEntries)
      .where(and(isNotNull(waitlistEntries.city), isNotNull(waitlistEntries.state), sql`not (left(${waitlistEntries.zip}, 3) = any(${covered}))`))
      .groupBy(sql`lower(${waitlistEntries.city})`, waitlistEntries.state),
    db
      .select({
        key: sql<string>`lower(${helperProfiles.homeCity})`,
        state: sql<string>`${helperProfiles.homeState}`,
        name: sql<string>`mode() within group (order by ${helperProfiles.homeCity})`,
        count: sql<number>`count(*)::int`,
      })
      .from(helperProfiles)
      .innerJoin(users, eq(users.id, helperProfiles.userId))
      .where(and(waitingHelper, rowScopeCondition(rows, users.id), isNotNull(helperProfiles.homeCity), isNotNull(helperProfiles.homeState), sql`not (left(${helperProfiles.homeZip}, 3) = any(${covered}))`))
      .groupBy(sql`lower(${helperProfiles.homeCity})`, helperProfiles.homeState),
  ]);
  return rankCities(waitlistRows as CityCount[], helperRows as CityCount[], limit);
}
