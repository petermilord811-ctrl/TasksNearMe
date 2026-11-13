import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai';
import { createStandInDocumentReader, type AddressDocumentReader } from '@/integrations/ai/document-reader';
import { createStandInIdReader, type IdDocumentReader } from '@/integrations/ai/id-document-reader';
import { isReservedEmailAddress } from '@/integrations/email';
import type { FileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { files } from '@/modules/tasks/schema';
import type { ByteCipher, FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import type { AddressDocumentType, IdentityDocumentType } from '@/contracts';
import { addressVerifications, identityCaptures, type StoredAddressAutoCheck, type StoredIdentityAutoCheck } from './schema';
import { deriveIdentityAutoCheck } from './standing';
import { addressLabel } from './state';

/**
 * The automatic reading of documents (the job runner, a few at a time): each proof of address waiting
 * for review (completion plan 4.1) and the front of each ID waiting in our own check (6.1) is read once,
 * and only the yes/no answers are stored for staff beside it. ID photos are decrypted in memory for the
 * reading and never written anywhere else. Test accounts (reserved domains such as example.test) never
 * reach a provider; they get the stand-ins.
 */

/** The ID reading's needs: where the photos are, their key, and the reader (none in production without a key). */
export interface IdReadingDeps {
  storage: FileStorage;
  files: ByteCipher;
  reader: IdDocumentReader | null;
}

/** A minute's worth: the runner waits for these, so they go last and few at a time. */
const BATCH = 2;

/** `deps.identity`: also read the IDs of our own check. `read` counts both kinds. */
export async function readPendingDocuments(
  db: Db,
  deps: { storage: FileStorage; cipher: FieldCipher; reader: AddressDocumentReader | null; identity?: IdReadingDeps },
  now: Date,
  scope: { userIds?: readonly string[] } = {},
): Promise<{ read: number }> {
  const proofs = await readPendingProofs(db, deps, now, scope);
  const ids = deps.identity ? await readPendingIds(db, deps.identity, now, scope) : 0;
  return { read: proofs + ids };
}

async function readPendingProofs(
  db: Db,
  deps: { storage: FileStorage; cipher: FieldCipher; reader: AddressDocumentReader | null },
  now: Date,
  scope: { userIds?: readonly string[] },
): Promise<number> {
  if (!deps.reader) return 0;
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
  return read;
}

/**
 * The front of each ID in review, read once: the reader transcribes the name, birth date and expiry, and
 * only the answers derived from them are stored (`deriveIdentityAutoCheck`). The selfie is never read.
 */
export async function readPendingIds(db: Db, deps: IdReadingDeps, now: Date, scope: { userIds?: readonly string[] } = {}): Promise<number> {
  if (!deps.reader) return 0;
  const rows = await db
    .select({ capture: identityCaptures, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(identityCaptures)
    .innerJoin(users, eq(users.id, identityCaptures.userId))
    .where(
      and(
        eq(identityCaptures.status, 'submitted'),
        isNull(identityCaptures.autoCheck),
        isNotNull(identityCaptures.frontFileId),
        scope.userIds ? inArray(identityCaptures.userId, [...scope.userIds]) : undefined,
      ),
    )
    .orderBy(asc(identityCaptures.submittedAt))
    .limit(BATCH);
  let read = 0;
  for (const { capture, email, firstName, lastName } of rows) {
    const reader = isReservedEmailAddress(email) ? createStandInIdReader() : deps.reader;
    const [file] = await db.select().from(files).where(eq(files.id, capture.frontFileId!)).limit(1);
    const sealed = file ? await deps.storage.get(file.storageKey) : null;
    let bytes: Buffer | null = null;
    try {
      bytes = sealed ? deps.files.decrypt(sealed) : null;
    } catch {
      bytes = null;
    }
    let check: StoredIdentityAutoCheck;
    if (!file || !bytes) {
      check = { readable: false, by: reader.name, at: now.toISOString() };
    } else {
      try {
        const reading = await reader.read({ document: { bytes, contentType: file.contentType }, declaredType: capture.documentType as IdentityDocumentType });
        check = { ...deriveIdentityAutoCheck(reading, { firstName, lastName }, now), by: reader.name, at: now.toISOString() };
      } catch (error) {
        if (!(error instanceof AiUnavailableError) && !(error instanceof AiRefusedError)) throw error;
        // Not this time: staff read it themselves (it isn't retried, so one bad answer never loops).
        console.error('[id-reader]', error.message);
        check = { readable: false, by: `${reader.name} (unavailable)`, at: now.toISOString() };
      }
    }
    await db.update(identityCaptures).set({ autoCheck: check, updatedAt: now }).where(and(eq(identityCaptures.id, capture.id), isNull(identityCaptures.autoCheck)));
    read += 1;
  }
  return read;
}
