import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, newTotpSecret, otpauthUri, totpCode, totpStep, verifyTotp } from './totp';

// RFC 6238's SHA-1 test key, "12345678901234567890" in ASCII.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('round-trips base32', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890');
    expect(base32Decode('gezd gnbv-gy3t qojq').toString()).toBe('1234567890');
  });

  it('matches the RFC 6238 test vectors (last 6 digits)', () => {
    expect(totpCode(RFC_SECRET, totpStep(new Date(59_000)))).toBe('287082');
    expect(totpCode(RFC_SECRET, totpStep(new Date(1_111_111_109_000)))).toBe('081804');
    expect(totpCode(RFC_SECRET, totpStep(new Date(1_234_567_890_000)))).toBe('005924');
    expect(totpCode(RFC_SECRET, totpStep(new Date(2_000_000_000_000)))).toBe('279037');
  });

  it('accepts one step of drift, once', () => {
    const now = new Date(1_234_567_890_000);
    const step = totpStep(now);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now, null)).toEqual({ ok: true, step: step - 1 });
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now, null)).toEqual({ ok: true, step: step + 1 });
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now, null)).toEqual({ ok: false });
    // A code already used doesn't work again.
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), now, step)).toEqual({ ok: false });
    expect(verifyTotp(RFC_SECRET, 'abcdef', now, null)).toEqual({ ok: false });
  });

  it('makes 160-bit secrets and the link apps read', () => {
    const secret = newTotpSecret();
    expect(base32Decode(secret)).toHaveLength(20);
    expect(otpauthUri({ secret: 'ABC', account: 'taylor@example.test', issuer: 'TasksNearMe Staff' })).toBe(
      'otpauth://totp/TasksNearMe%20Staff:taylor%40example.test?secret=ABC&issuer=TasksNearMe%20Staff&algorithm=SHA1&digits=6&period=30',
    );
  });
});
