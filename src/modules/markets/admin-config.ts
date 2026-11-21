import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  flagSetInputSchema,
  policyPublishInputSchema,
  type ActionResult,
  type AdminConfigPageData,
  type AdminPolicyValues,
  type AdminPolicyVersion,
  type FlagSetInput,
  type PolicyPublishInput,
  type PolicyVersionStatus,
  type StaffRole,
} from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { getAdminSearchIndexing } from '@/modules/seo/indexing-setting';
import type { StaffActor } from '@/modules/support/staff';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { SEARCH_LISTINGS_FLAG } from '@/shared/search-indexing';
import { getOutageSwitch, OUTAGE_FLAG } from './outage';
import { featureFlags, marketPolicies, markets } from './schema';

/**
 * Market config for admins (UI-038; blueprint 08 §4, D16): policy versions (publishing one retires the
 * previous; bookings keep theirs) and global feature flags. Every change is audited with a reason.
 */

export const canManageConfig = (roles: readonly StaffRole[]) => roles.includes('admin');

type PolicyRow = typeof marketPolicies.$inferSelect;

function valuesOf(row: PolicyRow): AdminPolicyValues {
  const { fees, cancellation, timers } = row;
  return {
    posterBps: fees.posterBps,
    posterMinCents: fees.posterMinCents,
    helperBps: fees.helperBps,
    freeUntilHours: cancellation.freeUntilHours,
    lateFeeBps: cancellation.lateFeeBps,
    lateFeeMinCents: cancellation.lateFeeMinCents,
    autoApproveHours: timers.autoApproveHours,
    inviteTtlHours: timers.inviteTtlHours,
    pendingFundingMinutes: timers.pendingFundingMinutes,
    noShowMinutes: timers.noShowMinutes,
    addressHideAfterHours: timers.addressHideAfterHours,
    maxLeadDays: timers.maxLeadDays,
    minLeadHours: timers.minLeadHours,
  };
}

const iso = (value: string | null) => (value ? new Date(value.includes('T') ? value : value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toISOString() : undefined);

/**
 * `routes.admin.config()` for a market (the launch market): admins only, null for anyone else. The Markets section
 * comes from ./admin-markets.ts (every staff role reads it).
 */
export async function getAdminConfig(db: Db, staff: StaffActor, marketSlug: string): Promise<Omit<AdminConfigPageData, 'markets'> | null> {
  if (!canManageConfig(staff.roles)) return null;
  const [market] = await db.select().from(markets).where(eq(markets.slug, marketSlug)).limit(1);
  if (!market) return null;
  const [versions, flags, outage] = await Promise.all([
    db.select().from(marketPolicies).where(eq(marketPolicies.marketId, market.id)).orderBy(desc(marketPolicies.version)),
    db.select().from(featureFlags).where(eq(featureFlags.marketId, 'global')).orderBy(featureFlags.key),
    getOutageSwitch(db, market.id),
  ]);
  const searchIndexing = await getAdminSearchIndexing(db);
  const publisherIds = [...new Set(versions.flatMap((row) => (row.publishedBy ? [row.publishedBy] : [])))];
  const publishers = publisherIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, publisherIds)) : [];
  const nameOf = new Map(publishers.map((row) => [row.id, row.name]));
  const history: AdminPolicyVersion[] = versions.map((row) => {
    const publishedAt = iso(row.publishedAt);
    const publishedBy = row.publishedBy ? nameOf.get(row.publishedBy) : undefined;
    return { id: row.id, version: row.version, status: row.status as PolicyVersionStatus, ...(publishedAt ? { publishedAt } : {}), ...(publishedBy ? { publishedBy } : {}), values: valuesOf(row) };
  });
  const current = history.find((row) => row.status === 'published');
  if (!current) return null;
  return {
    market: { id: market.id, name: market.name, slug: market.slug },
    outage,
    searchIndexing,
    current,
    history,
    // The outage switch (per market) and the search setting have their own sections, with their own audit; neither is
    // offered as a plain global flag.
    flags: flags.filter((row) => row.key !== OUTAGE_FLAG && row.key !== SEARCH_LISTINGS_FLAG).map((row) => ({ key: row.key, description: row.description, enabled: row.enabled })),
  };
}

