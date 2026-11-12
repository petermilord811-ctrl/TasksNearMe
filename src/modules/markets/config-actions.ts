'use server';

import { refresh, updateTag } from 'next/cache';
import type { ActionResult, FlagSetInput, PolicyPublishInput } from '@/contracts';
import { marketTag } from '@/modules/marketing/queries';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { publishPolicy, setFeatureFlag } from './admin-config';
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
