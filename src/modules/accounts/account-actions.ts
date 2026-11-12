'use server';

import { headers } from 'next/headers';
import { refresh } from 'next/cache';
import type { ActionResult, EmailChangeConfirmInput, EmailInput, OneTimeCodeInput, PhoneInput, PhotoUploadResult } from '@/contracts';
import { createEmailProvider } from '@/integrations/email';
import { appUrl } from '@/integrations/oauth';
import { fileStorage } from '@/modules/tasks/server';
import { auth } from '@/platform/auth/auth';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { createContactChange, type ContactChange } from './contact-change';
import { refreshPublicProfile, removeProfilePhoto, setProfilePhoto } from './profile-photo';
import { phoneVerification } from './sign-in/server';

/**
 * Server Actions behind the account page's photo and contact details (AccountHandlers in
 * src/contracts/account.ts): the profile photo, and changing the email or phone with a 6-digit code.
 */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

let contactChange: ContactChange | undefined;
function contacts(): ContactChange {
  contactChange ??= createContactChange({ db, auth, email: createEmailProvider(db), phoneVerification, appUrl: appUrl() });
  return contactChange;
}

function refreshed(result: ActionResult): ActionResult {
  if (result.ok) refresh();
  return result;
}

/** AccountHandlers.onUploadPhoto: FormData with one `file`. */
export async function uploadProfilePhotoAction(formData: FormData): Promise<PhotoUploadResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'unknown' };
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, code: 'unsupported_type' };
  const result = await setProfilePhoto({ db, storage: fileStorage }, userId, file);
  if (result.ok) {
    await refreshPublicProfile(db, userId);
    refresh();
  }
  return result;
}

/** AccountHandlers.onRemovePhoto: back to initials. */
export async function removeProfilePhotoAction(): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await removeProfilePhoto(db, userId, await requestNow());
  await refreshPublicProfile(db, userId);
  return refreshed(result);
}

/** AccountHandlers.onStartEmailChange: a code to the new address. */
export async function startEmailChangeAction(input: EmailInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return contacts().startEmailChange(userId, await headers(), input);
}

/** AccountHandlers.onConfirmEmailChange: switches the account to the new address. */
export async function confirmEmailChangeAction(input: EmailChangeConfirmInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await contacts().confirmEmailChange(userId, await headers(), input));
}

/** AccountHandlers.onStartPhoneChange: a code by text to the new number. */
export async function startPhoneChangeAction(input: PhoneInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return contacts().startPhoneChange(userId, input);
}

/** AccountHandlers.onConfirmPhoneChange: verifies the new number. */
export async function confirmPhoneChangeAction(input: OneTimeCodeInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await contacts().confirmPhoneChange(userId, input));
}
