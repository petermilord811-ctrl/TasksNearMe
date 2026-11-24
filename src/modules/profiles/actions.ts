'use server';

import { refresh } from 'next/cache';
import type { ActionResult, ContactSharingSetting, HelperContactReveal } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { revealHelperContact, saveContactSharing } from './contact-sharing';

/**
 * "Show email and phone" on a helper's profile (2026-11-24): the details the helper shares, for a signed-in neighbor
 * who has earned a top Sparks level. Limited per day and written to the audit log.
 */
export async function revealHelperContactAction(input: { helperId: string }): Promise<HelperContactReveal> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };
  return revealHelperContact(db, viewer.user.id, input, await requestNow());
}

/** "Contact details on your profile" on the account page: what a helper shares with top Sparks levels. */
export async function saveContactSharingAction(input: { setting: ContactSharingSetting }): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };
  const result = await saveContactSharing(db, viewer.user.id, input, await requestNow());
  if (result.ok) refresh();
  return result;
}
