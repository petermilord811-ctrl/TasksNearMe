'use server';

import { refresh } from 'next/cache';
import type { AccountActionInput, ActionResult } from '@/contracts';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { moderateAccount } from './account-moderation';

/** Suspend, ban (two reviewers) or reinstate an account from the person page (completion plan 5.14). */
export async function accountActionAction(userId: string, input: AccountActionInput): Promise<ActionResult> {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await moderateAccount(db, staff, String(userId), input, await requestNow());
  if (result.ok) refresh();
  return result;
}
