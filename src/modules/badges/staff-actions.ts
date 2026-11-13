'use server';

import { refresh } from 'next/cache';
import type { ActionResult, BadgeModerationInput } from '@/contracts';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { moderateBadge } from './staff';

/** Revoke or restore a badge on a person's staff page (trust and safety, leads, admins; completion plan 6.4). */
export async function moderateBadgeAction(input: BadgeModerationInput): Promise<ActionResult> {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await moderateBadge(db, staff, input, await requestNow());
  if (result.ok) refresh();
  return result;
}
