import { getHelpChat } from '@/modules/assist/support-chat';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { STAFF_SUPPORT_CHANNEL } from '@/platform/realtime/hub';
import { realtimeHub } from '@/platform/realtime/listener';
import { NO_STORE, signedOut, supportAssistantForRequest } from '../_shared';

/**
 * The Help conversation for the chat window (2026-11-22): the open case from the assistant, or the assistant
 * (`getHelpChat`). `?read=1` while it's on screen: the case reads as read, as on its page.
 */
export async function GET(request: Request): Promise<Response> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return signedOut();
  const markRead = new URL(request.url).searchParams.get('read') === '1';
  // Support staff with a staff page open right now (2026-11-22): "No one is online" while waiting, otherwise the line.
  const agentsOnline = realtimeHub().count(STAFF_SUPPORT_CHANNEL);
  const data = await getHelpChat(db, viewer.user.id, await requestNow(), { assistant: await supportAssistantForRequest(), markRead, agentsOnline });
  if (!data) return signedOut();
  return Response.json(data, { headers: NO_STORE });
}
