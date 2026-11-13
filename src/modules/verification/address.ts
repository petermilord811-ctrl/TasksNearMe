import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { AddressProofResult, AddressSuggestion, FieldErrorCode } from '@/contracts';
import { ADDRESS_PROOF_RULES, addressProofInputSchema } from '@/contracts';
import { GeocoderUnavailableError, type GeoPlace, type Geocoder } from '@/integrations/geocoding';
import type { FileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { distanceKm, nearestArea } from '@/modules/markets/geo';
import { areas, markets } from '@/modules/markets/schema';
import { files } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import { computeOnboarding } from './progress';
import { addressVerifications } from './schema';
import { loadOnboardingState, syncHelperProfile } from './state';

/**
 * The home address with a proof-of-address document (added 2026-11-12). The address is chosen from
 * search and confirmed like a task's (Mapbox: known address points only, looked up again on submit, never
 * a stored coordinate); it's stored encrypted. The document is private: photos are re-encoded (no
 * metadata), PDFs must really be PDFs, and only staff open it, with a logged reason, until it's deleted
 * 30 days after the decision.
 */

export interface AddressProofDeps {
  db: Db;
  storage: FileStorage;
  geocoder: Geocoder;
  cipher: FieldCipher;
}

/** Proofs a person can send in a day (each one is a staff review). */
const SUBMIT_RULE = { limit: 6, windowSeconds: 24 * 60 * 60 };
/** Big enough to read small print; re-encoding drops the metadata. */
const DOCUMENT_EDGE_PX = 2400;

async function marketOf(db: Db, userId: string) {
  const [row] = await db.select({ market: markets }).from(users).innerJoin(markets, eq(markets.id, users.homeMarketId)).where(eq(users.id, userId)).limit(1);
  return row?.market ?? null;
}

/** Homes are verified in and around the market: up to twice its service radius from the center (people commute in). */
function inVerifiedRegion(market: { centerLat: number; centerLng: number; serviceRadiusKm: number }, place: { lat: number; lng: number }): boolean {
  return distanceKm({ lat: market.centerLat, lng: market.centerLng }, place) <= market.serviceRadiusKm * 2;
}

export async function searchHomeAddresses(deps: Pick<AddressProofDeps, 'db' | 'geocoder'>, userId: string, query: string): Promise<AddressSuggestion[]> {
  if (query.trim().length < 3) return [];
  const market = await marketOf(deps.db, userId);
  if (!market) return [];
  const marketAreas = await deps.db.select().from(areas).where(eq(areas.marketId, market.id));
  const places = await deps.geocoder.search(query, { near: { lat: market.centerLat, lng: market.centerLng }, withinKm: market.serviceRadiusKm * 2 });
  return places.map((place) => {
    const area = distanceKm({ lat: market.centerLat, lng: market.centerLng }, place) <= market.serviceRadiusKm ? nearestArea(marketAreas, place) : null;
    return {
      placeId: place.placeId,
      line1: place.line1,
      line2: `${place.city}, ${place.state} ${place.zip}`,
      ...(area ? { areaName: area.name } : {}),
      inServiceArea: inVerifiedRegion(market, place),
    };
  });
}

type Fields = Partial<Record<'placeId' | 'line2' | 'documentType' | 'declaration' | 'file', FieldErrorCode[]>>;
const invalid = (fieldErrors: Fields): AddressProofResult => ({ ok: false, code: 'validation_failed', fieldErrors });

/** The document, ready to store: a re-encoded photo, or the PDF as sent. */
async function prepareDocument(file: File): Promise<{ ok: true; body: Buffer; contentType: string; ext: string; width: number; height: number } | { ok: false; result: AddressProofResult }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (file.type === 'application/pdf') {
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return { ok: false, result: invalid({ file: ['invalid'] }) };
    return { ok: true, body: bytes, contentType: 'application/pdf', ext: 'pdf', width: 0, height: 0 };
  }
  try {
    const { data, info } = await sharp(bytes, { failOn: 'error' })
      .rotate()
      .resize({ width: DOCUMENT_EDGE_PX, height: DOCUMENT_EDGE_PX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, body: data, contentType: 'image/webp', ext: 'webp', width: info.width, height: info.height };
  } catch {
    return { ok: false, result: { ok: false, code: 'unsupported_type' } };
  }
}

export async function submitAddressProof(deps: AddressProofDeps, userId: string, form: FormData, now: Date): Promise<AddressProofResult> {
  const { db } = deps;
  const state = await loadOnboardingState(db, userId, now);
  const step = computeOnboarding(state.facts).progress.steps.find((s) => s.step === 'address');
  if (!step || step.state === 'locked' || !state.address.canSubmit) return { ok: false, code: 'not_allowed' };

  const line2 = String(form.get('line2') ?? '').trim();
  const parsed = addressProofInputSchema.safeParse({
    placeId: String(form.get('placeId') ?? ''),
    ...(line2 ? { line2 } : {}),
    documentType: String(form.get('documentType') ?? ''),
    declaration: form.get('declaration') === 'true',
  });
  const file = form.get('file');
  const fileErrors: Fields = file instanceof File && file.size > 0 ? {} : { file: ['required'] };
  if (!parsed.success) {
    const fieldErrors: Fields = { ...fileErrors };
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'placeId') as keyof Fields;
      (fieldErrors[key] ??= []).push(issue.message as FieldErrorCode);
    }
    return invalid(fieldErrors);
  }
  if (!(file instanceof File) || file.size === 0) return invalid(fileErrors);
  if (!(ADDRESS_PROOF_RULES.acceptedTypes as readonly string[]).includes(file.type)) return { ok: false, code: 'unsupported_type' };
  if (file.size > ADDRESS_PROOF_RULES.maxMegabytes * 1024 * 1024) return { ok: false, code: 'too_large' };

  const limited = await consumeRateLimit(db, `address-proof:user:${userId}`, SUBMIT_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited' };

  let place: GeoPlace | null;
  try {
    place = await deps.geocoder.resolve(parsed.data.placeId);
  } catch (error) {
    if (!(error instanceof GeocoderUnavailableError)) throw error;
    console.error('[geocoding]', error.message);
    return { ok: false, code: 'unknown' };
  }
  if (!place) return invalid({ placeId: ['invalid'] });
  const market = await marketOf(db, userId);
  if (!market || !inVerifiedRegion(market, place)) return invalid({ placeId: ['not_supported'] });
  const marketAreas = await db.select().from(areas).where(eq(areas.marketId, market.id));

  const document = await prepareDocument(file);
  if (!document.ok) return document.result;
  const fileId = newId('fil');
  const storageKey = `address_proof/${fileId}.${document.ext}`;
  await deps.storage.put(storageKey, document.body, document.contentType);
  await db.insert(files).values({
    id: fileId,
    ownerUserId: userId,
    kind: 'address_proof',
    storageKey,
    contentType: document.contentType,
    width: document.width,
    height: document.height,
    bytes: document.body.length,
    alt: '',
    createdAt: now,
  });
  const address = { line1: place.line1, ...(parsed.data.line2 ? { line2: parsed.data.line2 } : {}), city: place.city, state: place.state, zip: place.zip };
  const id = newId('adr');
  await db.insert(addressVerifications).values({
    id,
    userId,
    status: 'in_review',
    addressCiphertext: deps.cipher.encrypt(JSON.stringify(address)),
    areaId: nearestArea(marketAreas, place)?.id ?? null,
    documentType: parsed.data.documentType,
    documentFileId: fileId,
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(auditLog).values({ id: newId('aud'), actorId: userId, actorRole: 'user', action: 'address.submitted', targetType: 'user', targetId: userId, metadata: { verificationId: id, documentType: parsed.data.documentType } });
  await syncHelperProfile(db, userId, now);
  return { ok: true, code: 'submitted' };
}

/** Deletes a stored proof document (the row keeps its status and dates). */
export async function deleteAddressDocument(deps: { db: Db; storage: FileStorage }, verificationId: string, now: Date): Promise<boolean> {
  const [row] = await deps.db.select().from(addressVerifications).where(eq(addressVerifications.id, verificationId)).limit(1);
  if (!row?.documentFileId) return false;
  const [file] = await deps.db.select().from(files).where(eq(files.id, row.documentFileId)).limit(1);
  if (file) await deps.storage.delete(file.storageKey);
  await deps.db.update(addressVerifications).set({ documentFileId: null, documentDeletedAt: now, updatedAt: now }).where(eq(addressVerifications.id, row.id));
  if (file) await deps.db.delete(files).where(eq(files.id, file.id));
  return true;
}
