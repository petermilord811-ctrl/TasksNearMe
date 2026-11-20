'use server';

import { refresh } from 'next/cache';
import type { ActionResult } from '@/contracts';
import { getSessionAccountId } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { cancelAccountDeletion, requestAccountDeletion, requestDataExport } from './requests';

/**
 * The account page's privacy requests (AccountHandlers.onRequestExport, onRequestDeletion, onCancelDeletion). They
 * work for an account that hasn't finished signing up too: its data is its own whether or not it accepted the terms
 * (security review SEC18; every other action treats an unfinished sign-up as signed out).
 */

function refreshed(result: ActionResult): ActionResult {
  if (result.ok) refresh();
  return result;
}

export async function requestDataExportAction(): Promise<ActionResult> {
  const userId = await getSessionAccountId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await requestDataExport(db, userId, await requestNow()));
}

export async function requestAccountDeletionAction(): Promise<ActionResult> {
  const userId = await getSessionAccountId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await requestAccountDeletion(db, userId, await requestNow()));
}

export async function cancelAccountDeletionAction(): Promise<ActionResult> {
  const userId = await getSessionAccountId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await cancelAccountDeletion(db, userId, await requestNow()));
}
