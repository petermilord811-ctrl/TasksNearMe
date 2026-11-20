import { and, eq, ne } from 'drizzle-orm';
import { pushSubscriptionInputSchema, type ActionResult, type PushSetup, type PushSubscriptionInput } from '@/contracts';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import { pushSubscriptions } from './schema';

/**
 * Notifications on a device (Web Push, the third channel of T-29; src/integrations/push sends them).
 * The server posts to whatever endpoint a browser hands over, so only the push services browsers use are
 * taken: Google (Chrome, Android, Samsung, Opera, Brave), Mozilla (Firefox), Apple (Safari, iPhone Home
 * Screen apps) and Windows (Edge).
 */

const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
const SAVE_RULE = { limit: 20, windowSeconds: 60 * 60 };

export function isPushServiceEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

/** Push on this site, when its key pair is set. */
export function pushSetup(env: Record<string, string | undefined> = process.env): PushSetup | undefined {
  const publicKey = env.WEB_PUSH_PUBLIC_KEY?.trim();
  return publicKey && env.WEB_PUSH_PRIVATE_KEY?.trim() ? { publicKey } : undefined;
}

export async function savePushSubscription(db: Db, userId: string, input: PushSubscriptionInput, userAgent: string | null, now: Date): Promise<ActionResult> {
  const parsed = pushSubscriptionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  if (!isPushServiceEndpoint(parsed.data.endpoint)) return { ok: false, code: 'validation_failed', fieldErrors: { endpoint: ['invalid'] } };
  const limited = await consumeRateLimit(db, `push-subscribe:user:${userId}`, SAVE_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited' };
  const values = { userId, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null, createdAt: now };
  await db
    .insert(pushSubscriptions)
    .values({ id: newId('psh'), ...values })
    // The same browser: refresh its keys, and move it to whoever is signed in now.
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
  return { ok: true, code: 'updated' };
}

/**
 * Whose this browser's notifications are, as a signed-in page loads (sweep MN5). The person's own: ok. Another
 * account's (it never signed out here, or its session ran out): that account stops getting them on this browser, and
 * like nobody's, `not_found`, so the browser lets go of the subscription and its switch reads off until this person
 * turns it on. A row this person saved meanwhile is never the one taken away.
 */
export async function checkPushSubscription(db: Db, userId: string, endpoint: string): Promise<ActionResult> {
  const [row] = await db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, String(endpoint ?? ''))).limit(1);
  if (row?.userId === userId) return { ok: true, code: 'updated' };
  if (row) await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, String(endpoint)), ne(pushSubscriptions.userId, userId)));
  return { ok: false, code: 'not_found' };
}

export async function removePushSubscription(db: Db, userId: string, endpoint: string): Promise<ActionResult> {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, String(endpoint ?? ''))));
  return { ok: true, code: 'updated' };
}
