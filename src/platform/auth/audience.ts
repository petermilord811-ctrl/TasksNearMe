import 'server-only';
import { getSessionCookie } from 'better-auth/cookies';
import { rowsFor, type DataAudience, type RowScope } from '@/shared/sample-data';
import { authRequestHeaders } from './request-headers';

/**
 * Who a public page or stream is drawn for (src/shared/sample-data.ts): `testers` when the request carries a session
 * cookie, `public` otherwise. Optimistic, like src/proxy.ts: no database read, and a forged cookie only reveals the
 * fictional people of the demo marketplace.
 */
export function audienceOf(request: Request | Headers): DataAudience {
  return getSessionCookie(request) ? 'testers' : 'public';
}

/**
 * The rows this request's public page reads. It reads the request's cookies, so a page calls it inside a
 * `<Suspense>` boundary (never inside `'use cache'`) and passes the result to its cached reads.
 */
export async function requestRows(): Promise<RowScope> {
  return rowsFor(audienceOf(await authRequestHeaders()));
}
