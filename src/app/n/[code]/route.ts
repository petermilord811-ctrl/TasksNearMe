import { NextResponse } from 'next/server';
import { limitAddress } from '@/modules/accounts/sign-in/server';
import { shortLinkPath } from '@/modules/notifications/short-links';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';

/**
 * A text message's short link (messages pass J-M9, ab's decision): /n/<code> opens the notification's page in its
 * recipient's language. That page still asks for sign-in, so the code alone shows nothing. An unknown code is not
 * found, and each address gets a per-address limit like the other public links. It lives outside [locale]: the proxy's
 * matcher leaves /n/ alone (src/proxy.ts), so there's no language rewrite or sample-page lookup on the way.
 */
export async function GET(request: Request, { params }: RouteContext<'/n/[code]'>): Promise<Response> {
  const { code } = await params;
  const noStore = { 'cache-control': 'no-store' };
  const ip = await limitAddress();
  if (ip && !(await consumeRateLimit(db, `short-link:ip:${ip}`, { limit: 60, windowSeconds: 10 * 60 })).ok) {
    return new Response('Too many requests', { status: 429, headers: { ...noStore, 'retry-after': '600' } });
  }
  const path = await shortLinkPath(db, code);
  if (!path) return new Response('Not found', { status: 404, headers: noStore });
  const response = NextResponse.redirect(new URL(path, request.url), 307);
  response.headers.set('cache-control', 'no-store');
  return response;
}
