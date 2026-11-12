'use server';

import { refresh } from 'next/cache';
import type { ActionResult, HelperSuspensionInput, StaffRoleGrantInput, StaffRoleRemoveInput, StrikeReversalInput } from '@/contracts';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { reverseStrike, setHelperSuspension } from './staff';
import { grantStaffRole, removeStaffRole } from './staff-roles';
import { requestNow } from '@/platform/clock';

/** Server Action behind a person's staff page (src/contracts/admin-people.ts). */
export async function setHelperSuspensionAction(userId: string, input: HelperSuspensionInput): Promise<ActionResult> {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await setHelperSuspension(db, staff, String(userId), input, await requestNow());
  if (result.ok) refresh();
  return result;
}

/** Reverse a strike on appeal (trust and safety, leads, admins). */
export async function reverseStrikeAction(userId: string, input: StrikeReversalInput): Promise<ActionResult> {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await reverseStrike(db, staff, String(userId), input, await requestNow());
  if (result.ok) refresh();
  return result;
}

async function signedInStaff() {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
}

/** Admins grant a staff role (UI-037). */
export async function grantStaffRoleAction(input: StaffRoleGrantInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await grantStaffRole(db, staff, input, await requestNow());
  if (result.ok) refresh();
  return result;
}

/** Admins remove a staff role (UI-037). */
export async function removeStaffRoleAction(input: StaffRoleRemoveInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await removeStaffRole(db, staff, input, await requestNow());
  if (result.ok) refresh();
  return result;
}
