import { like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { ActionResult } from '@/contracts';
import { askForCodeWithinLimits, emailCodeLimits } from '@/modules/accounts/sign-in/code-limits';
import { createDb } from '@/platform/db/connect';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * Sign-in codes' limits against the database (when things break, 2026-11-21; ab decided): 3 codes to an address in 10
 * minutes, but a code that didn't go out (`unavailable`: the provider refused or didn't answer) is given back, since
 * nobody can cause a provider outage. Someone who tried 3 times during an outage can ask again once it's over.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
const EMAIL = 'code-limits@example.test';
const IP = '203.0.113.77';
afterAll(async () => {
  await db.delete(rateLimits).where(like(rateLimits.key, `email-code:%${EMAIL}`));
  await db.delete(rateLimits).where(like(rateLimits.key, `email-code:ip:${IP}`));
  await pool.end();
});

describe('sign-in code limits', () => {
  it('doesn’t count a code that didn’t go out, and still counts the ones that did', async () => {
    const now = new Date('2031-06-02T15:01:00.000Z');
    const limits = emailCodeLimits(EMAIL, IP);
    const outage = async (): Promise<ActionResult> => ({ ok: false, code: 'unavailable' });
    const sent = async (): Promise<ActionResult> => ({ ok: true, code: 'sent' });
    for (let index = 0; index < 4; index += 1) expect(await askForCodeWithinLimits(db, limits, outage, now)).toEqual({ ok: false, code: 'unavailable' });
    // The provider is back: the 3 codes of the window are all still there.
    for (let index = 0; index < 3; index += 1) expect(await askForCodeWithinLimits(db, limits, sent, now)).toEqual({ ok: true, code: 'sent' });
    expect(await askForCodeWithinLimits(db, limits, sent, now)).toMatchObject({ ok: false, code: 'rate_limited' });
  });

  it('counts a refusal for another reason (a blocked account) like any ask', async () => {
    const now = new Date('2031-06-02T16:01:00.000Z');
    const limits = emailCodeLimits(EMAIL, null);
    const blocked = async (): Promise<ActionResult> => ({ ok: false, code: 'not_allowed' });
    for (let index = 0; index < 3; index += 1) expect(await askForCodeWithinLimits(db, limits, blocked, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await askForCodeWithinLimits(db, limits, blocked, now)).toMatchObject({ ok: false, code: 'rate_limited' });
  });
});
