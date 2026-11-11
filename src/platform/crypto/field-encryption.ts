import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

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
