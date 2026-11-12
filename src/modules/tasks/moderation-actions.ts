'use server';

import { refresh, updateTag } from 'next/cache';
import type { ActionResult, TaskModerationInput } from '@/contracts';
import { marketTag } from '@/modules/marketing/queries';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { moderateTask } from './moderation';

/** Staff moderate a task (UI-033); the public pages that list it are refreshed. */
export async function moderateTaskAction(taskId: string, input: TaskModerationInput): Promise<ActionResult> {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) return { ok: false, code: 'not_allowed' };
  const outcome = await moderateTask(db, staff, String(taskId), input, new Date());
  if (outcome.result.ok) {
    updateTag('tasks');
    if (outcome.slug) updateTag(`task:${outcome.slug}`);
    if (outcome.marketSlug) updateTag(marketTag(outcome.marketSlug));
    refresh();
  }
  return outcome.result;
}
