'use server';

import { refresh } from 'next/cache';
import type { ActionResult } from '@/contracts';
import { createEmailProvider } from '@/integrations/email';
import { createGiftCardProvider } from '@/integrations/gift-cards';
import { appUrl } from '@/integrations/oauth';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { redeemReward } from './service';
import { requestNow } from '@/platform/clock';

/** Server Action behind `/app/rewards` (src/contracts/rewards.ts). */
export async function redeemRewardAction(input: { grantId: string }): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };
  const email = { provider: createEmailProvider(db), appUrl: appUrl() };
  const result = await redeemReward({ db, giftCards: createGiftCardProvider(), email }, viewer.user.id, String(input.grantId), await requestNow());
  if (result.ok) refresh();
  return result;
}
