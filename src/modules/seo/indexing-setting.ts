import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { searchIndexingInputSchema, type ActionResult, type AdminSearchIndexing, type AdminSearchIndexingSetting, type SearchIndexingInput } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { featureFlags } from '@/modules/markets/schema';
import type { StaffActor } from '@/modules/support/staff';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import { db as appDb } from '@/platform/db/client';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import {
  followsSearchSetting,
  LIVE_SITE_INDEXING,
  searchIndexing,
  SEARCH_LISTINGS_FLAG,
  storedSearchIndexing,
  type SearchIndexing,
  type StoredSearchIndexing,
} from '@/shared/search-indexing';

/**
 * The search setting (docs/seo/PLAN.md §11.6; launch runbook J-L6): whether the live site's task pages and helper
 * profiles join search, chosen by an admin on the config page instead of with a deploy. It's the global feature flag
 * SEARCH_LISTINGS_FLAG (src/shared/search-indexing.ts), absent until the first change; every change is an audit row with
 * its reason. Read fresh where robots.txt, the sitemap and IndexNow decide (here), and by the proxy every 15 seconds
 * (src/modules/seo/proxy-search-indexing.ts). The generic flag list leaves the flag out (src/modules/markets/admin-config.ts).
 */

export const SEARCH_INDEXING_AUDIT_ACTION = 'config.search_indexing';
const AUDIT_TARGET = { targetType: 'site', targetId: 'search_indexing' } as const;
/** Cache tags of what the setting changes: the sitemap's entries (src/modules/seo/sitemap.ts). */
export const SEARCH_INDEXING_TAGS = ['sitemap'] as const;

/** The stored setting, or null when no admin has changed it. */
export async function readStoredSearchIndexing(database: Db = appDb): Promise<StoredSearchIndexing | null> {
  const [row] = await database
    .select({ enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(and(eq(featureFlags.key, SEARCH_LISTINGS_FLAG), eq(featureFlags.marketId, 'global')))
    .limit(1);
  return storedSearchIndexing(row?.enabled);
}

/**
 * This server's mode, with the setting read only where it can change it (the live site, the e2e build). If the
 * database can't answer, the code's default applies (the listings stay out).
 */
export async function currentSearchIndexing(database: Db = appDb): Promise<SearchIndexing> {
  if (!followsSearchSetting()) return searchIndexing();
  return searchIndexing(undefined, undefined, await readStoredSearchIndexing(database).catch(() => null));
}

/** The setting while no admin has changed it: the code's default (LIVE_SITE_INDEXING). */
const DEFAULT_SETTING: AdminSearchIndexingSetting = LIVE_SITE_INDEXING === 'on' ? 'on' : 'site';

const isoOf = (value: string | Date) => new Date(value instanceof Date ? value : value.includes('T') ? value : value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toISOString();
const isSetting = (value: unknown): value is AdminSearchIndexingSetting => value === 'site' || value === 'on';

/** The config page's Search engines section: the setting, what this server does with it, and the last change. */
export async function getAdminSearchIndexing(database: Db = appDb): Promise<AdminSearchIndexing> {
  const [stored, [last]] = await Promise.all([
    readStoredSearchIndexing(database),
    database
      .select({ at: auditLog.at, reason: auditLog.reason, by: users.name, metadata: auditLog.metadata })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(and(eq(auditLog.action, SEARCH_INDEXING_AUDIT_ACTION), eq(auditLog.targetType, AUDIT_TARGET.targetType), eq(auditLog.targetId, AUDIT_TARGET.targetId)))
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(1),
  ]);
  const setting = stored ?? DEFAULT_SETTING;
  const effective = searchIndexing(undefined, undefined, stored);
  const from = last?.metadata.from;
  const to = last?.metadata.to;
  return {
    setting,
    isDefault: stored === null,
    effective,
    ...(last && isSetting(from) && isSetting(to) ? { lastChange: { at: isoOf(last.at), by: last.by ?? 'Staff', reason: last.reason ?? '', from, to } } : {}),
  };
}

/**
 * An admin opens the listings to search (`on`) or keeps them out (`site`). Asking for the setting it already has (the
 * default included) changes nothing and adds no audit row.
 */
export async function setSearchIndexing(database: Db, staff: StaffActor, input: SearchIndexingInput, now: Date): Promise<ActionResult> {
  // Site config is for admins (blueprint 08 §4), as the outage switch and the flags are.
  if (!staff.roles.includes('admin')) return { ok: false, code: 'not_allowed' };
  const parsed = searchIndexingInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { setting, reason } = parsed.data;
  const before = (await readStoredSearchIndexing(database)) ?? DEFAULT_SETTING;
  if (before === setting) return { ok: true, code: 'updated' };
  await database.transaction(async (tx) => {
    await tx
      .insert(featureFlags)
      .values({ key: SEARCH_LISTINGS_FLAG, marketId: 'global', enabled: setting === 'on', description: 'Search engines may list task pages and helper profiles (config page, Search engines)' })
      .onConflictDoUpdate({ target: [featureFlags.key, featureFlags.marketId], set: { enabled: setting === 'on', updatedAt: now.toISOString() } });
    await tx.insert(auditLog).values({
      id: newId('aud'),
      at: now.toISOString(),
      actorId: staff.id,
      actorRole: 'admin',
      action: SEARCH_INDEXING_AUDIT_ACTION,
      ...AUDIT_TARGET,
      reason,
      metadata: { from: before, to: setting },
    });
  });
  return { ok: true, code: 'updated' };
}
