import os from 'node:os';
import path from 'node:path';
import { and, desc, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appUrl } from '@/integrations/oauth';
import { createDevOutboxEmailProvider, type EmailProvider } from '@/integrations/email';
import { createDevOutboxSmsSender } from '@/integrations/sms';
import { createLocalFileStorage } from '@/integrations/storage';
import { createContactChange } from '@/modules/accounts/contact-change';
import { createPhoneVerification } from '@/modules/accounts/phone-verification';
import { removeProfilePhoto, setProfilePhoto } from '@/modules/accounts/profile-photo';
import { users } from '@/modules/accounts/schema';
import { canViewFile } from '@/modules/files/access';
import { isCurrentProfilePhoto } from '@/modules/files/related-access';
import { getAccountPage } from '@/modules/notifications/service';
import { files } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createAuth } from '@/platform/auth/config';
import { createDb } from '@/platform/db/connect';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';

/**
 * Changing the email and phone from the account page (6-digit codes), and the profile photo. Each person
 * signs in through Better Auth's real endpoints, so the email change runs against a real session.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const auth = createAuth(db, { nextCookies: false });
afterAll(() => pool.end());

const BASE = appUrl();
const sent: { to: string; tag?: string }[] = [];
const outbox = createDevOutboxEmailProvider(db);
const email: EmailProvider = { name: 'recording', send: async (message) => { sent.push({ to: message.to, tag: message.tag }); await outbox.send(message); } };
const phoneVerification = createPhoneVerification({ db, sms: createDevOutboxSmsSender(db), secret: 'test-secret' });
const contacts = createContactChange({ db, auth, email, phoneVerification, appUrl: BASE });

async function latest(to: string, channel: 'email' | 'sms' = 'email') {
  const [row] = await db
    .select({ body: devOutboxMessages.body, tag: devOutboxMessages.tag })
    .from(devOutboxMessages)
    .where(and(eq(devOutboxMessages.channel, channel), eq(devOutboxMessages.to, to)))
    .orderBy(desc(devOutboxMessages.createdAt))
    .limit(1);
  return row ?? null;
}

function codeIn(body: string | undefined): string {
  const code = body?.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error('no code');
  return code;
}

/** Signs a fresh person in with an email code and returns their id and the session cookie. */
async function signedIn(id: string): Promise<{ userId: string; headers: Headers; email: string }> {
  const address = `${id}@example.test`;
  await db.insert(users).values({ id, email: address, name: 'Robin C.', firstName: 'Robin', lastName: 'Cole' }).onConflictDoNothing({ target: users.id });
  const post = (route: string, body: object, cookie = '') =>
    auth.handler(new Request(`${BASE}/api/auth${route}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, cookie }, body: JSON.stringify(body) }));
  await post('/email-otp/send-verification-otp', { email: address, type: 'sign-in' });
  const response = await post('/sign-in/email-otp', { email: address, otp: codeIn((await latest(address))?.body) });
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ');
  return { userId: id, headers: new Headers({ cookie, origin: BASE }), email: address };
}

describe('changing the email with a code', () => {
  let robin: Awaited<ReturnType<typeof signedIn>>;
  beforeAll(async () => {
    robin = await signedIn('usr_contact_robin');
  });

  it('refuses the current address and one another account uses, before sending anything', async () => {
    expect(await contacts.startEmailChange(robin.userId, robin.headers, { email: robin.email.toUpperCase() })).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { email: ['unchanged'] } });
    expect(await contacts.startEmailChange(robin.userId, robin.headers, { email: 'maya@example.test' })).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { email: ['in_use'] } });
    expect(sent.filter((message) => message.tag === 'email-change-code')).toHaveLength(0);
  });

  it('sends the code to the new address; a wrong code changes nothing', async () => {
    const next = 'robin.cole@example.test';
    expect(await contacts.startEmailChange(robin.userId, robin.headers, { email: ` ${next.toUpperCase()} ` })).toEqual({ ok: true, code: 'sent' });
    const message = await latest(next);
    expect(message?.tag).toBe('email-change-code');
    const code = codeIn(message?.body);
    const wrong = code === '000000' ? '111111' : '000000';
    expect(await contacts.confirmEmailChange(robin.userId, robin.headers, { email: next, code: wrong })).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { code: ['incorrect'] } });
    const [still] = await db.select({ email: users.email }).from(users).where(eq(users.id, robin.userId));
    expect(still!.email).toBe(robin.email);
  });

  it('switches the account with the right code, audits it, and tells the old address', async () => {
    const next = 'robin.cole@example.test';
    await contacts.startEmailChange(robin.userId, robin.headers, { email: next });
    const code = codeIn((await latest(next))?.body);
    expect(await contacts.confirmEmailChange(robin.userId, robin.headers, { email: next, code })).toEqual({ ok: true, code: 'updated' });

    const [row] = await db.select({ email: users.email, emailVerified: users.emailVerified }).from(users).where(eq(users.id, robin.userId));
    expect(row).toEqual({ email: next, emailVerified: true });
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.targetId, robin.userId), eq(auditLog.action, 'account.email_changed')));
    expect(audit?.metadata).toEqual({ previousEmail: robin.email, newEmail: next });
    expect((await latest(robin.email))?.tag).toBe('email-changed');
    // The same session keeps working, now with the new address.
    const session = await auth.api.getSession({ headers: robin.headers });
    expect(session?.user.email).toBe(next);
    // Sent again (a double tap): already done.
    expect(await contacts.confirmEmailChange(robin.userId, robin.headers, { email: next, code })).toEqual({ ok: true, code: 'updated' });
  });

  it('limits how many codes one person can ask for', async () => {
    const sam = await signedIn('usr_contact_sam');
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await contacts.startEmailChange(sam.userId, sam.headers, { email: `sam.${i}@example.test` }));
    expect(results.slice(0, 3).every((result) => result.ok)).toBe(true);
    expect(results[3]).toMatchObject({ ok: false, code: 'rate_limited' });
  });
});

describe('changing the phone with a code', () => {
  it('adds a number, then replaces it and emails the account about the change', async () => {
    const lee = await signedIn('usr_contact_lee');
    expect(await contacts.startPhoneChange(lee.userId, { phone: '(512) 555-0161' })).toEqual({ ok: true, code: 'sent' });
    expect(await contacts.confirmPhoneChange(lee.userId, { code: codeIn((await latest('+15125550161', 'sms'))?.body) })).toEqual({ ok: true, code: 'updated' });
    let [row] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, lee.userId));
    expect(row!.phone).toBe('+15125550161');
    expect(await contacts.startPhoneChange(lee.userId, { phone: '512-555-0161' })).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { phone: ['unchanged'] } });

    // Replacing it: a wrong code keeps the old number.
    expect(await contacts.startPhoneChange(lee.userId, { phone: '512 555 0162' })).toEqual({ ok: true, code: 'sent' });
    const code = codeIn((await latest('+15125550162', 'sms'))?.body);
    expect(await contacts.confirmPhoneChange(lee.userId, { code: code === '000000' ? '111111' : '000000' })).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { code: ['incorrect'] } });
    [row] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, lee.userId));
    expect(row!.phone).toBe('+15125550161');
    expect(await contacts.confirmPhoneChange(lee.userId, { code })).toEqual({ ok: true, code: 'updated' });
    [row] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, lee.userId));
    expect(row!.phone).toBe('+15125550162');
    expect((await latest(lee.email))?.tag).toBe('phone-changed');
    const actions = (await db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.targetId, lee.userId))).map((a) => a.action).sort();
    expect(actions).toEqual(['account.phone_added', 'account.phone_changed']);
  });

  it("refuses another account's number", async () => {
    const kim = await signedIn('usr_contact_kim');
    const [maya] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, 'usr_maya'));
    expect(await contacts.startPhoneChange(kim.userId, { phone: maya!.phone! })).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { phone: ['in_use'] } });
  });
});

describe('the profile photo', () => {
  const storage = createLocalFileStorage(path.join(os.tmpdir(), `tnm-avatars-${process.pid}`));
  const portrait = async () =>
    new File([new Uint8Array(await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 90, g: 140, b: 120 } } }).png().toBuffer())], 'me.png', { type: 'image/png' });

  it('is cropped to a square, shows on the account page, and is public only while current', async () => {
    const userId = 'usr_contact_robin';
    const first = await setProfilePhoto({ db, storage }, userId, await portrait());
    if (!first.ok) throw new Error(first.code);
    expect(first.photo).toMatchObject({ width: 512, height: 512, alt: 'Robin C.' });
    const [file] = await db.select().from(files).where(eq(files.id, first.photo.id));
    expect(file).toMatchObject({ kind: 'avatar', ownerUserId: userId, width: 512, height: 512 });
    expect(await isCurrentProfilePhoto(db, file!)).toBe(true);
    expect((await getAccountPage(db, userId))?.profile).toMatchObject({ initials: 'RC', photo: { id: first.photo.id, src: `/api/files/${first.photo.id}?w=256` } });

    // Replaced: the old one goes back to owner and staff only.
    const second = await setProfilePhoto({ db, storage }, userId, await portrait());
    if (!second.ok) throw new Error(second.code);
    expect(await isCurrentProfilePhoto(db, file!)).toBe(false);
    expect(canViewFile(file!, { userId: 'usr_maya', isStaff: false })).toBe(false);
    expect(canViewFile(file!, { userId, isStaff: false })).toBe(true);

    expect(await removeProfilePhoto(db, userId, new Date())).toEqual({ ok: true, code: 'updated' });
    const [current] = await db.select().from(files).where(eq(files.id, second.photo.id));
    expect(await isCurrentProfilePhoto(db, current!)).toBe(false);
    expect((await getAccountPage(db, userId))?.profile.photo).toBeUndefined();
  });
});
