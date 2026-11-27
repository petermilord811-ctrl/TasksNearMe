import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { signInEvents, users } from '@/modules/accounts/schema';
import { createSignInRecorder, signInMethodOf, sweepSignInEvents } from '@/modules/accounts/sign-in-history';
import { createDb } from '@/platform/db/connect';

/** Every sign-in kept a year with its address (2026-11-27), written by Better Auth's `session.create.after` hook. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
const USER = 'usr_tmp_sign_in_history';
const now = new Date('2026-11-27T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values({ ...maya!, id: USER, email: 'tmp-sign-in-history@example.test', phone: null, createdAt: daysAgo(500), updatedAt: daysAgo(500) });
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, USER));
  await pool.end();
});

describe('the sign-in history', () => {
  it('records each sign-in with its address, browser and way in', async () => {
    const record = createSignInRecorder(db);
    await record({ id: 'ses_tmp_history_1', userId: USER, ipAddress: ' 203.0.113.5 ', userAgent: 'Mozilla/5.0 (Test)', createdAt: daysAgo(1) }, { path: '/callback/:id', params: { id: 'google' } });
    await record({ id: 'ses_tmp_history_2', userId: USER, ipAddress: null, userAgent: null, createdAt: daysAgo(2) }, { path: '/sign-in/email-otp' });
    const rows = await db.select().from(signInEvents).where(eq(signInEvents.userId, USER));
    expect(rows.map((row) => ({ session: row.sessionId, ip: row.ip, agent: row.userAgent, method: row.method })).sort((a, b) => a.session!.localeCompare(b.session!))).toEqual([
      { session: 'ses_tmp_history_1', ip: '203.0.113.5', agent: 'Mozilla/5.0 (Test)', method: 'google' },
      { session: 'ses_tmp_history_2', ip: null, agent: null, method: 'email_code' },
    ]);
  });

  it('never fails a sign-in when the row can’t be written', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(createSignInRecorder(db)({ id: 'ses_tmp_history_x', userId: 'usr_nobody_here', ipAddress: '203.0.113.6' }, null)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('deletes sign-ins older than a year', async () => {
    await db.insert(signInEvents).values([
      { id: 'sie_tmp_history_old', userId: USER, ip: '203.0.113.7', createdAt: daysAgo(366) },
      { id: 'sie_tmp_history_keep', userId: USER, ip: '203.0.113.8', createdAt: daysAgo(364) },
    ]);
    expect(await sweepSignInEvents(db, now)).toBeGreaterThanOrEqual(1);
    const left = await db.select({ id: signInEvents.id }).from(signInEvents).where(inArray(signInEvents.id, ['sie_tmp_history_old', 'sie_tmp_history_keep']));
    expect(left.map((row) => row.id)).toEqual(['sie_tmp_history_keep']);
  });
});

describe('the way someone signed in', () => {
  it('is read from the endpoint that made the session', () => {
    expect(signInMethodOf({ path: '/callback/:id', params: { id: 'microsoft' } })).toBe('microsoft');
    expect(signInMethodOf({ path: '/callback/:id', params: { id: 'github' } })).toBe('other');
    expect(signInMethodOf({ path: '/sign-in/email-otp' })).toBe('email_code');
    expect(signInMethodOf({ path: '/phone-number/verify' })).toBe('phone_code');
    expect(signInMethodOf({ path: '/passkey/verify-authentication' })).toBe('passkey');
    expect(signInMethodOf(null)).toBe('other');
  });
});
