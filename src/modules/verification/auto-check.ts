import { and, asc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai';
import { createStandInDocumentReader, type AddressDocumentReader, type AddressDocumentReading } from '@/integrations/ai/document-reader';
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
import type { AddressDocumentType, IdentityDocumentType, LivenessPrompt } from '@/contracts';
import { SERVER_READER_NAME } from '@/integrations/ocr';
import { featureFlags } from '@/modules/markets/schema';
import { applyAddressAutoDecision, autoVerificationOn } from './address-decision';
import { identityFraud } from '@/shared/fraud/score';
import { addressAutoOutcome, addressVerdict } from './address-verdict';
import { identityDocumentHash, identityDocumentHasherFromEnv } from './document-hash';
import { addressVerifications, identityCaptures, type StoredAddressAutoCheck, type StoredIdentityAutoCheck } from './schema';
import { applyCaptureDecision } from './capture-decision';
import { idVerdict, type IdVerdict } from './id-verdict';
import { deriveIdentityAutoCheck } from './standing';
import { addressLabel } from './state';
import { homeAddressOf, sameAddress } from './id-details';
import type { IdReadingNotice } from './notify-deciders';

/**
 * The automatic reading of documents (the job runner, a few at a time): each proof of address waiting
 * for review (completion plan 4.1) and each ID waiting in our own check (6.1) is read once, its checks
 * stored for staff beside it, and (2026-11-27) decided at once when they're clear. ID photos are
 * decrypted in memory for the reading and never written anywhere else. The readers are the server's own unless `DOCUMENT_READER=claude`
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
  /** Encrypts what was read from the ID (`details_ciphertext`, for our team's review); without it nothing of that is kept. */
  detailsCipher?: FieldCipher | null;
  /** Tests: whether an ID provider double-checks (default: idDoubleCheckFor the environment). */
  doubleCheck?: boolean;
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

/** Documents being read in this server process now: the job and a read at once (read-soon.ts) never read one twice. */
const readingNow = new Set<string>();

/** Runs `read` for each row nobody in this process is reading yet, one after another. */
async function eachUnclaimed<T>(rows: readonly T[], idOf: (row: T) => string, read: (row: T) => Promise<void>): Promise<void> {
  for (const row of rows) {
    const id = idOf(row);
    if (readingNow.has(id)) continue;
    readingNow.add(id);
    try {
      await read(row);
    } finally {
      readingNow.delete(id);
    }
  }
}

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
  const documentReader = deps.reader;
  if (!documentReader) return 0;
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
  await eachUnclaimed(rows, (row) => row.proof.id, async ({ proof, email, firstName, lastName }) => {
    const [file] = await db.select().from(files).where(eq(files.id, proof.documentFileId!)).limit(1);
    const bytes = file ? await deps.storage.get(file.storageKey) : null;
    const testAccount = isReservedEmailAddress(email);
    const reader = testAccount ? createStandInDocumentReader() : documentReader;
    let reading: AddressDocumentReading = { readable: false };
    let by = reader.name;
    if (file && bytes) {
      try {
        reading = await reader.read({
          document: { bytes, contentType: file.contentType },
          expected: {
            name: `${firstName} ${lastName}`.trim(),
            address: addressLabel(proof.addressCiphertext, deps.cipher) ?? '',
            declaredType: (proof.documentType ?? 'utility_bill') as AddressDocumentType,
            submittedOn: (proof.submittedAt ?? proof.createdAt).toISOString().slice(0, 10),
          },
        });
      } catch (error) {
        if (!(error instanceof AiUnavailableError) && !(error instanceof AiRefusedError)) throw error;
        // Not this time: staff read it themselves (it isn't retried, so one bad answer never loops).
        console.error('[document-reader]', error.message);
        by = `${reader.name} (unavailable)`;
      }
    }
    // The checks and what they decide (address-verdict.ts), kept with the answers; never the document's text. Where
    // automatic decisions are on, a miss is turned down so the person sends another, and a second miss goes to our team.
    const verdict = addressVerdict(reading);
    // A reader that failed (or a missing file) isn't the person's miss: our team reads it instead.
    const readerFailed = !file || !bytes || by !== reader.name;
    const automatic = !testAccount && !readerFailed && (await autoVerificationOn(db, proof.userId));
    const outcome = automatic ? addressAutoOutcome(verdict, await earlierAutoMisses(db, proof.userId, proof.createdAt)) : ({ decision: 'review' } as const);
    const check: StoredAddressAutoCheck = {
      readable: reading.readable,
      ...(reading.nameMatches !== undefined ? { nameMatches: reading.nameMatches } : {}),
      ...(reading.addressMatches !== undefined ? { addressMatches: reading.addressMatches } : {}),
      ...(reading.recent !== undefined ? { recent: reading.recent } : {}),
      ...(reading.documentType ? { documentType: reading.documentType } : {}),
      ...(reading.issuer ? { issuer: reading.issuer.name } : {}),
      ...(reading.documentDate ? { documentDate: reading.documentDate } : {}),
      checks: verdict.checks,
      signals: reading.signals ?? [],
      // What was applied; with automatic decisions off, what the checks alone said.
      decision: automatic ? outcome.decision : verdict.decision,
      by,
      at: now.toISOString(),
    };
    const [saved] = await db
      .update(addressVerifications)
      .set({ autoCheck: check, updatedAt: now })
      .where(and(eq(addressVerifications.id, proof.id), isNull(addressVerifications.autoCheck)))
      .returning({ id: addressVerifications.id });
    // Applied at once (`auto_verification_address`); test accounts always wait for staff.
    if (saved && outcome.decision !== 'review') await applyAddressAutoDecision(db, { id: proof.id, userId: proof.userId }, outcome, now);
    read += 1;
  });
  return read;
}

