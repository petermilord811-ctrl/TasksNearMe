import { createDecipheriv, createECDH, createPublicKey, hkdfSync, verify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createWebPushSender, encryptPushPayload, generateVapidKeys, pushSenderFromEnv, vapidAuthorization } from './web-push';

const b64 = (text: string) => Buffer.from(text, 'base64url');

/** RFC 8291 §5: the worked example. */
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

/** What a browser does with the body (RFC 8291 from the receiving side). */
function decrypt(body: Buffer, uaPrivate: Buffer, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const uaPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(asPublic);
  const ikm = Buffer.from(hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const record = body.subarray(21 + idlen);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const padded = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  return padded.subarray(0, padded.lastIndexOf(2)).toString('utf8');
}

describe('web push', () => {
  it('encrypts exactly as RFC 8291 shows', () => {
    const body = encryptPushPayload(Buffer.from(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, { serverPrivateKey: b64(RFC.asPrivate), salt: b64(RFC.salt) });
    expect(body.toString('base64url')).toBe(RFC.body);
    expect(decrypt(body, b64(RFC.uaPrivate), b64(RFC.auth))).toBe(RFC.plaintext);
  });

  it('uses a fresh key and salt for every message, which the browser can still read', () => {
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const subscription = { p256dh: browser.getPublicKey().toString('base64url'), auth: RFC.auth };
    const first = encryptPushPayload(Buffer.from('{"title":"Hi"}'), subscription);
    const second = encryptPushPayload(Buffer.from('{"title":"Hi"}'), subscription);
    expect(first.subarray(0, 16).equals(second.subarray(0, 16))).toBe(false);
    expect(decrypt(first, browser.getPrivateKey(), b64(RFC.auth))).toBe('{"title":"Hi"}');
    expect(() => encryptPushPayload(Buffer.from('x'), { p256dh: 'short', auth: RFC.auth })).toThrow();
  });

  it('signs the push service request with a VAPID token for its origin', () => {
    const keys = generateVapidKeys();
    const now = new Date('2026-11-17T15:00:00.000Z');
    const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'mailto:push@example.com', now);
    const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(key).toBe(keys.publicKey);
    const [h, c, s] = token!.split('.');
    expect(JSON.parse(b64(c!).toString())).toEqual({ aud: 'https://fcm.googleapis.com', exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: 'mailto:push@example.com' });
    const publicKey = b64(keys.publicKey);
    const jwk = { kty: 'EC', crv: 'P-256', x: publicKey.subarray(1, 33).toString('base64url'), y: publicKey.subarray(33).toString('base64url') };
    expect(verify('sha256', Buffer.from(`${h}.${c}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, b64(s!))).toBe(true);
  });

  it('reads the push service answer: sent, gone (unsubscribed), or failed with a retry when it may pass', async () => {
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const subscription = { endpoint: 'https://push.example/abc', p256dh: browser.getPublicKey().toString('base64url'), auth: RFC.auth };
    const answer = (status: number) => vi.fn(async () => new Response(null, { status }));
    const keys = generateVapidKeys();
    const sender = (status: number) => createWebPushSender({ ...keys, subject: 'mailto:push@example.com', fetch: answer(status) as unknown as typeof fetch });
    const message = { title: 'New offer', body: 'Jordan offered $60', url: 'https://app.example/app/tasks/t1' };
    expect(await sender(201).send(subscription, message)).toEqual({ status: 'sent' });
    expect(await sender(410).send(subscription, message)).toEqual({ status: 'gone' });
    expect(await sender(503).send(subscription, message)).toEqual({ status: 'failed', httpStatus: 503, retry: true });
    expect(await sender(400).send(subscription, message)).toEqual({ status: 'failed', httpStatus: 400, retry: false });
    const fetcher = answer(201);
    await createWebPushSender({ ...keys, subject: 'mailto:push@example.com', fetch: fetcher as unknown as typeof fetch }).send(subscription, { ...message, tag: 'ntf_123' }, { urgent: true });
    const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', Urgency: 'high', TTL: '86400', Topic: 'ntf_123' });
  });

  it('is on only with a key pair', () => {
    expect(pushSenderFromEnv({})).toBeNull();
    const keys = generateVapidKeys();
    expect(pushSenderFromEnv({ WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey })?.publicKey).toBe(keys.publicKey);
  });
});
