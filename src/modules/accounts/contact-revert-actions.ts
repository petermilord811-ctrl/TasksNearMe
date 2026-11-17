'use server';

import type { ActionResult } from '@/contracts';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { redeemContactRevertLink } from './contact-revert';
import { clientIp } from './sign-in/server';

/**
 * `ContactRevertHandlers.onConfirm` ("This wasn't me", completion plan 5.23), bound to the link's token by the page.
 * No sign-in: the signed, single-use link is the proof, rate-limited per address and per link.
 */
export async function confirmContactRevertAction(token: string): Promise<ActionResult> {
  return redeemContactRevertLink({ db, now: await requestNow(), ip: await clientIp() }, token);
}
