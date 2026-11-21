'use server';

import { refresh, updateTag } from 'next/cache';
import { eq } from 'drizzle-orm';
import { marketStatusChangeInputSchema, type ActionResult, type FlagSetInput, type MarketStatusChangeInput, type OutageSwitchInput, type PolicyPublishInput, type SearchIndexingInput } from '@/contracts';
import { marketTag } from '@/modules/marketing/queries';
import { SEARCH_INDEXING_TAGS, setSearchIndexing } from '@/modules/seo/indexing-setting';
import { staffActorOf } from '@/modules/support/staff';
import { validationFailed } from '@/platform/actions/results';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { publishPolicy, setFeatureFlag } from './admin-config';
import { setOutageSwitch } from './outage';
import { markets } from './schema';
import { setMarketStatus } from './status';
import { requestNow } from '@/platform/clock';

async function signedInStaff() {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
}

/** Admins publish a new market policy version (UI-038); the market's public pages (pricing) refresh. */
export async function publishPolicyAction(marketId: string, marketSlug: string, input: PolicyPublishInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await publishPolicy(db, staff, String(marketId), input, await requestNow());
  if (result.ok) {
    updateTag(marketTag(String(marketSlug)));
    updateTag('markets');
    refresh();
  }
  return result;
}

/** Admins turn a feature flag on or off (UI-038). */
export async function setFeatureFlagAction(marketSlug: string, input: FlagSetInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await setFeatureFlag(db, staff, input);
  if (result.ok) {
    updateTag(marketTag(String(marketSlug)));
    refresh();
  }
  return result;
}

/** Admins turn the market's outage switch on or off (completion plan 5.15); every signed-in page shows it at once. */
export async function setOutageSwitchAction(marketId: string, input: OutageSwitchInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await setOutageSwitch(db, staff, String(marketId), input, await requestNow());
  if (result.ok) refresh();
  return result;
}

/**
 * Admins open the live site's task pages and helper profiles to search, or keep them out (the Search engines section;
 * launch runbook J-L6): no deploy. The sitemap refreshes at once, robots.txt reads the setting on every request, and
 * the pages' X-Robots-Tag follows within 15 seconds (the proxy's read).
 */
export async function setSearchIndexingAction(input: SearchIndexingInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await setSearchIndexing(db, staff, input, await requestNow());
  if (result.ok) {
    for (const tag of SEARCH_INDEXING_TAGS) updateTag(tag);
    refresh();
  }
  return result;
}

/**
 * Admins open, pre-launch or pause a market (owner, 2026-11-14: national, cities open in turn) from the config page's
 * Markets section (completion plan 8.2), with a reason. Helpers who waited there are brought in and told; going live
 * queues its waitlist's "we're open" email (8.3). The market's pages and every list of markets refresh.
 */
export async function setMarketStatusAction(input: MarketStatusChangeInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const parsed = marketStatusChangeInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { marketId, ...change } = parsed.data;
  const result = await setMarketStatus(db, staff, marketId, change, await requestNow());
  if (result.ok) {
    const [market] = await db.select({ slug: markets.slug }).from(markets).where(eq(markets.id, marketId)).limit(1);
    if (market) updateTag(marketTag(market.slug));
    updateTag('markets');
    refresh();
  }
  return result;
}
