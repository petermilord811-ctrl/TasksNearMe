import type { ExactAddress } from '@/contracts';
import type { FieldCipher } from '@/platform/crypto/field-encryption';

/**
 * A task's exact address, decrypted, or nothing once the retention timer deleted it (an empty
 * `address_enc`; src/modules/privacy/retention.ts). Every reader of `task_locations` goes through here.
 */
export function readExactAddress(cipher: FieldCipher, addressEnc: string | null | undefined): ExactAddress | undefined {
  if (!addressEnc) return undefined;
  return JSON.parse(cipher.decrypt(addressEnc)) as ExactAddress;
}
