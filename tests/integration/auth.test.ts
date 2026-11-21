import { desc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { helperProfiles } from '@/modules/profiles/schema';
import { staffRoles, users } from '@/modules/accounts/schema';
import { trackCodeDelivery } from '@/platform/auth/code-delivery';
import { createAuth } from '@/platform/auth/config';
import { setFault } from '@/platform/faults';
import { createDb } from '@/platform/db/connect';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const auth = createAuth(db, { nextCookies: false });
afterAll(() => pool.end());

async function latestCode(email: string): Promise<string> {
  const [message] = await db
    .select({ body: devOutboxMessages.body, subject: devOutboxMessages.subject })
    .from(devOutboxMessages)
    .where(eq(devOutboxMessages.to, email))
    .orderBy(desc(devOutboxMessages.createdAt))
    .limit(1);
  const code = message?.body.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error('no code in dev outbox');
  return code;
}

describe('email one-time-code sign-in', () => {
  it('hears when a code didn’t go out, though Better Auth answers as if it had (when things break, 2026-11-21)', async () => {
    const ask = () => auth.api.sendVerificationOTP({ body: { email: 'maya@example.test', type: 'sign-in' } });
    setFault('email', 'down');
    try {
      // Better Auth logs the failed send and answers as usual; the tracker still knows.
      expect(await trackCodeDelivery(ask)).toEqual({ sent: false });
    } finally {
      setFault('email', null);
    }
    expect(await trackCodeDelivery(ask)).toEqual({ sent: true });
  });

  it('emails a 6-digit code to the dev outbox and signs a seeded person in with it', async () => {
    await auth.api.sendVerificationOTP({ body: { email: 'maya@example.test', type: 'sign-in' } });
    const code = await latestCode('maya@example.test');
    const result = await auth.api.signInEmailOTP({ body: { email: 'maya@example.test', otp: code } });
    expect(result.user.id).toBe('usr_maya');
    expect(result.token).toBeTruthy();
  });

  it('rejects a wrong code', async () => {
    await auth.api.sendVerificationOTP({ body: { email: 'sam@example.test', type: 'sign-in' } });
    await expect(auth.api.signInEmailOTP({ body: { email: 'sam@example.test', otp: '000000' } })).rejects.toThrow();
  });

  it('creates a new account with a prefixed id on first sign-in', async () => {
    const email = 'newcomer@example.test';
    await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
    const result = await auth.api.signInEmailOTP({ body: { email, otp: await latestCode(email) } });
    expect(result.user.id).toMatch(/^usr_[0-9a-f]{32}$/);
    const [row] = await db.select({ mode: users.mode, status: users.status }).from(users).where(eq(users.email, email));
    expect(row).toEqual({ mode: 'poster', status: 'active' });
  });
});

describe('seeded people', () => {
  it('has helper profiles that match the fixtures and staff roles', async () => {
    const [jordan] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
    expect(jordan).toMatchObject({ handle: 'jordan-t', status: 'active', foundingNumber: 63 });
    const roles = await db.select().from(staffRoles);
    expect(roles.map((r) => r.role).sort()).toEqual(['admin', 'finance', 'support_agent', 'support_lead', 'trust_safety']);
  });

  it('stores display names as first name + last initial', async () => {
    const [maya] = await db.select({ name: users.name, lastName: users.lastName }).from(users).where(eq(users.id, 'usr_maya'));
    expect(maya).toEqual({ name: 'Maya R.', lastName: 'Rivera' });
  });
});
