'use server';

import { refresh } from 'next/cache';
import type { ActionResult, BookingChatActionInput } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { runBookingChatAction } from './chat-run';

/**
 * A booking's day-of chip from its conversation (2026-11-24; ThreadHandlers.onBookingAction): bound to the conversation
 * by the page, `bookingChatAction.bind(null, threadId)`. The page refreshes with the status line.
 */
export async function bookingChatAction(threadId: string, input: BookingChatActionInput): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };
  const result = await runBookingChatAction(db, viewer.user.id, String(threadId), input, await requestNow());
  if (result.ok && !result.redirectTo) refresh();
  return result;
}

/** The chat window's: the same, without refreshing the page behind it (the window reads the conversation again). */
export async function bookingChatFromWindowAction(threadId: string, input: BookingChatActionInput): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };
  return runBookingChatAction(db, viewer.user.id, String(threadId), input, await requestNow());
}
