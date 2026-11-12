'use server';

import { getTranslations } from 'next-intl/server';
import { refresh, updateTag } from 'next/cache';
import type { ActionResult, BookingActionId } from '@/contracts';
import { BOOKING_ACTION_IDS } from '@/contracts';
import { marketTag } from '@/modules/marketing/queries';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import type { ReopenedTask } from './after-cancel';
import { runBookingAction } from './hub';
import { requestNow } from '@/platform/clock';

/** Bound to the booking by the page: `bookingActionHandler.bind(null, bookingId)` (BookingHubHandlers.onAction). */
export async function bookingActionHandler(bookingId: string, input: { action: BookingActionId }): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };
  if (!(BOOKING_ACTION_IDS as readonly string[]).includes(input.action)) return { ok: false, code: 'not_allowed' };
  const contestOpening = input.action === 'contest_no_show' ? (await getTranslations('server.support'))('contestNoShowOpening') : undefined;
  let reopened: ReopenedTask | undefined;
  const result = await runBookingAction(db, viewer.user.id, String(bookingId), input.action, await requestNow(), {
    ...(contestOpening ? { contestOpening } : {}),
    onTaskReopened: (task) => {
      reopened = task;
    },
  });
  // Find a replacement put the task back on the board, the feeds and its public page.
  if (reopened) {
    updateTag('tasks');
    updateTag(`task:${reopened.slug}`);
    if (reopened.marketSlug) updateTag(marketTag(reopened.marketSlug));
  }
  if (result.ok && !result.redirectTo) refresh();
  return result;
}
