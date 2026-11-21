import { limitAddress } from '@/modules/accounts/sign-in/server';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';

/**
 * Whether this browser is still signed in, and nothing else (bad connections pass, J-N2): after an action fails in a way a
 * lost session explains, the page asks here, so it can say "You've been signed out" with a way back to sign in. Read
 * through getViewer like every other page and route (a blocked account, or one that hasn't finished signing up, reads as
 * signed out; security review SEC18). Better Auth's own endpoints stay closed (src/modules/accounts/auth-routes.ts); this
 * is outside the proxy (/api), so a signed-out page can ask. A per-address limit, like the other public endpoints.
 */
export async function GET(): Promise<Response> {
  const noStore = { 'cache-control': 'no-store' };
  const ip = await limitAddress();
  if (ip && !(await consumeRateLimit(db, `session-check:ip:${ip}`, { limit: 60, windowSeconds: 10 * 60 })).ok) return new Response(null, { status: 429, headers: noStore });
  const viewer = await getViewer().catch(() => undefined);
  if (!viewer) return new Response(null, { status: 503, headers: noStore });
  return Response.json({ signedIn: viewer.kind === 'user' }, { headers: noStore });
}
