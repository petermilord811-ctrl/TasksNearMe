import type { ChatInboxData } from '@/contracts';
import { getHelpSummary } from '@/modules/assist/support-chat';
import { getInbox } from '@/modules/messaging/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { NO_STORE, signedOut, supportAssistantForRequest } from '../_shared';

/**
 * The chat window's conversations (2026-11-22): the same list as `/app/messages` (`getInbox`, the viewer's own
 * conversations, masked for them), and the pinned Help row. Reading it marks nothing read.
 */
export async function GET(): Promise<Response> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return signedOut();
  const now = await requestNow();
  const [inbox, help] = await Promise.all([getInbox(db, viewer.user.id, now), getHelpSummary(db, viewer.user.id, await supportAssistantForRequest())]);
  const data: ChatInboxData = { ...inbox, help };
  return Response.json(data, { headers: NO_STORE });
}
