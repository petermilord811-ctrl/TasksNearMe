'use server';

import { refresh } from 'next/cache';
import type { ActionResult, HelperSuspensionInput } from '@/contracts';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { setHelperSuspension } from './staff';

/** Server Action behind a person's staff page (src/contracts/admin-people.ts). */
export async function setHelperSuspensionAction(userId: string, input: HelperSuspensionInput): Promise<ActionResult> {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await setHelperSuspension(db, staff, String(userId), input, new Date());
  if (result.ok) refresh();
  return result;
}