/**
 * Each ID in review, read once (2026-11-27: checked deeply on our own server): the server's reader reads the barcode or
 * the passport's zone and the front, judges whether the ID is genuine (aamva-genuine.ts) and compares the selfie's face
 * with the ID's photo (face-engine.ts). The verdict (id-verdict.ts) runs the ten checks; with automatic decisions on
 * (the `auto_verification_id` flag for the person's home market; off since 2026-11-27, owner: "For ID check, as for
 * now, request default double check on team"), a clean reading approves the photos at once (and, where
 * no ID provider double-checks, verifies the ID: capture-decision.ts), an ID read by machine that's expired or of someone
 * under 18 is turned down with that reason, and anything else waits for our team, who are emailed. What was read from
 * the ID (names, birth date, number, address, dates, class…) is kept with the photos, encrypted (`details_ciphertext`),
 * for our team's review (owner, 2026-11-27: "store DL infos and images for further possible manual review"); the stored
 * answers and checks never hold it. The keyed hash of the number, state and birth date (plan 6.3) finds the same ID on
 * another account. The selfie is read only by our own server's reader. Test accounts get the stand-in, which reads
 * nothing, so their photos always wait for our team.
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
  await eachUnclaimed(rows, (row) => row.capture.id, async ({ capture, email, firstName, lastName, homeMarketId }) => {
    const testAccount = isReservedEmailAddress(email);
    const reader = testAccount ? createStandInIdReader() : deps.testAccountsOnly ? null : deps.reader;
    if (!reader) return;
    const front = await openIdPhoto(db, deps, capture.frontFileId);
    // The back's barcode (licenses and state IDs) is read first: far more reliable than the front's print.
    const back = capture.documentType === 'passport' ? null : await openIdPhoto(db, deps, capture.backFileId);
    // The selfie goes to our own server's face check only, never to another reader.
    const selfie = reader.name === SERVER_READER_NAME ? await openIdPhoto(db, deps, capture.selfieFileId) : null;
    let check: StoredIdentityAutoCheck;
    let documentHash: string | null = null;
    let detailsCiphertext: string | null = null;
    let other: string | null = null;
    let verdict: IdVerdict | null = null;
    if (!front) {
      check = { readable: false, by: reader.name, at: now.toISOString() };
    } else {
      try {
        const reading = await reader.read({
          document: front,
          ...(back ? { back } : {}),
          ...(selfie ? { selfie, prompt: capture.promptKey as LivenessPrompt } : {}),
          declaredType: capture.documentType as IdentityDocumentType,
        });
        // The barcode's address against the home address on file; neither is kept in the answers, only whether they match.
        const home = reading.readable && reading.address ? await homeAddressOf(db, deps.addressCipher, capture.userId) : null;
        const answers = deriveIdentityAutoCheck(reading, { firstName, lastName }, now, zones.get(homeMarketId)!);
        // The number lives only in `reading` (and the encrypted details), for this hash.
        documentHash = reading.readable && hasher ? identityDocumentHash(reading, hasher) : null;
        other = documentHash ? await otherAccountWith(db, documentHash, capture.userId) : null;
        verdict = idVerdict({ reading, answers, duplicate: documentHash ? other !== null : undefined, autoDecisions: !testAccount && (await autoVerificationInMarket(db, homeMarketId)) });
        check = {
          ...answers,
          ...(home && reading.address ? { addressMatches: sameAddress(reading.address, home) } : {}),
          ...(reading.readable && reading.source ? { source: reading.source } : {}),
          ...(reading.readable && reading.frontAgrees !== undefined ? { frontAgrees: reading.frontAgrees } : {}),
          by: reader.name,
          at: now.toISOString(),
          checks: verdict.checks,
          signals: verdict.signals,
          ...(reading.face?.score ? { face: reading.face.score } : {}),
          ...(reading.face?.liveness !== undefined ? { liveness: reading.face.liveness } : {}),
          decision: verdict.decision,
        };
        detailsCiphertext = reading.details && deps.detailsCipher ? deps.detailsCipher.encrypt(JSON.stringify(reading.details)) : null;
      } catch (error) {
        if (!(error instanceof AiUnavailableError) && !(error instanceof AiRefusedError)) throw error;
        // Not this time: staff read it themselves (it isn't retried, so one bad answer never loops).
        console.error('[id-reader]', error.message);
        check = { readable: false, by: `${reader.name} (unavailable)`, at: now.toISOString() };
      }
    }
    const [saved] = await db
      .update(identityCaptures)
      .set({ autoCheck: check, documentHash, detailsCiphertext, ...(other ? { duplicateOfUserId: other } : {}), updatedAt: now })
      .where(and(eq(identityCaptures.id, capture.id), isNull(identityCaptures.autoCheck)))
      .returning({ id: identityCaptures.id });
    read += 1;
    if (!saved) return;
    // Which accounts, never the ID.
    if (other) await systemAudit(db, 'identity_capture.duplicate_id', capture.userId, { captureId: capture.id, otherUserId: other });
    if (verdict && verdict.decision !== 'review') {
      const decided = await applyCaptureDecision(
        db,
        { captureId: capture.id, decision: verdict.decision === 'approved' ? 'approve' : 'reject', ...(verdict.rejectionReason ? { reason: verdict.rejectionReason } : {}), decider: { kind: 'auto' } },
        now,
        deps.doubleCheck === undefined ? {} : { doubleCheck: deps.doubleCheck },
      );
      if (decided) {
        await systemAudit(db, verdict.decision === 'approved' ? 'identity_capture.approved' : 'identity_capture.rejected', capture.userId, {
          captureId: capture.id,
          by: 'auto',
          ...(verdict.rejectionReason ? { reason: verdict.rejectionReason } : {}),
          ...(decided.verified ? { verified: 'own' } : {}),
        });
      }
      return;
    }
    // Our team decides: the staff who decide ID checks hear the reading is ready (never for test accounts).
    if (deps.notify && !testAccount) {
      try {
        // The ID's fraud score goes with it (owner, 2026-11-27: "show fraud score to me").
        const rejectedBefore = (
          await db
            .select({ id: identityCaptures.id })
            .from(identityCaptures)
            .where(and(eq(identityCaptures.userId, capture.userId), eq(identityCaptures.status, 'rejected')))
        ).length;
        const fraud = identityFraud({
          autoCheck: { readable: check.readable, nameMatches: check.nameMatches, isAdult: check.isAdult, notExpired: check.notExpired, frontAgrees: check.frontAgrees, checks: check.checks, signals: check.signals },
          duplicate: other !== null,
          rejectedBefore,
        });
        await deps.notify({ userId: capture.userId, captureId: capture.id, check, ...(fraud ? { fraud } : {}) });
      } catch (error) {
        // The reading is saved and shows in the queue; a failed email never undoes it.
        console.error('[id-reader] notifying staff failed:', error instanceof Error ? error.name : 'error');
      }
    }
  });
  return read;
}

/** The first other account whose photos carry the same ID (6.3), or null. */
async function otherAccountWith(db: Db, documentHash: string, userId: string): Promise<string | null> {
  const [other] = await db
    .select({ userId: identityCaptures.userId })
    .from(identityCaptures)
    .where(and(eq(identityCaptures.documentHash, documentHash), ne(identityCaptures.userId, userId)))
    .orderBy(asc(identityCaptures.createdAt))
    .limit(1);
  return other?.userId ?? null;
}

