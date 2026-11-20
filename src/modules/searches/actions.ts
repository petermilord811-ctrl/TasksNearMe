'use server';

import { refresh } from 'next/cache';
import type { ActionResult, SavedSearchAlert, SavedSearchInput, SavedSearchUpdateInput } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { createSavedSearch, deleteSavedSearch, setSavedSearchAlert, updateSavedSearch } from './service';

/** Server Actions for saved searches (src/contracts/searches.ts). */

async function userId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

export async function createSavedSearchAction(input: SavedSearchInput): Promise<ActionResult> {
  const id = await userId();
  if (!id) return { ok: false, code: 'not_allowed' };
  return createSavedSearch(db, id, input, await requestNow());
}

/** The edit page's Save: name, alerts and filters (sweep SS5). */
export async function updateSavedSearchAction(input: SavedSearchUpdateInput): Promise<ActionResult> {
  const id = await userId();
  if (!id) return { ok: false, code: 'not_allowed' };
  const result = await updateSavedSearch(db, id, input, await requestNow());
  if (result.ok) refresh();
  return result;
}

export async function setSavedSearchAlertAction(input: { id: string; alert: SavedSearchAlert }): Promise<ActionResult> {
  const id = await userId();
  if (!id) return { ok: false, code: 'not_allowed' };
  const result = await setSavedSearchAlert(db, id, String(input.id), input.alert, await requestNow());
  if (result.ok) refresh();
  return result;
}

export async function deleteSavedSearchAction(input: { id: string }): Promise<ActionResult> {
  const id = await userId();
  if (!id) return { ok: false, code: 'not_allowed' };
  const result = await deleteSavedSearch(db, id, String(input.id));
  if (result.ok) refresh();
  return result;
}
