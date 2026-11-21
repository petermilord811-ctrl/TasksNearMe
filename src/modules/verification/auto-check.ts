import { and, asc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai';
import { createStandInDocumentReader, type AddressDocumentReader } from '@/integrations/ai/document-reader';
import { createStandInIdReader, type IdDocumentReader } from '@/integrations/ai/id-document-reader';
import { isReservedEmailAddress } from '@/integrations/email';
import type { FileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { files } from '@/modules/tasks/schema';
import { marketTimeZones } from '@/modules/markets/time-zone';
import { auditLog } from '@/platform/audit/schema';
import type { ByteCipher, FieldCipher, KeyedHasher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import type { AddressDocumentType, IdentityDocumentType } from '@/contracts';
import { identityDocumentHash, identityDocumentHasherFromEnv } from './document-hash';
import { addressVerifications, identityCaptures, type StoredAddressAutoCheck, type StoredIdentityAutoCheck } from './schema';
import { deriveIdentityAutoCheck } from './standing';
import { addressLabel } from './state';
import { homeAddressOf, sameAddress } from './id-details';
import type { IdReadingNotice } from './notify-deciders';

/**
 * The automatic reading of documents (the job runner, a few at a time): each proof of address waiting
 * for review (completion plan 4.1) and the front of each ID waiting in our own check (6.1) is read once,
 * and only the yes/no answers are stored for staff beside it. ID photos are decrypted in memory for the
 * reading and never written anywhere else. The readers are the server's own unless `DOCUMENT_READER=claude`
 * (`src/integrations/ai/reader-choice.ts`); test accounts (reserved domains such as example.test) get the
 * stand-ins, so they never reach a real reader.
 */

/**
 * The ID reading's needs: where the photos are, their key, the reader (null: none, so nothing is read), and
 * the ID hash's key (from FIELD_ENCRYPTION_KEY unless given).
 */
export interface IdReadingDeps {
  storage: FileStorage;
  files: ByteCipher;
  reader: IdDocumentReader | null;
  hasher?: KeyedHasher | null;
  /**
   * Only test accounts' photos (the stand-in, which reads nothing and answers at once); everyone else's are left
   * for the job. What a request may do: the server's own reader runs only in the job.
   */
  testAccountsOnly?: boolean;
  /** Decrypts the home address on file, which the ID's barcode address is compared with. */
  addressCipher?: FieldCipher | null;
  /** Tells the staff who decide ID checks that a reading is ready (never for test accounts). */
  notify?: (notice: IdReadingNotice) => Promise<unknown>;
}

/** A stored ID photo, decrypted in memory; null when it's gone or won't decrypt. */
export async function openIdPhoto(db: Db, deps: { storage: FileStorage; files: ByteCipher }, fileId: string | null): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!fileId) return null;
  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  const sealed = file ? await deps.storage.get(file.storageKey) : null;
  if (!file || !sealed) return null;
  try {
    return { bytes: deps.files.decrypt(sealed), contentType: file.contentType };
  } catch {
    return null;
  }
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
 * The document number, issuing state and birth date become a keyed hash (plan 6.3), never stored or
 * logged themselves: when another account's photos carry the same hash, these are flagged and the double
 * check waits for staff (the identity queue's `duplicate_id`).
 */
export async function readPendingIds(db: Db, deps: IdReadingDeps, now: Date, scope: { userIds?: readonly string[] } = {}): Promise<number> {
  if (!deps.reader && !deps.testAccountsOnly) return 0;
  const hasher = deps.hasher === undefined ? identityDocumentHasherFromEnv() : deps.hasher;
  const rows = await db
    .select({ capture: identityCaptures, email: users.email, firstName: users.firstName, lastName: users.lastName, homeMarketId: users.homeMarketId })
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
  const zones = await marketTimeZones(db, rows.map((row) => row.homeMarketId));
  for (const { capture, email, firstName, lastName, homeMarketId } of rows) {
    const reader = isReservedEmailAddress(email) ? createStandInIdReader() : deps.testAccountsOnly ? null : deps.reader;
    if (!reader) continue;
    const front = await openIdPhoto(db, deps, capture.frontFileId);
    // The back's barcode (licenses and state IDs) is read first: far more reliable than the front's print.
    const back = capture.documentType === 'passport' ? null : await openIdPhoto(db, deps, capture.backFileId);
    let check: StoredIdentityAutoCheck;
    let documentHash: string | null = null;
    if (!front) {
      check = { readable: false, by: reader.name, at: now.toISOString() };
    } else {
      try {
        const reading = await reader.read({ document: front, ...(back ? { back } : {}), declaredType: capture.documentType as IdentityDocumentType });
        // The barcode's address against the home address on file; neither is kept, only the answer.
        const home = reading.readable && reading.address ? await homeAddressOf(db, deps.addressCipher, capture.userId) : null;
        check = {
          ...deriveIdentityAutoCheck(reading, { firstName, lastName }, now, zones.get(homeMarketId)!),
          ...(home && reading.address ? { addressMatches: sameAddress(reading.address, home) } : {}),
          ...(reading.readable && reading.source ? { source: reading.source } : {}),
          ...(reading.readable && reading.frontAgrees !== undefined ? { frontAgrees: reading.frontAgrees } : {}),
          by: reader.name,
          at: now.toISOString(),
        };
        // The number lives only in `reading`, for this hash.
        documentHash = reading.readable && hasher ? identityDocumentHash(reading, hasher) : null;
      } catch (error) {
        if (!(error instanceof AiUnavailableError) && !(error instanceof AiRefusedError)) throw error;
        // Not this time: staff read it themselves (it isn't retried, so one bad answer never loops).
        console.error('[id-reader]', error.message);
        check = { readable: false, by: `${reader.name} (unavailable)`, at: now.toISOString() };
      }
    }
    const [saved] = await db
      .update(identityCaptures)
      .set({ autoCheck: check, documentHash, updatedAt: now })
      .where(and(eq(identityCaptures.id, capture.id), isNull(identityCaptures.autoCheck)))
      .returning({ id: identityCaptures.id });
    if (saved && documentHash) await flagDuplicateId(db, { captureId: capture.id, userId: capture.userId, documentHash }, now);
    if (saved && deps.notify && !isReservedEmailAddress(email)) {
      try {
        await deps.notify({ userId: capture.userId, captureId: capture.id, check });
      } catch (error) {
        // The reading is saved and shows in the queue; a failed email never undoes it.
        console.error('[id-reader] notifying staff failed:', error instanceof Error ? error.name : 'error');
      }
    }
    read += 1;
  }
  return read;
}

/** Another account's photos with the same ID: this capture is flagged, which holds the double check for staff. */
async function flagDuplicateId(db: Db, capture: { captureId: string; userId: string; documentHash: string }, now: Date): Promise<void> {
  const [other] = await db
    .select({ userId: identityCaptures.userId })
    .from(identityCaptures)
    .where(and(eq(identityCaptures.documentHash, capture.documentHash), ne(identityCaptures.userId, capture.userId)))
    .orderBy(asc(identityCaptures.createdAt))
    .limit(1);
  if (!other) return;
  await db.update(identityCaptures).set({ duplicateOfUserId: other.userId, updatedAt: now }).where(eq(identityCaptures.id, capture.captureId));
  // Which accounts, never the ID.
  await db.insert(auditLog).values({
    id: newId('aud'),
    actorRole: 'system',
    action: 'identity_capture.duplicate_id',
    targetType: 'user',
    targetId: capture.userId,
    metadata: { captureId: capture.captureId, otherUserId: other.userId },
  });
}
