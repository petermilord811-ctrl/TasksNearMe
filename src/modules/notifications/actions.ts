'use server';

import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import type { AccountProfileInput, ActionResult, NotificationChannel, NotificationTopic, PushSubscriptionInput } from '@/contracts';
import { refreshPublicProfile } from '@/modules/accounts/profile-photo';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import {
  markAllNotificationsRead,
  markNotificationRead,
  saveAccountProfile,
  saveNotificationPreference,
} from './service';
import { requestNow } from '@/platform/clock';
import { checkPushSubscription, removePushSubscription, savePushSubscription } from './push';
import { cancelAccountDeletion, requestAccountDeletion, requestDataExport } from '@/modules/privacy/requests';

/** Server Actions behind the notifications and account pages (src/contracts/account.ts). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

function refreshed(result: ActionResult): ActionResult {
  if (result.ok) refresh();
  return result;
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await markAllNotificationsRead(db, userId, await requestNow()));
}

/** Opening one reads it, and the page refreshes: the bell's count is in the shell, which stays as it is between pages (sweep MN6). */
export async function openNotificationAction(input: { notificationId: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await markNotificationRead(db, userId, String(input.notificationId), await requestNow()));
}

export async function saveAccountProfileAction(input: AccountProfileInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const limited = await consumeRateLimit(db, `account:${userId}`, { limit: 20, windowSeconds: 600 });
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const result = await saveAccountProfile(db, userId, input, await requestNow());
  // The name shows on a helper's public profile.
  if (result.ok) await refreshPublicProfile(db, userId);
  return refreshed(result);
}

export async function saveNotificationPreferenceAction(input: { topic: NotificationTopic; channel: NotificationChannel; enabled: boolean }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await saveNotificationPreference(db, userId, input, await requestNow()));
}

export async function requestDataExportAction(): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await requestDataExport(db, userId, await requestNow()));
}

export async function requestAccountDeletionAction(): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await requestAccountDeletion(db, userId, await requestNow()));
}

export async function cancelAccountDeletionAction(): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await cancelAccountDeletion(db, userId, await requestNow()));
}

export async function savePushSubscriptionAction(input: PushSubscriptionInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return savePushSubscription(db, userId, input, (await headers()).get('user-agent'), await requestNow());
}

/** AppShellHandlers.onCheckPushDevice: this browser's subscription as a signed-in page loads (sweep MN5). */
export async function checkPushSubscriptionAction(input: { endpoint: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return checkPushSubscription(db, userId, String(input?.endpoint ?? ''));
}

export async function removePushSubscriptionAction(input: { endpoint: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return removePushSubscription(db, userId, String(input?.endpoint ?? ''));
}
