'use server';

import { refresh } from 'next/cache';
import type { ActionResult } from '@/contracts';
import { createGiftCardProvider } from '@/integrations/gift-cards';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { redeemReward } from './service';

/** Server Action behind `/app/rewards` (src/contracts/rewards.ts). */
export async function redeemRewardAction(input: { grantId: string }): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };
  const result = await redeemReward({ db, giftCards: createGiftCardProvider() }, viewer.user.id, String(input.grantId), new Date());
  if (result.ok) refresh();
  return result;
}
