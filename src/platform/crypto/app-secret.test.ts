import { afterEach, describe, expect, it, vi } from 'vitest';
import { contactRevertToken, contactRevertTokenMatches } from '@/modules/accounts/contact-revert-token';
import { readUnsubscribeToken, unsubscribeToken } from '@/modules/notifications/unsubscribe';
import { appSecret, DEV_ONLY_SECRET } from './app-secret';

/**
 * The secret behind the links the app signs itself (unsubscribe, "Not you?"): never a value from the source in a
 * production build; the development stand-in elsewhere.
 */

afterEach(() => vi.unstubAllEnvs());
const claim = { id: 'ccr_0123456789abcdef0123456789abcdef', userId: 'usr_maya', kind: 'email' as const, expiresAt: new Date('2026-11-21T10:00:00.000Z') };

describe('appSecret', () => {
  it('is BETTER_AUTH_SECRET when set', () => {
    expect(appSecret({ BETTER_AUTH_SECRET: 's3cret-from-the-environment', NODE_ENV: 'production' })).toBe('s3cret-from-the-environment');
  });

  it('falls back to the development stand-in outside production', () => {
    expect(appSecret({ NODE_ENV: 'development' })).toBe(DEV_ONLY_SECRET);
    expect(appSecret({ NODE_ENV: 'test', BETTER_AUTH_SECRET: '' })).toBe(DEV_ONLY_SECRET);
    expect(appSecret({})).toBe(DEV_ONLY_SECRET);
  });

  it('throws in a production build when it is unset or empty', () => {
    expect(() => appSecret({ NODE_ENV: 'production' })).toThrow(/BETTER_AUTH_SECRET is not set/);
    expect(() => appSecret({ NODE_ENV: 'production', BETTER_AUTH_SECRET: '' })).toThrow(/BETTER_AUTH_SECRET is not set/);
  });

  it('is what both kinds of link are signed with, so neither signs with the stand-in in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    expect(() => contactRevertToken(claim)).toThrow(/BETTER_AUTH_SECRET is not set/);
    expect(() => contactRevertTokenMatches(`${claim.id}.${'A'.repeat(43)}`, claim)).toThrow(/BETTER_AUTH_SECRET is not set/);
    expect(() => unsubscribeToken('usr_maya', 'offers')).toThrow(/BETTER_AUTH_SECRET is not set/);
    expect(() => readUnsubscribeToken('usr_maya.offers.abc.sig')).toThrow(/BETTER_AUTH_SECRET is not set/);

    vi.stubEnv('BETTER_AUTH_SECRET', 'the-real-secret');
    expect(contactRevertToken(claim)).toBe(contactRevertToken(claim, 'the-real-secret'));
    expect(contactRevertToken(claim)).not.toBe(contactRevertToken(claim, DEV_ONLY_SECRET));
    expect(readUnsubscribeToken(unsubscribeToken('usr_maya', 'offers'))).toEqual({ userId: 'usr_maya', topic: 'offers' });
  });
});