/** Publishes a new version for the market; the previous published one is retired. */
export async function publishPolicy(db: Db, staff: StaffActor, marketId: string, input: PolicyPublishInput, now: Date): Promise<ActionResult> {
  if (!canManageConfig(staff.roles)) return { ok: false, code: 'not_allowed' };
  const parsed = policyPublishInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { reason, ...values } = parsed.data;
  const [market] = await db.select({ id: markets.id }).from(markets).where(eq(markets.id, marketId)).limit(1);
  if (!market) return { ok: false, code: 'not_found' };
  const at = now.toISOString();
  await db.transaction(async (tx) => {
    // One publisher at a time per market (versions are numbered in order).
    await tx.execute(sql`select id from ${marketPolicies} where market_id = ${market.id} for update`);
    const [last] = await tx.select({ version: marketPolicies.version, plans: marketPolicies.plans }).from(marketPolicies).where(eq(marketPolicies.marketId, market.id)).orderBy(desc(marketPolicies.version)).limit(1);
    const version = (last?.version ?? 0) + 1;
    await tx.update(marketPolicies).set({ status: 'retired' }).where(and(eq(marketPolicies.marketId, market.id), eq(marketPolicies.status, 'published')));
    await tx.insert(marketPolicies).values({
      id: newId('pol'),
      marketId: market.id,
      version,
      status: 'published',
      effectiveFrom: at,
      fees: { posterBps: values.posterBps, posterMinCents: values.posterMinCents, helperBps: values.helperBps },
      cancellation: { freeUntilHours: values.freeUntilHours, lateFeeBps: values.lateFeeBps, lateFeeMinCents: values.lateFeeMinCents },
      timers: {
        autoApproveHours: values.autoApproveHours,
        inviteTtlHours: values.inviteTtlHours,
        pendingFundingMinutes: values.pendingFundingMinutes,
        noShowMinutes: values.noShowMinutes,
        addressHideAfterHours: values.addressHideAfterHours,
        maxLeadDays: values.maxLeadDays,
        minLeadHours: values.minLeadHours,
      },
      // The plans (9.13) aren't on this form: they carry over, or a fee change would reset them to the defaults (aa's sweep #4).
      plans: last?.plans ?? null,
      publishedBy: staff.id,
      publishedAt: at,
    });
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: staff.id, actorRole: 'admin', action: 'config.publish_policy', targetType: 'market', targetId: market.id, reason, metadata: { version, ...values } });
  });
  return { ok: true, code: 'updated' };
}

/** Turns a global feature flag on or off. */
export async function setFeatureFlag(db: Db, staff: StaffActor, input: FlagSetInput): Promise<ActionResult> {
  if (!canManageConfig(staff.roles)) return { ok: false, code: 'not_allowed' };
  const parsed = flagSetInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { key, enabled, reason } = parsed.data;
  // The search setting changes through its own section (src/modules/seo/indexing-setting.ts), never as a plain flag.
  if (key === SEARCH_LISTINGS_FLAG) return { ok: false, code: 'validation_failed', fieldErrors: { key: ['invalid'] } };
  const updated = await db.transaction(async (tx) => {
    const rows = await tx.update(featureFlags).set({ enabled }).where(and(eq(featureFlags.key, key), eq(featureFlags.marketId, 'global'))).returning({ key: featureFlags.key });
    if (rows.length === 0) return false;
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: staff.id, actorRole: 'admin', action: 'config.set_flag', targetType: 'feature_flag', targetId: key, reason, metadata: { enabled } });
    return true;
  });
  return updated ? { ok: true, code: 'updated' } : { ok: false, code: 'validation_failed', fieldErrors: { key: ['invalid'] } };
}
