'use server';

import { refresh } from 'next/cache';
import type { ActionResult, TransferReversalInput } from '@/contracts';
import { stripeConnectFromEnv } from '@/integrations/payments/stripe-connect';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { reverseTransfer } from './reversals';

/** Finance takes back a helper's transfer on a booking, naming the case (completion plan 5.13). */
export async function reverseTransferAction(bookingId: string, input: TransferReversalInput): Promise<ActionResult> {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await reverseTransfer(db, stripeConnectFromEnv(), staff, String(bookingId), input, await requestNow());
  refresh();
  return result;
}
