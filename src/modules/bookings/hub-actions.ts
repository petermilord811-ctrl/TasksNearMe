'use server';

import { refresh } from 'next/cache';
import type { ActionResult, BookingActionId } from '@/contracts';
import { BOOKING_ACTION_IDS } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { runBookingAction } from './hub';

/** Bound to the booking by the page: `bookingActionHandler.bind(null, bookingId)` (BookingHubHandlers.onAction). */
export async function bookingActionHandler(bookingId: string, input: { action: BookingActionId }): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };
  if (!(BOOKING_ACTION_IDS as readonly string[]).includes(input.action)) return { ok: false, code: 'not_allowed' };
  const result = await runBookingAction(db, viewer.user.id, String(bookingId), input.action, new Date());
  if (result.ok && !result.redirectTo) refresh();
  return result;
}
