import { createECDH, createPrivateKey, hkdfSync, randomBytes, sign, createCipheriv, type KeyObject } from 'node:crypto';

/**
 * Web Push without a dependency (blueprint 07: Web Push API + VAPID): the message is encrypted for the
 * browser that subscribed (RFC 8291, `aes128gcm` from RFC 8188), so the push service in between (Google,
 * Apple, Mozilla) can't read it, and the request is signed with our VAPID key (RFC 8292). Keys come from
 * `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY` (`npm run push:keys` makes a pair locally); without them
 * push is off and the app says so.
 */

export interface PushSubscriptionKeys {
  endpoint: string;
  /** The browser's P-256 public key (base64url, uncompressed, 65 bytes). */
  p256dh: string;
  /** The browser's 16-byte auth secret (base64url). */
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Where a tap opens (absolute). */
  url: string;
  /** Replaces an earlier notification with the same tag on the device. */
  tag?: string;
}

export type PushResult = { status: 'sent' } | { status: 'gone' } | { status: 'failed'; httpStatus?: number; retry: boolean };

export interface PushSender {
  readonly name: string;
  /** The key browsers subscribe with (base64url). */
  readonly publicKey: string;
  send(subscription: PushSubscriptionKeys, message: PushMessage, options?: { urgent?: boolean; ttlSeconds?: number }): Promise<PushResult>;
}

const b64url = (buffer: Buffer | Uint8Array) => Buffer.from(buffer).toString('base64url');
const fromB64url = (text: string) => Buffer.from(text, 'base64url');
const RECORD_SIZE = 4096;

/**
 * The encrypted body for one subscription (RFC 8291 §3-4): a header with the salt, the record size and our
 * one-time public key, then the AES-128-GCM record. `serverKeys` and `salt` are random unless a test fixes them.
 */
export function encryptPushPayload(
  plaintext: Buffer,
  subscription: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>,
  fixed: { serverPrivateKey?: Buffer; salt?: Buffer } = {},
): Buffer {
  const uaPublic = fromB64url(subscription.p256dh);
  const authSecret = fromB64url(subscription.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('Not a valid push subscription');
  const ecdh = createECDH('prime256v1');
  if (fixed.serverPrivateKey) ecdh.setPrivateKey(fixed.serverPrivateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);
  const salt = fixed.salt ?? randomBytes(16);

  // RFC 8291 §3.4: the input keying material, bound to both public keys.
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));
  // RFC 8188 §2.2-2.3: the content key and nonce.
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  // One record: the message, then the last-record delimiter (2).
  if (plaintext.length + 1 + 16 > RECORD_SIZE) throw new Error('Push message too long');
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, encrypted]);
}

/** VAPID (RFC 8292): a short-lived ES256 token for the push service's origin. */
export function vapidAuthorization(endpoint: string, keys: { publicKey: string; privateKey: string }, subject: string, now: Date): string {
  const publicKey = fromB64url(keys.publicKey);
  const key: KeyObject = createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64url(publicKey.subarray(1, 33)), y: b64url(publicKey.subarray(33, 65)) },
  });
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: subject })));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}

export function createWebPushSender(config: { publicKey: string; privateKey: string; subject: string; fetch?: typeof fetch; now?: () => Date }): PushSender {
  const doFetch = config.fetch ?? fetch;
  return {
    name: 'web-push',
    publicKey: config.publicKey,
    async send(subscription, message, options = {}) {
      const body = encryptPushPayload(Buffer.from(JSON.stringify(message), 'utf8'), subscription);
      let response: Response;
      try {
        response = await doFetch(subscription.endpoint, {
          method: 'POST',
          headers: {
            Authorization: vapidAuthorization(subscription.endpoint, config, config.subject, config.now?.() ?? new Date()),
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: String(options.ttlSeconds ?? 24 * 3600),
            Urgency: options.urgent ? 'high' : 'normal',
            ...(message.tag ? { Topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}),
          },
          body: new Uint8Array(body),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        return { status: 'failed', retry: true };
      }
      if (response.status === 201 || response.status === 202 || response.status === 200) return { status: 'sent' };
      // The browser unsubscribed or the subscription expired: forget it.
      if (response.status === 404 || response.status === 410) return { status: 'gone' };
      return { status: 'failed', httpStatus: response.status, retry: response.status === 429 || response.status >= 500 };
    },
  };
}

/** Push for this environment: on with a VAPID key pair, off (null) without one. */
export function pushSenderFromEnv(env: Record<string, string | undefined> = process.env): PushSender | null {
  const publicKey = env.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const appUrl = env.APP_URL?.trim() ?? '';
  // Push services want a contact: https or mailto (Apple refuses anything else).
  const subject = env.WEB_PUSH_SUBJECT?.trim() || (appUrl.startsWith('https://') ? appUrl : 'mailto:push@example.com');
  return createWebPushSender({ publicKey, privateKey, subject });
}

/** A new VAPID key pair (base64url: the raw public point, the raw private scalar). */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(ecdh.getPrivateKey()) };
}
