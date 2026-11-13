'use server';

import { refresh } from 'next/cache';
import type { ActionResult, RewardDecisionInput } from '@/contracts';
import { createEmailProvider } from '@/integrations/email';
import { createGiftCardProvider } from '@/integrations/gift-cards';
import { appUrl } from '@/integrations/oauth';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { decideReward } from './staff';
import { requestNow } from '@/platform/clock';

/** Server Action behind the staff reward queue (src/contracts/admin-people.ts). */
export async function decideRewardAction(input: RewardDecisionInput): Promise<ActionResult> {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await decideReward(db, createGiftCardProvider(), staff, input, await requestNow(), { provider: createEmailProvider(db), appUrl: appUrl() });
  if (result.ok) refresh();
  return result;
}
