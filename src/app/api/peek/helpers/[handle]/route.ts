import type { HelperPeekData } from '@/contracts';
import { getHelperPeek } from '@/modules/marketing/peek';
import { requestRows } from '@/platform/auth/audience';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import { NO_STORE } from '../../../messages/_shared';

/** A person reading profiles one after another, not a script walking every handle. */
const PEEK_RATE_LIMIT = { limit: 120, windowSeconds: 60 };

/**
 * A helper's profile for the peek sheet (2026-11-23): what their public page shows this viewer, with Save's state.
 * Signed in only (the sheet lives in the signed-in app); 404 for a handle nobody the viewer may see has.
 */
export async function GET(_request: Request, { params }: RouteContext<'/api/peek/helpers/[handle]'>): Promise<Response> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return Response.json({ error: 'signed_out' }, { status: 401, headers: NO_STORE });
  const now = await requestNow();
  const limited = await consumeRateLimit(db, `peek:${viewer.user.id}`, PEEK_RATE_LIMIT, now);
  if (!limited.ok) return Response.json({ error: 'rate_limited', retryAt: limited.retryAt.toISOString() }, { status: 429, headers: NO_STORE });
  const { handle } = await params;
  const data: HelperPeekData | null = await getHelperPeek(db, viewer.user.id, String(handle).toLowerCase().slice(0, 80), await requestRows(), now);
  if (!data) return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  return Response.json(data, { headers: NO_STORE });
}
