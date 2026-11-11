'use server';

import { and, eq } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import type { ActionResult, OfferActionId, TaskActionId, TaskCancelReason } from '@/contracts';
import { routes, TASK_CANCEL_REASONS } from '@/contracts';
import { categories } from '@/modules/markets/schema';
import { tasks } from '@/modules/tasks/schema';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { posterOfferActions } from './domain';
import { cancelTask, declineOffer } from './owner';
import { offers } from './schema';

/** Server Actions behind the owner screens (src/contracts/offers.ts, TaskOwnerHandlers). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

function refreshTaskPages(taskSlug?: string) {
  updateTag('tasks');
  if (taskSlug) updateTag(`task:${taskSlug}`);
}

export async function posterOfferAction(input: { offerId: string; action: OfferActionId }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const [row] = await db
    .select({ offer: offers, task: tasks })
    .from(offers)
    .innerJoin(tasks, eq(tasks.id, offers.taskId))
    .where(and(eq(offers.id, String(input.offerId)), eq(tasks.posterUserId, userId)))
    .limit(1);
  if (!row) return { ok: false, code: 'not_found' };

  // Only actions the domain offers right now are allowed.
  const allowed = posterOfferActions(row.offer, row.task, new Date()).find((action) => action.id === input.action);
  if (!allowed?.enabled) return { ok: false, code: 'not_allowed' };

  switch (input.action) {
    case 'book_offer':
      return { ok: true, code: 'updated', redirectTo: routes.app.confirmOffer(row.task.id, row.offer.id) };
    case 'message_helper':
      // Offer threads arrive with messaging (UI-014); until then, the inbox.
      return { ok: true, code: 'updated', redirectTo: routes.app.messages() };
    case 'decline_offer': {
      const result = await declineOffer(db, userId, row.offer.id, new Date());
      if (result.ok) refreshTaskPages(row.task.slug);
      return result;
    }
    default:
      return { ok: false, code: 'not_allowed' };
  }
}

export async function taskOwnerAction(taskId: string, input: { action: Exclude<TaskActionId, 'cancel_task'> }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const [task] = await db
    .select({ status: tasks.status, categorySlug: categories.slug })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(and(eq(tasks.id, String(taskId)), eq(tasks.posterUserId, userId)))
    .limit(1);
  if (!task) return { ok: false, code: 'not_found' };
  if (input.action === 'post_again' && ['completed', 'canceled', 'expired'].includes(task.status)) {
    return { ok: true, code: 'updated', redirectTo: `${routes.app.newTask()}?category=${task.categorySlug}` };
  }
  return { ok: false, code: 'not_allowed' };
}

export async function cancelTaskAction(taskId: string, input: { reason: TaskCancelReason }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  if (!(TASK_CANCEL_REASONS as readonly string[]).includes(input.reason)) {
    return { ok: false, code: 'validation_failed', fieldErrors: { reason: ['required'] } };
  }
  const [task] = await db.select({ slug: tasks.slug }).from(tasks).where(eq(tasks.id, String(taskId))).limit(1);
  const result = await cancelTask(db, userId, String(taskId), input.reason, new Date());
  if (result.ok) refreshTaskPages(task?.slug);
  return result;
}
