'use server';

import { refresh } from 'next/cache';
import type { AccountProfileInput, ActionResult, NotificationChannel, NotificationTopic } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import {
  markAllNotificationsRead,
  markNotificationRead,
  requestAccountDeletion,
  requestDataExport,
  saveAccountProfile,
  saveNotificationPreference,
} from './service';
import { requestNow } from '@/platform/clock';

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

export async function openNotificationAction(input: { notificationId: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return markNotificationRead(db, userId, String(input.notificationId), await requestNow());
}

export async function saveAccountProfileAction(input: AccountProfileInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const limited = await consumeRateLimit(db, `account:${userId}`, { limit: 20, windowSeconds: 600 });
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  return refreshed(await saveAccountProfile(db, userId, input, await requestNow()));
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