/**
 * Proofs of address this person had turned down automatically since their last verified one, staff decision or staff
 * request, among those sent before `before` (the owner's rule: one automatic miss, then our team).
 */
async function earlierAutoMisses(db: Db, userId: string, before: Date): Promise<number> {
  const rows = await db
    .select({ status: addressVerifications.status, decidedBy: addressVerifications.decidedBy, createdAt: addressVerifications.createdAt })
    .from(addressVerifications)
    .where(eq(addressVerifications.userId, userId))
    .orderBy(asc(addressVerifications.createdAt));
  let misses = 0;
  for (const row of rows) {
    if (row.createdAt.getTime() >= before.getTime()) break;
    if (row.status === 'verified' || row.status === 'requested' || row.decidedBy === 'staff') misses = 0;
    else if (row.status === 'rejected' && row.decidedBy === 'auto') misses += 1;
  }
  return misses;
}

/** Whether automatic ID decisions are on for a market: its own `auto_verification_id` flag, else the global one (off when neither). */
async function autoVerificationInMarket(db: Db, marketId: string): Promise<boolean> {
  const rows = await db
    .select({ marketId: featureFlags.marketId, enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(and(eq(featureFlags.key, 'auto_verification_id'), inArray(featureFlags.marketId, ['global', marketId])));
  return (rows.find((row) => row.marketId === marketId) ?? rows.find((row) => row.marketId === 'global'))?.enabled === true;
}

function systemAudit(db: Db, action: string, userId: string, metadata: Record<string, unknown>) {
  return db.insert(auditLog).values({ id: newId('aud'), actorRole: 'system', action, targetType: 'user', targetId: userId, metadata });
}
