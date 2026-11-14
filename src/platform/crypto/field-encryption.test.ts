import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createByteCipher, createFieldCipher, createKeyedHasher } from './field-encryption';

const key = randomBytes(32).toString('base64');

describe('field encryption', () => {
  it('round-trips text and never shows it', () => {
    const cipher = createFieldCipher(key);
    const sealed = cipher.encrypt('1234 Example Lane');
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain('Example');
    expect(cipher.decrypt(sealed)).toBe('1234 Example Lane');
  });
});

describe('file encryption', () => {
  const photo = Buffer.concat([Buffer.from('RIFF....WEBPVP8 '), randomBytes(2048)]);

  it('round-trips bytes, with a fresh IV each time', () => {
    const cipher = createByteCipher(key);
    const first = cipher.encrypt(photo);
    const second = cipher.encrypt(photo);
    expect(first.subarray(0, 4).toString('latin1')).toBe('TNF1');
    expect(first.equals(second)).toBe(false);
    expect(first.includes(Buffer.from('WEBPVP8'))).toBe(false);
    expect(cipher.decrypt(first).equals(photo)).toBe(true);
    expect(cipher.decrypt(second).equals(photo)).toBe(true);
  });

  it('refuses a changed, truncated or foreign file, and another key', () => {
    const cipher = createByteCipher(key);
    const sealed = cipher.encrypt(photo);
    const changed = Buffer.from(sealed);
    changed[changed.length - 1]! ^= 0xff;
    expect(() => cipher.decrypt(changed)).toThrow();
    expect(() => cipher.decrypt(sealed.subarray(0, 20))).toThrow();
    expect(() => cipher.decrypt(photo)).toThrow('Unrecognized encrypted file.');
    expect(() => createByteCipher(randomBytes(32).toString('base64')).decrypt(sealed)).toThrow();
  });

  it('keeps files and fields under different keys derived from the same secret', () => {
    // The same key material: a field cipher can't read a file, and the file key isn't the raw key.
    const fields = createFieldCipher(key);
    const files = createByteCipher(key);
    const sealed = files.encrypt(Buffer.from('hello'));
    expect(() => fields.decrypt(sealed.toString('latin1'))).toThrow();
    expect(() => createByteCipher('c2hvcnQ=')).toThrow('32 bytes');
  });
});

describe('keyed hashes', () => {
  it('is stable for a key and label, and differs with another label or key, never the plain HMAC of the key', () => {
    const hash = createKeyedHasher(key, 'tasksnearme.test.v1');
    expect(hash('D1234567|TX|1990-05-01')).toMatch(/^[0-9a-f]{64}$/);
    expect(hash('D1234567|TX|1990-05-01')).toBe(createKeyedHasher(key, 'tasksnearme.test.v1')('D1234567|TX|1990-05-01'));
    expect(hash('D1234567|TX|1990-05-01')).not.toBe(createKeyedHasher(key, 'tasksnearme.other.v1')('D1234567|TX|1990-05-01'));
    expect(hash('D1234567|TX|1990-05-01')).not.toBe(createKeyedHasher(randomBytes(32).toString('base64'), 'tasksnearme.test.v1')('D1234567|TX|1990-05-01'));
    // The derived key, not the master key itself.
    expect(hash('x')).not.toBe(createHmac('sha256', Buffer.from(key, 'base64')).update('x').digest('hex'));
    expect(() => createKeyedHasher(key, '')).toThrow();
    expect(() => createKeyedHasher(Buffer.from('short').toString('base64'), 'x')).toThrow();
  });
});
