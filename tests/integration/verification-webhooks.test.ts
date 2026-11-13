import { createHmac } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { backgroundChecks, identityVerifications } from '@/modules/verification/schema';
import { handleCheckrWebhook, handleStripeIdentityWebhook } from '@/modules/verification/webhooks';
import { createDb } from '@/platform/db/connect';

/** The providers' webhooks through the real recorders (completion plan 4.4), on a throwaway helper. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const PERSON = 'usr_tmp_webhooks';
const now = new Date();
const SECRET = 'whsec_test_webhooks';
const CHECKR_KEY = 'checkr_test_key';

function stripeSigned(event: unknown, at = now) {
  const payload = JSON.stringify(event);
  const t = Math.floor(at.getTime() / 1000);
  return { payload, signature: `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex')}` };
}
const sessionEvent = (type: string, id: string, object: Record<string, unknown> = {}) => ({ id: `evt_${type}`, type: `identity.verification_session.${type}`, data: { object: { id, object: 'identity.verification_session', ...object } } });
const identityOf = async (sessionId: string) => (await db.select().from(identityVerifications).where(eq(identityVerifications.providerSessionId, sessionId)))[0];

beforeAll(async () => {
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  await db.insert(users).values({ ...chris!, id: PERSON, email: 'tmp-webhooks@example.test', name: 'Wes W.', firstName: 'Wes', lastName: 'Walker', phone: '+15125550501' });
  const row = (id: string, sessionId: string) => ({ id, userId: PERSON, provider: 'stripe_identity', providerSessionId: sessionId, status: 'processing', createdAt: now, updatedAt: now });
  await db.insert(identityVerifications).values([row('idv_tmp_wh_1', 'vs_tmp_wh_adult'), row('idv_tmp_wh_2', 'vs_tmp_wh_minor'), row('idv_tmp_wh_3', 'vs_tmp_wh_selfie')]);
  await db.insert(backgroundChecks).values({ id: 'bgc_tmp_wh', userId: PERSON, provider: 'checkr', providerRef: 'cand_tmp_wh', status: 'invited', invitationExpiresAt: new Date(now.getTime() + 7 * 86_400_000), createdAt: now, updatedAt: now });
});

afterAll(async () => {
  await db.delete(identityVerifications).where(eq(identityVerifications.userId, PERSON));
  await db.delete(backgroundChecks).where(eq(backgroundChecks.userId, PERSON));
  await db.delete(users).where(inArray(users.id, [PERSON]));
  await pool.end();
});

describe('Stripe Identity webhooks', () => {
  const identity = {
    verifiedOutputs: vi.fn(async (sessionId: string) =>
      sessionId === 'vs_tmp_wh_minor'
        ? { firstName: 'Wes', lastName: 'Walker', dob: { day: 1, month: 1, year: now.getUTCFullYear() - 16 } }
        : { firstName: 'Wes', lastName: 'Walker', dob: { day: 1, month: 1, year: 1990 } },
    ),
  };

  it('refuses an unsigned or altered event', async () => {
    const signed = stripeSigned(sessionEvent('verified', 'vs_tmp_wh_adult'));
    expect(await handleStripeIdentityWebhook(db, { payload: signed.payload, signature: null, secret: SECRET, identity }, now)).toEqual({ status: 400, body: { ok: false } });
    expect(await handleStripeIdentityWebhook(db, { payload: signed.payload.replace('verified', 'canceled'), signature: signed.signature, secret: SECRET, identity }, now)).toMatchObject({ status: 400 });
    expect((await identityOf('vs_tmp_wh_adult'))?.status).toBe('processing');
  });

  it('verifies an adult with the matching name, and checks the age from the verified birth date', async () => {
    const adult = stripeSigned(sessionEvent('verified', 'vs_tmp_wh_adult'));
    expect(await handleStripeIdentityWebhook(db, { ...adult, secret: SECRET, identity }, now)).toEqual({ status: 200, body: { ok: true } });
    expect(await identityOf('vs_tmp_wh_adult')).toMatchObject({ status: 'verified', nameMatches: true });

    const minor = stripeSigned(sessionEvent('verified', 'vs_tmp_wh_minor'));
    await handleStripeIdentityWebhook(db, { ...minor, secret: SECRET, identity }, now);
    expect(await identityOf('vs_tmp_wh_minor')).toMatchObject({ status: 'requires_input', failureReason: 'under_18' });
  });

  it('records what the person can do next, and acknowledges what it ignores', async () => {
    const selfie = stripeSigned(sessionEvent('requires_input', 'vs_tmp_wh_selfie', { last_error: { code: 'selfie_face_mismatch', reason: 'The face did not match.' } }));
    await handleStripeIdentityWebhook(db, { ...selfie, secret: SECRET, identity }, now);
    expect(await identityOf('vs_tmp_wh_selfie')).toMatchObject({ status: 'requires_input', failureReason: 'selfie_mismatch' });
    const unknown = stripeSigned(sessionEvent('verified', 'vs_not_ours'));
    expect(await handleStripeIdentityWebhook(db, { ...unknown, secret: SECRET, identity }, now)).toEqual({ status: 200, body: { ok: true, ignored: true } });
    const other = stripeSigned({ id: 'evt_x', type: 'charge.succeeded', data: { object: { id: 'ch_1' } } });
    expect(await handleStripeIdentityWebhook(db, { ...other, secret: SECRET, identity }, now)).toEqual({ status: 200, body: { ok: true, ignored: true } });
  });
});

describe('Checkr webhooks', () => {
  const signed = (event: unknown) => {
    const payload = JSON.stringify(event);
    return { payload, signature: createHmac('sha256', CHECKR_KEY).update(payload).digest('hex') };
  };
  const statusOf = async () => (await db.select({ status: backgroundChecks.status }).from(backgroundChecks).where(eq(backgroundChecks.id, 'bgc_tmp_wh')))[0]?.status;

  it('follows the invitation and the report to its result, by candidate', async () => {
    expect(await handleCheckrWebhook(db, { payload: '{}', signature: 'deadbeef', apiKey: CHECKR_KEY }, now)).toMatchObject({ status: 400 });
    await handleCheckrWebhook(db, { ...signed({ type: 'invitation.completed', data: { object: { candidate_id: 'cand_tmp_wh', report_id: 'rep_1' } } }), apiKey: CHECKR_KEY }, now);
    expect(await statusOf()).toBe('pending');
    await handleCheckrWebhook(db, { ...signed({ type: 'report.completed', data: { object: { id: 'rep_1', candidate_id: 'cand_tmp_wh', status: 'complete', result: 'clear' } } }), apiKey: CHECKR_KEY }, now);
    expect(await statusOf()).toBe('clear');
    // Finished checks don't move again.
    await handleCheckrWebhook(db, { ...signed({ type: 'report.suspended', data: { object: { candidate_id: 'cand_tmp_wh' } } }), apiKey: CHECKR_KEY }, now);
    expect(await statusOf()).toBe('clear');
  });
});
