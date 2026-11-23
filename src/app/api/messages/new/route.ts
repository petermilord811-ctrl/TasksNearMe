import type { DirectChatStart } from '@/contracts';
import { getNewDirectMessagePage } from '@/modules/messaging/direct';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { directChatTargetOf } from '@/shared/chat-links';
import { NO_STORE, signedOut } from '../_shared';

const notFound = () => Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });

/**
 * Where a new conversation with someone starts (2026-11-23): `?to=<userId>`, `?helper=<handle>` or `?u=<username>`, as
 * New message links name them. Their conversation when the two have one, else the first message's form
 * (`getNewDirectMessagePage`, the New message page's data); 404 when nobody reachable goes by that. Reading it changes
 * nothing.
 */
export async function GET(request: Request): Promise<Response> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return signedOut();
  const target = directChatTargetOf(new URL(request.url).searchParams);
  if (!target) return notFound();
  const data: DirectChatStart | null = await getNewDirectMessagePage(db, viewer.user.id, target, await requestNow());
  return data ? Response.json(data, { headers: NO_STORE }) : notFound();
}
