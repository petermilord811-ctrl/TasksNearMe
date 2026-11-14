import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Field-level encryption for sensitive values at rest (exact addresses, access notes):
 * AES-256-GCM with a random 96-bit IV. Format: "v1.<iv>.<tag>.<ciphertext>" (base64url).
 * The key is FIELD_ENCRYPTION_KEY (32 bytes, base64). Rotating it needs a re-encryption job.
 */
export interface FieldCipher {
  encrypt(plaintext: string): string;
  decrypt(value: string): string;
}

export function createFieldCipher(keyBase64: string): FieldCipher {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');

  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return ['v1', iv, tag, ciphertext].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join('.');
    },
    decrypt(value) {
      const [version, iv, tag, ciphertext] = value.split('.');
      if (version !== 'v1' || !iv || !tag || ciphertext === undefined) throw new Error('Unrecognized encrypted value.');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
    },
  };
}

/** The app's cipher, from FIELD_ENCRYPTION_KEY. */
export function fieldCipherFromEnv(): FieldCipher {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) throw new Error('FIELD_ENCRYPTION_KEY is not set (see .env.example).');
  return createFieldCipher(key);
}

/**
 * Whole files encrypted at rest (the ID photos of our own check, added 2026-11-13): AES-256-GCM with a
 * random 96-bit IV, under a key derived (HKDF-SHA256) from FIELD_ENCRYPTION_KEY, so one secret covers
 * both while fields and files never share a key. Format: "TNF1" + IV (12 bytes) + tag (16) + ciphertext.
 * Decrypting checks the tag, so a changed or truncated file fails instead of yielding garbage.
 */
export interface ByteCipher {
  encrypt(plaintext: Buffer): Buffer;
  decrypt(value: Buffer): Buffer;
}

const FILE_MAGIC = Buffer.from('TNF1', 'latin1');
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function createByteCipher(keyBase64: string): ByteCipher {
  const master = Buffer.from(keyBase64, 'base64');
  if (master.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
  const key = Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'tasksnearme.files.v1', 32));

  return {
    encrypt(plaintext) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return Buffer.concat([FILE_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
    },
    decrypt(value) {
      const head = FILE_MAGIC.length;
      if (value.length < head + IV_BYTES + TAG_BYTES || !value.subarray(0, head).equals(FILE_MAGIC)) throw new Error('Unrecognized encrypted file.');
      const iv = value.subarray(head, head + IV_BYTES);
      const tag = value.subarray(head + IV_BYTES, head + IV_BYTES + TAG_BYTES);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(value.subarray(head + IV_BYTES + TAG_BYTES)), decipher.final()]);
    },
  };
}

/** The app's file cipher, from FIELD_ENCRYPTION_KEY. */
export function byteCipherFromEnv(): ByteCipher {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) throw new Error('FIELD_ENCRYPTION_KEY is not set (see .env.example).');
  return createByteCipher(key);
}

/**
 * A keyed hash for matching a value without keeping it (completion plan 6.3: the same ID on two
 * accounts): HMAC-SHA256 under a key derived (HKDF-SHA256) from FIELD_ENCRYPTION_KEY with the caller's
 * own `label`, so it never shares a key with encryption or another hash. Without the key, a hash can't be
 * checked against a guess.
 */
export type KeyedHasher = (message: string) => string;

export function createKeyedHasher(keyBase64: string, label: string): KeyedHasher {
  const master = Buffer.from(keyBase64, 'base64');
  if (master.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
  if (!label) throw new Error('A keyed hash needs its own label.');
  const key = Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), label, 32));
  return (message) => createHmac('sha256', key).update(message, 'utf8').digest('hex');
}
