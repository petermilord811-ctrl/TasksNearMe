import { and, desc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDevOutboxSmsSender, SmsRejectedError } from '@/integrations/sms';
import { createPhoneVerification } from '@/modules/accounts/phone-verification';
import { users } from '@/modules/accounts/schema';
import { waitlistEntries } from '@/modules/marketing/schema';
import { joinWaitlist } from '@/modules/marketing/waitlist';
import { createDb } from '@/platform/db/connect';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

/** A controllable clock. */
function clock(start: string) {
  let current = new Date(start);
  return {
    now: () => current,
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  };
}

async function newUser(id: string) {
  await db.insert(users).values({ id, email: `${id}@example.test`, name: 'Test U.', firstName: 'Test', lastName: 'User' });
  return id;
}

async function lastText(to: string): Promise<string> {
  const [row] = await db
    .select({ body: devOutboxMessages.body })
    .from(devOutboxMessages)
    .where(and(eq(devOutboxMessages.channel, 'sms'), eq(devOutboxMessages.to, to)))
    .orderBy(desc(devOutboxMessages.createdAt))
    .limit(1);
  const code = row?.body.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`no code texted to ${to}`);
  return code;
}

describe('rate limits', () => {
  it('refuses the hit after the limit until the window ends', async () => {
    const now = new Date('2026-11-17T15:00:10.000Z');
    const rule = { limit: 3, windowSeconds: 60 };
    for (let i = 0; i < 3; i += 1) expect((await consumeRateLimit(db, 'test:key', rule, now)).ok).toBe(true);
    expect(await consumeRateLimit(db, 'test:key', rule, now)).toEqual({ ok: false, retryAt: new Date('2026-11-17T15:01:00.000Z') });
    expect((await consumeRateLimit(db, 'test:key', rule, new Date('2026-11-17T15:01:00.000Z'))).ok).toBe(true);
  });
});

describe('phone verification', () => {
  const sms = createDevOutboxSmsSender(db);

  it('texts a code, then verifies the number', async () => {
    const t = clock('2026-11-17T15:00:00.000Z');
    const phones = createPhoneVerification({ db, sms, secret: 'test-secret', now: t.now });
    const userId = await newUser('usr_phone_ok');

    const started = await phones.start(userId, '(512) 555-0190');
    expect(started).toEqual({
      ok: true,
      maskedPhone: '(512) •••-••90',
      resendAvailableAt: new Date('2026-11-17T15:00:30.000Z'),
    });
    expect(await phones.pending(userId)).toMatchObject({ maskedPhone: '(512) •••-••90' });

    expect(await phones.verify(userId, await lastText('+15125550190'))).toEqual({ ok: true, phone: '+15125550190' });
    const [row] = await db.select({ phone: users.phone, at: users.phoneVerifiedAt }).from(users).where(eq(users.id, userId));
    expect(row).toEqual({ phone: '+15125550190', at: new Date('2026-11-17T15:00:00.000Z') });
    expect(await phones.pending(userId)).toBeNull();
  });

  it('locks for 10 minutes after three wrong codes', async () => {
    const t = clock('2026-11-17T16:00:00.000Z');
    const phones = createPhoneVerification({ db, sms, secret: 'test-secret', now: t.now });
    const userId = await newUser('usr_phone_lock');
    await phones.start(userId, '512-555-0191');
    const right = await lastText('+15125550191');
    const wrong = right === '000000' ? '111111' : '000000';

    expect(await phones.verify(userId, wrong)).toEqual({ ok: false, reason: 'incorrect' });
    expect(await phones.verify(userId, wrong)).toEqual({ ok: false, reason: 'incorrect' });
    const lockedUntil = new Date('2026-11-17T16:10:00.000Z');
    expect(await phones.verify(userId, wrong)).toEqual({ ok: false, reason: 'locked', retryAt: lockedUntil });
    // Even the right code and a fresh code are refused while locked.
    expect(await phones.verify(userId, right)).toEqual({ ok: false, reason: 'locked', retryAt: lockedUntil });
    expect(await phones.start(userId, '512-555-0191')).toEqual({ ok: false, reason: 'rate_limited', retryAt: lockedUntil });

    t.advance(10 * 60_000);
    expect((await phones.start(userId, '512-555-0191')).ok).toBe(true);
  });

  it('expires codes, limits resends, and refuses numbers we cannot use', async () => {
    const t = clock('2026-11-17T17:00:00.000Z');
    const phones = createPhoneVerification({ db, sms, secret: 'test-secret', now: t.now });
    const userId = await newUser('usr_phone_misc');

    expect(await phones.start(userId, '+44 20 7946 0958')).toEqual({ ok: false, reason: 'not_supported' });
    expect(await phones.start(userId, '555-0100')).toEqual({ ok: false, reason: 'invalid' });
    // Maya's number is already verified on her account.
    expect(await phones.start(userId, '(512) 555-0101')).toEqual({ ok: false, reason: 'in_use' });

    await phones.start(userId, '512 555 0192');
    expect(await phones.start(userId, '512 555 0192')).toEqual({
      ok: false,
      reason: 'rate_limited',
      retryAt: new Date('2026-11-17T17:00:30.000Z'),
    });

    const code = await lastText('+15125550192');
    t.advance(10 * 60_000 + 1);
    expect(await phones.verify(userId, code)).toEqual({ ok: false, reason: 'expired' });
    expect(await phones.pending(userId)).toBeNull();
  });

  it('cancels a pending code when the person wants a different number', async () => {
    const t = clock('2026-11-17T18:00:00.000Z');
    const phones = createPhoneVerification({ db, sms, secret: 'test-secret', now: t.now });
    const userId = await newUser('usr_phone_cancel');
    await phones.start(userId, '512 555 0193');
    await phones.cancel(userId);
    expect(await phones.pending(userId)).toBeNull();
    expect(await phones.verify(userId, await lastText('+15125550193'))).toEqual({ ok: false, reason: 'no_pending' });
  });

  it('asks for another number when the provider cannot text this one (a landline, or STOP)', async () => {
    const t = clock('2026-11-17T19:00:00.000Z');
    const refusing = { name: 'twilio', send: async () => { throw new SmsRejectedError('invalid_number', 21614); } };
    const phones = createPhoneVerification({ db, sms: refusing, secret: 'test-secret', now: t.now });
    const userId = await newUser('usr_phone_landline');
    expect(await phones.start(userId, '512 555 0194')).toEqual({ ok: false, reason: 'invalid' });
    expect(await phones.pending(userId)).toBeNull();
    // Anything else is a failure to report, not the person's number.
    const down = createPhoneVerification({ db, sms: { name: 'twilio', send: async () => { throw new Error('Twilio answered 503'); } }, secret: 'test-secret', now: t.now });
    await expect(down.start(await newUser('usr_phone_outage'), '512 555 0195')).rejects.toThrow('Twilio answered 503');
  });
});

describe('waitlist', () => {
  it('keeps one entry per email and updates it on rejoin', async () => {
    await joinWaitlist(db, { email: 'sky@example.test', zip: '10001', interest: 'need_help' });
    await joinWaitlist(db, { email: 'sky@example.test', zip: '10002', interest: 'both' });
    const rows = await db.select().from(waitlistEntries).where(eq(waitlistEntries.email, 'sky@example.test'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ zip: '10002', interest: 'both' });
  });
});
