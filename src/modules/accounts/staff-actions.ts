'use server';

import { refresh } from 'next/cache';
import type { ActionResult, HelperSuspensionInput, StaffGrantDecisionInput, StaffRoleGrantInput, StaffRoleRemoveInput, StaffAuthenticatorResetInput, StaffSetupCodeResult, StrikeReversalInput } from '@/contracts';
import { createEmailProvider } from '@/integrations/email';
import { appUrl } from '@/integrations/oauth';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { reverseStrike, setHelperSuspension } from './staff';
import { announceStaffGrant } from './staff-grant-notice';
import { decideStaffGrant, grantStaffRole, removeStaffRole, type StaffGrantAnnouncement } from './staff-roles';
import { requestNow } from '@/platform/clock';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createSetupCode, resetAuthenticator } from './staff-authenticator';
import { devHelpersOn } from '@/shared/dev-helpers';

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

/** Every admin hears of a role that took effect (security review SEC19). */
const announce = (grant: StaffGrantAnnouncement) => announceStaffGrant({ db, email: createEmailProvider(db), appUrl: appUrl() }, grant);

/** Admins grant a staff role (UI-037): at once while there's one admin, otherwise for a second admin to approve. */
export async function grantStaffRoleAction(input: StaffRoleGrantInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await grantStaffRole(db, staff, input, await requestNow(), announce);
  if (result.ok) refresh();
  return result;
}

/** A second admin approves or declines a waiting grant (security review SEC19). */
export async function decideStaffGrantAction(input: StaffGrantDecisionInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await decideStaffGrant(db, staff, input, await requestNow(), announce);
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

function authenticatorDeps() {
  return { db, cipher: fieldCipherFromEnv(), secret: process.env.BETTER_AUTH_SECRET ?? '', production: !devHelpersOn() };
}

/** Admins: a one-time setup code for a staff member's authenticator (shown once, 24 hours). */
export async function createStaffSetupCodeAction(input: { userId: string }): Promise<StaffSetupCodeResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  return createSetupCode(authenticatorDeps(), staff, String(input?.userId ?? ''), await requestNow());
}

/** Admins: remove a lost authenticator (the person sets a new one up with a setup code). */
export async function resetStaffAuthenticatorAction(input: StaffAuthenticatorResetInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await resetAuthenticator(authenticatorDeps(), staff, input, await requestNow());
  if (result.ok) refresh();
  return result;
}
