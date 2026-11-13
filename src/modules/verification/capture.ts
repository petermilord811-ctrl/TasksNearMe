import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import type { ActionResult, IdentityCapturePhoto, IdentityCaptureResult } from '@/contracts';
import { IDENTITY_CAPTURE_RULES, identityCaptureInputSchema } from '@/contracts';
import type { FileStorage } from '@/integrations/storage';
import { recordAgreement, type RequestOrigin } from '@/modules/accounts/agreements';
import { files } from '@/modules/tasks/schema';
import { fieldError } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { ByteCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import { computeOnboarding } from './progress';
import { identityCaptures } from './schema';
import { livenessPromptFor } from './standing';
import { loadOnboardingState, syncHelperProfile } from './state';

/**
 * Our own ID check, the first of two stages (owner, 2026-11-13; blueprint 06 §1): after the Texas
 * biometric notice, the helper photographs the ID (the front, and the back unless it's a passport) and
 * takes a live selfie that follows a prompt. Every photo is re-encoded (no location or other metadata),
 * encrypted, and stored as a private file that only staff open, with a logged reason, until it's deleted
 * 30 days after the decision. Staff compare the photos and approve or reject; approval opens the
 * provider's hosted check as the double check (`startIdentity`).
 */

export interface IdentityCaptureDeps {
  db: Db;
  storage: FileStorage;
  /** Encrypts the photos at rest. */
  files: ByteCipher;
  /** Keys the selfie's prompt (BETTER_AUTH_SECRET). */
  secret: string;
}

/** Sends a person can make in a day, valid or not (each valid one is a staff review). */
const SUBMIT_RULE = { limit: 6, windowSeconds: 24 * 60 * 60 };
/** Big enough to read an ID's small print, and to compare a face. */
const DOCUMENT_EDGE_PX = 2000;
const SELFIE_EDGE_PX = 1600;
const FILE_KIND: Record<IdentityCapturePhoto, 'id_document' | 'id_selfie'> = { front: 'id_document', back: 'id_document', selfie: 'id_selfie' };
/** The private file kinds of our own ID check (`canViewFile` refuses them). */
export const IDENTITY_FILE_KINDS = ['id_document', 'id_selfie'] as const;

type Fields = Extract<IdentityCaptureResult, { code: 'validation_failed' }>['fieldErrors'];
const invalid = (fieldErrors: Fields): IdentityCaptureResult => ({ ok: false, code: 'validation_failed', fieldErrors });

async function identityStep(db: Db, userId: string, now: Date) {
  const state = await loadOnboardingState(db, userId, now);
  const step = computeOnboarding(state.facts).progress.steps.find((entry) => entry.step === 'identity');
  return { state, open: state.profile !== null && step !== undefined && step.state !== 'locked' };
}

/** The Texas biometric notice, accepted before the photos are taken (once per notice version). */
export async function acceptIdentityNotice(db: Db, userId: string, input: { consent?: unknown }, now: Date, origin: RequestOrigin = {}): Promise<ActionResult> {
  const { state, open } = await identityStep(db, userId, now);
  if (!open || state.identity.verified) return { ok: false, code: 'not_allowed' };
  if (input.consent !== true) return fieldError('consent', 'must_accept');
  await recordAgreement(db, userId, 'biometric_consent', origin, now);
  return { ok: true, code: 'updated' };
}

/** A photo, re-encoded as WebP (which drops its metadata), or null when it isn't one. */
async function preparePhoto(file: File, edge: number): Promise<{ body: Buffer; width: number; height: number } | null> {
  try {
    const { data, info } = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: 'error' })
      .rotate()
      .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    return { body: data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

const isUniqueViolation = (error: unknown): boolean => typeof error === 'object' && error !== null && ((error as { code?: string }).code === '23505' || isUniqueViolation((error as { cause?: unknown }).cause));

export async function submitIdentityCapture(deps: IdentityCaptureDeps, userId: string, form: FormData, now: Date): Promise<IdentityCaptureResult> {
  const { db } = deps;
  const { state, open } = await identityStep(db, userId, now);
  if (!open || !state.identity.canCapture) return { ok: false, code: 'not_allowed' };
  if (state.agreements.biometric_consent === undefined) return invalid({ consent: ['must_accept'] });

  const parsed = identityCaptureInputSchema.safeParse({ documentType: String(form.get('documentType') ?? '') });
  const passport = parsed.success && parsed.data.documentType === 'passport';
  const wanted: IdentityCapturePhoto[] = passport ? ['front', 'selfie'] : ['front', 'back', 'selfie'];
  const photos = new Map<IdentityCapturePhoto, File>();
  for (const kind of wanted) {
    const value = form.get(kind);
    if (value instanceof File && value.size > 0) photos.set(kind, value);
  }
  const fieldErrors: Fields = {};
  if (!parsed.success) fieldErrors.documentType = ['required'];
  for (const kind of wanted) if (!photos.has(kind)) fieldErrors[kind] = ['required'];
  if (!parsed.success || Object.keys(fieldErrors).length > 0) return invalid(fieldErrors);
  for (const file of photos.values()) {
    if (!(IDENTITY_CAPTURE_RULES.acceptedTypes as readonly string[]).includes(file.type)) return { ok: false, code: 'unsupported_type' };
    if (file.size > IDENTITY_CAPTURE_RULES.maxMegabytes * 1024 * 1024) return { ok: false, code: 'too_large' };
  }

  const limited = await consumeRateLimit(db, `identity-capture:user:${userId}`, SUBMIT_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited' };

  const prepared = new Map<IdentityCapturePhoto, { body: Buffer; width: number; height: number }>();
  for (const [kind, file] of photos) {
    const photo = await preparePhoto(file, kind === 'selfie' ? SELFIE_EDGE_PX : DOCUMENT_EDGE_PX);
    if (!photo) return invalid({ [kind]: ['invalid'] });
    prepared.set(kind, photo);
  }

  // Encrypted before it's stored; the files table keeps the type it opens as.
  const stored = new Map<IdentityCapturePhoto, { id: string; storageKey: string; bytes: number; width: number; height: number }>();
  for (const [kind, photo] of prepared) {
    const id = newId('fil');
    const storageKey = `identity/${id}.bin`;
    const sealed = deps.files.encrypt(photo.body);
    await deps.storage.put(storageKey, sealed, 'application/octet-stream');
    stored.set(kind, { id, storageKey, bytes: sealed.length, width: photo.width, height: photo.height });
  }

  const captureId = newId('idc');
  try {
    await db.transaction(async (tx) => {
      await tx.insert(files).values(
        [...stored].map(([kind, file]) => ({ id: file.id, ownerUserId: userId, kind: FILE_KIND[kind], storageKey: file.storageKey, contentType: 'image/webp', width: file.width, height: file.height, bytes: file.bytes, alt: '', createdAt: now })),
      );
      await tx.insert(identityCaptures).values({
        id: captureId,
        userId,
        documentType: parsed.data.documentType,
        frontFileId: stored.get('front')!.id,
        backFileId: stored.get('back')?.id ?? null,
        selfieFileId: stored.get('selfie')!.id,
        // The app picks the prompt (whatever the form says), the same one the page showed.
        promptKey: livenessPromptFor(userId, state.captureRows.length, deps.secret),
        status: 'submitted',
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    for (const file of stored.values()) await deps.storage.delete(file.storageKey);
    // Another send got there first (one set of photos in review at a time).
    if (isUniqueViolation(error)) return { ok: false, code: 'not_allowed' };
    throw error;
  }
  await db.insert(auditLog).values({ id: newId('aud'), actorId: userId, actorRole: 'user', action: 'identity_capture.submitted', targetType: 'user', targetId: userId, metadata: { captureId, documentType: parsed.data.documentType } });
  await syncHelperProfile(db, userId, now);
  return { ok: true, code: 'submitted' };
}

/** The file ids a capture still holds. */
export function captureFileIds(row: { frontFileId: string | null; backFileId: string | null; selfieFileId: string | null }): string[] {
  return [row.frontFileId, row.backFileId, row.selfieFileId].filter((id): id is string => id !== null);
}

/** Deletes a capture's photos (the row keeps its status, dates and answers). */
export async function deleteIdentityCapturePhotos(deps: { db: Db; storage: FileStorage }, captureId: string, now: Date): Promise<boolean> {
  const [row] = await deps.db.select().from(identityCaptures).where(eq(identityCaptures.id, captureId)).limit(1);
  const ids = row ? captureFileIds(row) : [];
  if (!row || ids.length === 0) return false;
  const stored = await deps.db.select({ id: files.id, storageKey: files.storageKey }).from(files).where(inArray(files.id, ids));
  for (const file of stored) await deps.storage.delete(file.storageKey);
  await deps.db.update(identityCaptures).set({ frontFileId: null, backFileId: null, selfieFileId: null, filesDeletedAt: now, updatedAt: now }).where(eq(identityCaptures.id, row.id));
  if (stored.length) await deps.db.delete(files).where(and(inArray(files.id, stored.map((file) => file.id)), inArray(files.kind, [...IDENTITY_FILE_KINDS])));
  return true;
}
