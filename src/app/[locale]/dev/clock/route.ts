import { cookies } from 'next/headers';
import { requestNow, TEST_CLOCK_COOKIE, testClockSecret } from '@/platform/clock';
import { MAX_CLOCK_OFFSET_MS, signClockOffset } from '@/platform/clock/signing';
import { isLocalRequest } from '@/shared/local-request';

/**
 * The test clock (blueprint 10 §3.1): moves this browser's "now" for time-travel tests. Not found unless
 * the test clock is built in (development; preview and staging builds made with TEST_CLOCK=1), and
 * forbidden without the secret in `x-test-clock-secret`. POST `{ offsetMs }` or `{ at }` sets it, DELETE
 * resets it, GET shows it.
 */

function secretFor(request: Request): string | Response {
  const secret = testClockSecret();
  if (!secret) return new Response(null, { status: 404 });
  // Only on this machine (also checked in src/proxy.ts), as well as the secret.
  if (!isLocalRequest((name) => request.headers.get(name))) return new Response(null, { status: 404 });
  if (request.headers.get('x-test-clock-secret') !== secret) return new Response(null, { status: 403 });
  return secret;
}

export async function GET(request: Request) {
  const secret = secretFor(request);
  if (secret instanceof Response) return secret;
  const now = await requestNow();
  return Response.json({ now: now.toISOString(), offsetMs: now.getTime() - Date.now() });
}

export async function POST(request: Request) {
  const secret = secretFor(request);
  if (secret instanceof Response) return secret;
  const body = (await request.json().catch(() => null)) as { offsetMs?: unknown; at?: unknown } | null;
  const offset =
    typeof body?.offsetMs === 'number' ? body.offsetMs : typeof body?.at === 'string' ? Date.parse(body.at) - Date.now() : Number.NaN;
  if (!Number.isFinite(offset) || Math.abs(offset) > MAX_CLOCK_OFFSET_MS) return Response.json({ error: 'invalid_offset' }, { status: 400 });
  (await cookies()).set(TEST_CLOCK_COOKIE, signClockOffset(offset, secret), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
  return Response.json({ now: new Date(Date.now() + offset).toISOString(), offsetMs: Math.trunc(offset) });
}

export async function DELETE(request: Request) {
  const secret = secretFor(request);
  if (secret instanceof Response) return secret;
  (await cookies()).delete(TEST_CLOCK_COOKIE);
  return Response.json({ now: new Date().toISOString(), offsetMs: 0 });
}
