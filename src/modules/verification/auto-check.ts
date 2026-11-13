import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai';
import { createStandInDocumentReader, type AddressDocumentReader } from '@/integrations/ai/document-reader';
import { isReservedEmailAddress } from '@/integrations/email';
import type { FileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { files } from '@/modules/tasks/schema';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import type { AddressDocumentType } from '@/contracts';
import { addressVerifications, type StoredAddressAutoCheck } from './schema';
import { addressLabel } from './state';

/**
 * The automatic reading of proofs of address (completion plan 4.1; the job runner, a few at a time): each
 * proof waiting for review is read once, and only the yes/no answers are stored for staff beside it. Test
 * accounts (reserved domains such as example.test) never reach a provider; they get the stand-in.
 */

/** A minute's worth: the runner waits for these, so they go last and few at a time. */
const BATCH = 2;

export async function readPendingDocuments(
  db: Db,
  deps: { storage: FileStorage; cipher: FieldCipher; reader: AddressDocumentReader | null },
  now: Date,
  scope: { userIds?: readonly string[] } = {},
): Promise<{ read: number }> {
  if (!deps.reader) return { read: 0 };
  const rows = await db
    .select({ proof: addressVerifications, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(addressVerifications)
    .innerJoin(users, eq(users.id, addressVerifications.userId))
    .where(
      and(
        eq(addressVerifications.status, 'in_review'),
        isNull(addressVerifications.autoCheck),
        isNotNull(addressVerifications.documentFileId),
        scope.userIds ? inArray(addressVerifications.userId, [...scope.userIds]) : undefined,
      ),
    )
    .orderBy(asc(addressVerifications.submittedAt))
    .limit(BATCH);
  let read = 0;
  for (const { proof, email, firstName, lastName } of rows) {
    const [file] = await db.select().from(files).where(eq(files.id, proof.documentFileId!)).limit(1);
    const bytes = file ? await deps.storage.get(file.storageKey) : null;
    const reader = isReservedEmailAddress(email) ? createStandInDocumentReader() : deps.reader;
    let check: StoredAddressAutoCheck;
    if (!file || !bytes) {
      check = { readable: false, by: reader.name, at: now.toISOString() };
    } else {
      try {
        const reading = await reader.read({
          document: { bytes, contentType: file.contentType },
          expected: {
            name: `${firstName} ${lastName}`.trim(),
            address: addressLabel(proof.addressCiphertext, deps.cipher) ?? '',
            declaredType: (proof.documentType ?? 'utility_bill') as AddressDocumentType,
            submittedOn: (proof.submittedAt ?? proof.createdAt).toISOString().slice(0, 10),
          },
        });
        check = { ...reading, by: reader.name, at: now.toISOString() };
      } catch (error) {
        if (!(error instanceof AiUnavailableError) && !(error instanceof AiRefusedError)) throw error;
        // Not this time: staff read it themselves (it isn't retried, so one bad answer never loops).
        console.error('[document-reader]', error.message);
        check = { readable: false, by: `${reader.name} (unavailable)`, at: now.toISOString() };
      }
    }
    await db.update(addressVerifications).set({ autoCheck: check, updatedAt: now }).where(and(eq(addressVerifications.id, proof.id), isNull(addressVerifications.autoCheck)));
    read += 1;
  }
  return { read };
}
