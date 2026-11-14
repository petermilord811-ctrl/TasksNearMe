'use server';

import { refresh, updateTag } from 'next/cache';
import type { ActionResult, StaffCancelInput } from '@/contracts';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { bookingDeps } from './server';
import { cancelBookingByStaff } from './sheets';

/** Support cancels a booking from its staff page, with the whole charge refunded (completion plan 5.14). */
export async function staffCancelBookingAction(bookingId: string, input: StaffCancelInput): Promise<ActionResult> {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  const deps = bookingDeps();
  if (!staff || !deps) return { ok: false, code: 'not_allowed' };
  const result = await cancelBookingByStaff(deps, staff, String(bookingId), input, await requestNow());
  if (result.ok) {
    updateTag('tasks');
    refresh();
  }
  return result;
}
