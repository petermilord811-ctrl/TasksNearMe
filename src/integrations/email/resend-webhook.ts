import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Resend's webhooks (sent through Svix): each request is signed with the endpoint's secret (`whsec_…`,
 * RESEND_WEBHOOK_SECRET). The signature is an HMAC-SHA256 of `id.timestamp.body` with the decoded secret;
 * the header lists one or more `v1,<base64>` signatures (several while a secret rotates). Requests older or
 * newer than five minutes are refused, so a captured request can't be replayed later.
 */

const TOLERANCE_SECONDS = 5 * 60;

export function verifyResendWebhook(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: Date;
}): boolean {
  const { secret, id, timestamp, signature, body } = input;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Signs a body the way Resend does (tests, and checking a setup by hand). */
export function signResendWebhook(secret: string, id: string, timestamp: number, body: string): string {
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

/** The events that change where we send: a permanent bounce, or the person marking it as spam. */
export interface EmailFeedbackEvent {
  kind: 'bounced' | 'complained';
  to: string[];
  /** The provider's words ("Mailbox does not exist"). */
  detail: string;
}

/** The event in a webhook body, when it's one we act on (others are acknowledged and ignored). */
export function parseResendEvent(body: string): EmailFeedbackEvent | null {
  let payload: { type?: unknown; data?: { to?: unknown; bounce?: { message?: unknown; type?: unknown; subType?: unknown } } };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    return null;
  }
  const to = (Array.isArray(payload.data?.to) ? payload.data.to : [payload.data?.to])
    .filter((address): address is string => typeof address === 'string' && address.includes('@'))
    .map((address) => address.trim().toLowerCase());
  if (to.length === 0) return null;
  if (payload.type === 'email.complained') return { kind: 'complained', to, detail: 'Marked as spam' };
  if (payload.type === 'email.bounced') {
    const bounce = payload.data?.bounce;
    // A temporary problem (a full mailbox) isn't a reason to stop for good.
    if (typeof bounce?.type === 'string' && bounce.type.toLowerCase() !== 'permanent') return null;
    const detail = [bounce?.subType, bounce?.message].filter((part): part is string => typeof part === 'string' && part.length > 0).join(': ');
    return { kind: 'bounced', to, detail: detail.slice(0, 300) || 'Bounced' };
  }
  return null;
}
