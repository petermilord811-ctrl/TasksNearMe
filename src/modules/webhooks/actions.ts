'use server';

import { refresh } from 'next/cache';
import type { ActionResult, WebhookActionInput } from '@/contracts';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { actOnWebhook } from './staff';

/** Replay or dismiss a failing webhook event (admins and finance; completion plan 5.11). */
export async function webhookAction(input: WebhookActionInput): Promise<ActionResult> {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await actOnWebhook(db, staff, input, await requestNow());
  refresh();
  return result;
}
