'use server';

import { refresh, updateTag } from 'next/cache';
import type { ActionResult, FlagSetInput, MarketStatusInput, OutageSwitchInput, PolicyPublishInput } from '@/contracts';
import { marketTag } from '@/modules/marketing/queries';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { publishPolicy, setFeatureFlag } from './admin-config';
import { setOutageSwitch } from './outage';
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
 * Admins open, pre-launch or pause a market (owner, 2026-11-14: national, cities open in turn). Helpers who waited
 * there are brought in and told. There's no button for it yet (completion plan 8.2): staff call it from the
 * config page once that section is built.
 */
export async function setMarketStatusAction(marketId: string, marketSlug: string, input: MarketStatusInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await setMarketStatus(db, staff, String(marketId), input, await requestNow());
  if (result.ok) {
    updateTag(marketTag(String(marketSlug)));
    updateTag('markets');
    refresh();
  }
  return result;
}
