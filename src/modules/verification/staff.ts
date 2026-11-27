import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm';
import type {
  ActionResult,
  IdentityReadingState,
  AddressAutoCheck,
  AddressDecisionInput,
  AddressDocumentType,
  AddressProofRevealInput,
  AddressProofRevealResult,
  AddressRejectionReason,
  AddressVerificationStatus,
  AdminAddressProofView,
  AdminIdentityCaptureView,
  AdminIdentityReviewRow,
  AdminPersonVerification,
  AdminVerificationActionId,
  AdminVerificationQueue,
  AdminVerificationsPageData,
  BackgroundAdjudication,
  CategorySlug,
  IdDocumentDetails,
  IdentityAutoCheck,
  IdentityCaptureDecisionInput,
  IdentityCaptureDetails,
  IdentityCapturePhoto,
  IdentityCaptureRejectionReason,
  IdentityCaptureRevealInput,
  IdentityCaptureRevealResult,
  IdentityDetailsRevealInput,
  IdentityDetailsRevealResult,
  IdentityCaptureStatus,
  IdentityDocumentType,
  IdentityProviderOutcome,
  LivenessPrompt,
  PersonSummary,
  StaffRole,
  VerificationActionInput,
} from '@/contracts';
import { addressFraud, identityFraud } from '@/shared/fraud/score';
import {
  ADMIN_VERIFICATION_QUEUES,
  addressDecisionInputSchema,
  addressProofRevealInputSchema,
  IDENTITY_CAPTURE_PHOTOS,
  IDENTITY_PROVIDER_OUTCOMES,
  identityCaptureDecisionInputSchema,
  identityCaptureRevealInputSchema,
  identityDetailsRevealInputSchema,
  verificationActionInputSchema,
} from '@/contracts';
import { aiReadingSetUp, AiUnavailableError } from '@/integrations/ai';
import { isReservedEmailAddress } from '@/integrations/email';
import type { IdBarcodeDetails } from '@/integrations/ocr';
import type { FileStorage } from '@/integrations/storage';
import { AGREEMENT_VERSIONS } from '@/modules/accounts/agreements';
import { users } from '@/modules/accounts/schema';
import { areas } from '@/modules/markets/schema';
import { personSummaryOf, type StaffActor } from '@/modules/support/staff';
import { files } from '@/modules/tasks/schema';
import { marketTimeZones } from '@/modules/markets/time-zone';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { ByteCipher, FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { openIdPhoto, readPendingIds, type IdReadingDeps } from './auto-check';
import { applyCaptureDecision } from './capture-decision';
import { compareIdDetails, homeAddressOf, type PostalAddress } from './id-details';
import { captureFileIds, IDENTITY_FILE_KINDS } from './capture';
import type { VerificationProviders } from './providers';
import { addressVerifications, backgroundChecks, identityCaptures, identityVerifications, type StoredAddressAutoCheck, type StoredIdentityAutoCheck } from './schema';
import { ADDRESS_RULES, BACKGROUND_RULES, IDENTITY_CAPTURE_RULES, identityStanding, type IdentityRow } from './standing';
import { addressLabel, emitVerificationEvent, loadOnboardingState, syncHelperProfile } from './state';

/**
 * Staff verification reviews (src/contracts/admin-verification.ts): the queues, a person's Verification
 * section, decisions, and opening a proof of address or the ID photos of our own check (stage 1). Trust
 * and safety, support leads and admins decide; every decision and every opened document goes to the
 * audit log with the staff member's note or reason.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DECIDERS: readonly StaffRole[] = ['trust_safety', 'support_lead', 'admin'];
const QUEUE_LIMIT = 100;
/** How long an opened document link works. */
export const DOCUMENT_LINK_MINUTES = 5;

export const canDecideVerification = (staff: { roles: readonly StaffRole[] }) => staff.roles.some((role) => DECIDERS.includes(role));
/** Background-check adjudication (approving after review, the pre-adverse and the final notice): trust and safety only (blueprint 08 §4). */
const ADJUDICATORS: readonly StaffRole[] = ['trust_safety'];
export const canAdjudicateBackground = (staff: { roles: readonly StaffRole[] }) => staff.roles.some((role) => ADJUDICATORS.includes(role));
const BACKGROUND_ACTIONS: readonly AdminVerificationActionId[] = ['engage_background', 'pre_adverse_background', 'post_adverse_background'];

const providerOutcomeOf = (value: string | null | undefined): IdentityProviderOutcome | undefined =>
  !value ? undefined : (IDENTITY_PROVIDER_OUTCOMES as readonly string[]).includes(value) ? (value as IdentityProviderOutcome) : 'other';
const roleOf = (staff: StaffActor) => DECIDERS.find((role) => staff.roles.includes(role)) ?? staff.roles[0] ?? 'support_agent';

function autoCheckView(stored: StoredAddressAutoCheck | null): AddressAutoCheck | undefined {
  if (!stored) return undefined;
  return {
    readable: stored.readable,
    ...(stored.nameMatches !== undefined ? { nameMatches: stored.nameMatches } : {}),
    ...(stored.addressMatches !== undefined ? { addressMatches: stored.addressMatches } : {}),
    ...(stored.recent !== undefined ? { recent: stored.recent } : {}),
    ...(stored.documentType ? { documentType: stored.documentType as AddressDocumentType | 'other' } : {}),
    ...(stored.issuer ? { issuer: stored.issuer } : {}),
    ...(stored.documentDate ? { documentDate: stored.documentDate } : {}),
    ...(stored.checks ? { checks: stored.checks } : {}),
    ...(stored.signals && stored.signals.length > 0 ? { signals: stored.signals } : {}),
    ...(stored.decision ? { decision: stored.decision } : {}),
  };
}

function identityAutoCheckView(stored: StoredIdentityAutoCheck | null): IdentityAutoCheck | undefined {
  if (!stored) return undefined;
  return {
    readable: stored.readable,
    ...(stored.nameMatches !== undefined ? { nameMatches: stored.nameMatches } : {}),
    ...(stored.isAdult !== undefined ? { isAdult: stored.isAdult } : {}),
    ...(stored.notExpired !== undefined ? { notExpired: stored.notExpired } : {}),
    ...(stored.expiresMonth && stored.expiresYear ? { expires: { month: stored.expiresMonth, year: stored.expiresYear } } : {}),
    ...(stored.documentType ? { documentType: stored.documentType as IdentityDocumentType | 'other' } : {}),
    ...(stored.addressMatches !== undefined ? { addressMatches: stored.addressMatches } : {}),
    ...(stored.source ? { source: stored.source } : {}),
    ...(stored.frontAgrees !== undefined ? { frontAgrees: stored.frontAgrees } : {}),
    ...(stored.checks ? { checks: stored.checks } : {}),
    ...(stored.signals ? { signals: stored.signals } : {}),
    ...(stored.face ? { face: stored.face } : {}),
    ...(stored.liveness !== undefined ? { liveness: stored.liveness } : {}),
    ...(stored.decision ? { decision: stored.decision } : {}),
  };
}

/**
 * A try's fraud score (owner, 2026-11-27: "show fraud score to me"): its reading, the same ID on another account (until
 * staff clear it), and the person's earlier photos turned down. Absent before its reading.
 */
function captureFraud(
  row: { createdAt: Date; duplicateOfUserId: string | null; duplicateClearedAt: Date | null },
  theirs: readonly { createdAt: Date; status: string }[],
  autoCheck: IdentityAutoCheck | undefined,
) {
  if (!autoCheck) return undefined;
  const rejectedBefore = theirs.filter((other) => other.status === 'rejected' && other.createdAt < row.createdAt).length;
  return identityFraud({ autoCheck, duplicate: row.duplicateOfUserId !== null && row.duplicateClearedAt === null, rejectedBefore }) ?? undefined;
}

const PHOTO_COLUMN: Record<IdentityCapturePhoto, 'frontFileId' | 'backFileId' | 'selfieFileId'> = { front: 'frontFileId', back: 'backFileId', selfie: 'selfieFileId' };
const photosOf = (row: Record<'frontFileId' | 'backFileId' | 'selfieFileId', string | null>) => IDENTITY_CAPTURE_PHOTOS.filter((kind) => row[PHOTO_COLUMN[kind]] !== null);

async function areaNames(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const rows = await db.select({ id: areas.id, name: areas.name }).from(areas).where(inArray(areas.id, wanted));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/**
 * The other accounts whose ID photos carry the same ID (a keyed hash of its number, state and birth date;
 * plan 6.3), per hash. Up to 5 people each; the ID itself is never stored, so never shown.
 */
async function othersWithSameId(db: Db, hashes: readonly string[], except: string): Promise<Map<string, PersonSummary[]>> {
  const wanted = [...new Set(hashes)];
  if (wanted.length === 0) return new Map();
  const rows = await db
    .selectDistinct({ hash: identityCaptures.documentHash, userId: identityCaptures.userId })
    .from(identityCaptures)
    .where(and(inArray(identityCaptures.documentHash, wanted), ne(identityCaptures.userId, except)));
  const people = rows.length ? await db.select().from(users).where(inArray(users.id, [...new Set(rows.map((row) => row.userId))])) : [];
  const out = new Map<string, PersonSummary[]>();
  for (const row of rows) {
    const person = people.find((candidate) => candidate.id === row.userId);
    if (!person || !row.hash) continue;
    const list = out.get(row.hash) ?? [];
    if (list.length < 5) list.push(personSummaryOf(person));
    out.set(row.hash, list);
  }
  return out;
}

// ---- Queues ---------------------------------------------------------------------------------------

async function addressQueue(db: Db, now: Date) {
  const rows = await db
    .select({ proof: addressVerifications, user: users })
    .from(addressVerifications)
    .innerJoin(users, eq(users.id, addressVerifications.userId))
    .where(eq(addressVerifications.status, 'in_review'))
    .orderBy(asc(addressVerifications.submittedAt))
    .limit(QUEUE_LIMIT);
  const [names, rejected] = await Promise.all([
    areaNames(db, rows.map((row) => row.proof.areaId)),
    rows.length
      ? db
          .select({ userId: addressVerifications.userId, createdAt: addressVerifications.createdAt })
          .from(addressVerifications)
          .where(and(inArray(addressVerifications.userId, [...new Set(rows.map((row) => row.proof.userId))]), eq(addressVerifications.status, 'rejected')))
      : [],
  ]);
  return rows.map(({ proof, user }) => {
    const submittedAt = proof.submittedAt ?? proof.createdAt;
    const autoCheck = autoCheckView(proof.autoCheck);
    const areaName = proof.areaId ? names.get(proof.areaId) : undefined;
    const fraud = addressFraud({ autoCheck, rejectedBefore: rejected.filter((row) => row.userId === proof.userId && row.createdAt < proof.createdAt).length });
    return {
      id: proof.id,
      person: personSummaryOf(user),
      submittedAt: submittedAt.toISOString(),
      documentType: (proof.documentType ?? 'utility_bill') as AddressDocumentType,
      ...(areaName ? { areaName } : {}),
      ...(autoCheck ? { autoCheck } : {}),
      ...(fraud ? { fraud } : {}),
      overdue: now.getTime() - submittedAt.getTime() > ADDRESS_RULES.responseTargetHours * HOUR_MS,
    };
  });
}

/** How long approval waits for a configured reader that hasn't answered (completion plan 5.18). */
export const ID_READING_WAIT_MS = 15 * 60_000;
/** What the audit log says of an approval made without the automatic reading. */
export const APPROVED_WITHOUT_READING = 'approved without the automatic reading (no duplicate check)';

/**
 * Photos in review without their automatic reading: when a reader is set up, approval waits for it (the job
 * reads within minutes; a test account's photos are read when staff open them) up to `ID_READING_WAIT_MS`;
 * without a reader it goes ahead without the duplicate check. Undefined once the reading ran, readable or not.
 */
export function identityReadingState(capture: { status: string; autoCheck: unknown; submittedAt: Date }, readerOn: boolean, now: Date): IdentityReadingState | undefined {
  if (capture.status !== 'submitted' || capture.autoCheck !== null) return undefined;
  if (!readerOn) return { state: 'skipped', why: 'no_reader' };
  const until = new Date(capture.submittedAt.getTime() + ID_READING_WAIT_MS);
  return now < until ? { state: 'waiting', until: until.toISOString() } : { state: 'skipped', why: 'timed_out' };
}

async function identityQueue(db: Db, now: Date, readerOn = aiReadingSetUp(), deciding = true): Promise<AdminIdentityReviewRow[]> {
  // People who could need staff: photos waiting for review, a verified ID whose name didn't match, failed
  // tries, or the same ID on two accounts (not yet cleared).
  const [fromChecks, fromCaptures] = await Promise.all([
    db
      .selectDistinct({ userId: identityVerifications.userId })
      .from(identityVerifications)
      .where(or(and(eq(identityVerifications.status, 'verified'), eq(identityVerifications.nameMatches, false)), inArray(identityVerifications.status, ['requires_input', 'canceled']))),
    db
      .selectDistinct({ userId: identityCaptures.userId })
      .from(identityCaptures)
      .where(or(inArray(identityCaptures.status, ['submitted', 'rejected', 'canceled']), and(isNotNull(identityCaptures.duplicateOfUserId), isNull(identityCaptures.duplicateClearedAt)))),
  ]);
  const ids = [...new Set([...fromChecks, ...fromCaptures].map((row) => row.userId))];
  if (ids.length === 0) return [];
  const [rows, captures, people] = await Promise.all([
    db.select().from(identityVerifications).where(inArray(identityVerifications.userId, ids)),
    db.select().from(identityCaptures).where(inArray(identityCaptures.userId, ids)),
    db.select().from(users).where(inArray(users.id, ids)),
  ]);
  const out: AdminIdentityReviewRow[] = [];
  const zones = await marketTimeZones(db, people.map((person) => person.homeMarketId));
  // A deleted account has nothing left to decide.
  for (const person of people.filter((row) => row.status !== 'deleted')) {
    const theirs = captures.filter((row) => row.userId === person.id);
    const standing = identityStanding(rows.filter((row) => row.userId === person.id), now, theirs, zones.get(person.homeMarketId)!);
    const waiting = standing.capture?.status === 'submitted' ? theirs.find((row) => row.id === standing.capture!.id) : undefined;
    if (standing.blocked === 'duplicate_id' && standing.duplicate) {
      // The same ID on another account: staff look at both before the double check opens.
      const flagged = theirs.find((row) => row.id === standing.duplicate!.id)!;
      // Who else holds the same ID is for the capture deciders only (5.18); everyone else sees that there is one.
      const others = deciding && flagged.documentHash ? ((await othersWithSameId(db, [flagged.documentHash], person.id)).get(flagged.documentHash) ?? []) : [];
      const autoCheck = identityAutoCheckView(flagged.autoCheck);
      const fraud = captureFraud(flagged, theirs, autoCheck);
      out.push({
        id: flagged.id,
        person: personSummaryOf(person),
        kind: 'duplicate_id',
        at: flagged.submittedAt.toISOString(),
        attempts: standing.attempts,
        ...(flagged.status === 'submitted'
          ? { capture: { documentType: flagged.documentType as IdentityDocumentType, ...(autoCheck ? { autoCheck } : {}), overdue: now.getTime() - flagged.submittedAt.getTime() > IDENTITY_CAPTURE_RULES.responseTargetHours * HOUR_MS, ...(fraud ? { fraud } : {}) } }
          : {}),
        duplicate: { others },
      });
      continue;
    }
    if (waiting) {
      const autoCheck = identityAutoCheckView(waiting.autoCheck);
      const reading = identityReadingState(waiting, readerOn, now);
      const fraud = captureFraud(waiting, theirs, autoCheck);
      out.push({
        id: waiting.id,
        person: personSummaryOf(person),
        kind: 'capture',
        at: waiting.submittedAt.toISOString(),
        attempts: standing.attempts,
        capture: { documentType: waiting.documentType as IdentityDocumentType, ...(autoCheck ? { autoCheck } : {}), overdue: now.getTime() - waiting.submittedAt.getTime() > IDENTITY_CAPTURE_RULES.responseTargetHours * HOUR_MS, ...(reading ? { reading } : {}), ...(fraud ? { fraud } : {}) },
      });
      continue;
    }
    if (standing.blocked === 'double_check_review' && standing.doubleCheck && standing.reviewSince) {
      // Both results: the photos our team approved, and what the provider said.
      const approved = theirs.filter((row) => row.status === 'approved').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).at(-1);
      const session = rows.find((row) => row.id === standing.doubleCheck!.id);
      const outcome = providerOutcomeOf(session?.providerOutcome);
      out.push({
        id: standing.doubleCheck.id,
        person: personSummaryOf(person),
        kind: 'double_check',
        at: standing.reviewSince.toISOString(),
        attempts: standing.attempts,
        doubleCheck: {
          approvedAt: (approved?.decidedAt ?? approved?.createdAt ?? standing.reviewSince).toISOString(),
          ...(outcome ? { providerOutcome: outcome } : {}),
          endedAt: standing.reviewSince.toISOString(),
        },
      });
      continue;
    }
    const kind = standing.nameCheck ? ('name_check' as const) : standing.blocked === 'too_many_attempts' ? ('too_many_attempts' as const) : null;
    if (!kind || !standing.reviewSince) continue;
    out.push({ id: standing.latest?.id ?? standing.capture?.id ?? person.id, person: personSummaryOf(person), kind, at: standing.reviewSince.toISOString(), attempts: standing.attempts });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at)).slice(0, QUEUE_LIMIT);
}

async function backgroundQueue(db: Db, now: Date) {
  const considered = await db.select().from(backgroundChecks).where(eq(backgroundChecks.status, 'consider'));
  const out = [];
  for (const check of considered) {
    if (check.adjudication === 'engaged' || check.adjudication === 'post_adverse') continue;
    const state = await loadOnboardingState(db, check.userId, now);
    if (state.background.latest?.id !== check.id) continue; // a newer check replaced it
    const [person] = await db.select().from(users).where(eq(users.id, check.userId)).limit(1);
    if (!person) continue;
    out.push({
      id: check.id,
      person: personSummaryOf(person),
      completedAt: (check.completedAt ?? check.updatedAt).toISOString(),
      ...(check.adjudication === 'pre_adverse' ? { adjudication: 'pre_adverse' as const } : {}),
      ...(check.adjudication === 'pre_adverse' && check.preAdverseAt ? { finalDecisionFrom: new Date(check.preAdverseAt.getTime() + BACKGROUND_RULES.disputeDays * DAY_MS).toISOString() } : {}),
      requiredFor: state.facts.services.filter((s) => s.requiresBackgroundCheck).map((s) => s.categorySlug as CategorySlug),
    });
  }
  return out.sort((a, b) => a.completedAt.localeCompare(b.completedAt)).slice(0, QUEUE_LIMIT);
}

export async function getVerificationCounts(db: Db, now: Date): Promise<{ counts: Record<AdminVerificationQueue, number>; oldestAt?: string }> {
  const [address, identity, background] = await Promise.all([addressQueue(db, now), identityQueue(db, now), backgroundQueue(db, now)]);
  const oldest = [address[0]?.submittedAt, identity[0]?.at, background[0]?.completedAt].filter((at): at is string => Boolean(at)).sort()[0];
  return { counts: { address: address.length, identity: identity.length, background: background.length }, ...(oldest ? { oldestAt: oldest } : {}) };
}

export async function getAdminVerificationsPage(db: Db, staff: StaffActor, queue: string | undefined, now: Date, readerOn = aiReadingSetUp()): Promise<AdminVerificationsPageData> {
  const [address, identity, background] = await Promise.all([addressQueue(db, now), identityQueue(db, now, readerOn, canDecideVerification(staff)), backgroundQueue(db, now)]);
  const chosen = (ADMIN_VERIFICATION_QUEUES as readonly string[]).includes(queue ?? '') ? (queue as AdminVerificationQueue) : address.length || !(identity.length || background.length) ? 'address' : identity.length ? 'identity' : 'background';
  return {
    queue: chosen,
    counts: { address: address.length, identity: identity.length, background: background.length },
    address: chosen === 'address' ? address : [],
    identity: chosen === 'identity' ? identity : [],
    background: chosen === 'background' ? background : [],
    canDecide: canDecideVerification(staff),
  };
}

// ---- A person's verification ----------------------------------------------------------------------

export async function getPersonVerification(db: Db, staff: StaffActor, userId: string, now: Date, readerOn = aiReadingSetUp()): Promise<AdminPersonVerification> {
  const state = await loadOnboardingState(db, userId, now);
  const { identity, address, background } = state;
  const proofRows = state.addressRows.filter((row) => row.status !== 'withdrawn').reverse().slice(0, 5);
  const captureRows = [...state.captureRows].reverse().slice(0, 5);
  const [names, deciders] = await Promise.all([
    areaNames(db, proofRows.map((row) => row.areaId)),
    (async () => {
      const ids = [...new Set([...proofRows, ...captureRows].map((row) => row.decidedByUserId).filter((id): id is string => id !== null))];
      return ids.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
    })(),
  ]);
  // Who else holds the same ID: the capture deciders only (5.18).
  const flagged = canDecideVerification(staff) ? captureRows.filter((row) => row.duplicateOfUserId && row.documentHash) : [];
  const sameId = await othersWithSameId(db, flagged.map((row) => row.documentHash!), userId);
  const captures: AdminIdentityCaptureView[] = captureRows.map((row) => {
    const autoCheck = identityAutoCheckView(row.autoCheck);
    const reading = identityReadingState(row, readerOn, now);
    const decidedBy = deciders.find((person) => person.id === row.decidedByUserId)?.name;
    const duplicateOf = row.duplicateOfUserId && row.documentHash ? sameId.get(row.documentHash) : undefined;
    const fraud = captureFraud(row, state.captureRows, autoCheck);
    return {
      id: row.id,
      status: row.status as IdentityCaptureStatus,
      documentType: row.documentType as IdentityDocumentType,
      submittedAt: row.submittedAt.toISOString(),
      prompt: row.promptKey as LivenessPrompt,
      ...(autoCheck ? { autoCheck } : {}),
      ...(reading ? { reading } : {}),
      photos: photosOf(row),
      ...(row.filesDeletedAt ? { photosDeletedAt: row.filesDeletedAt.toISOString() } : {}),
      ...(row.decidedAt ? { decidedAt: row.decidedAt.toISOString() } : {}),
      ...(decidedBy ? { decidedBy } : {}),
      ...(row.decidedBy === 'auto' || row.decidedBy === 'staff' ? { decidedByKind: row.decidedBy } : {}),
      ...(row.detailsCiphertext ? { detailsStored: true } : {}),
      ...(row.rejectionReason ? { rejectionReason: row.rejectionReason as IdentityCaptureRejectionReason } : {}),
      ...(row.staffNote ? { note: row.staffNote } : {}),
      ...(duplicateOf?.length ? { duplicateOf } : {}),
      ...(row.duplicateClearedAt ? { duplicateClearedAt: row.duplicateClearedAt.toISOString() } : {}),
      ...(fraud ? { fraud } : {}),
    };
  });
  const proofs: AdminAddressProofView[] = proofRows.map((row) => {
    const autoCheck = autoCheckView(row.autoCheck);
    const fraud = addressFraud({ autoCheck, rejectedBefore: state.addressRows.filter((other) => other.status === 'rejected' && other.createdAt < row.createdAt).length });
    const decidedBy = deciders.find((person) => person.id === row.decidedByUserId)?.name;
    const areaName = row.areaId ? names.get(row.areaId) : undefined;
    return {
      id: row.id,
      status: row.status as AdminAddressProofView['status'],
      ...(row.submittedAt ? { submittedAt: row.submittedAt.toISOString() } : {}),
      ...(row.documentType ? { documentType: row.documentType as AddressDocumentType } : {}),
      ...(areaName ? { areaName } : {}),
      documentAvailable: row.documentFileId !== null,
      ...(row.documentDeletedAt ? { documentDeletedAt: row.documentDeletedAt.toISOString() } : {}),
      ...(row.decidedAt ? { decidedAt: row.decidedAt.toISOString() } : {}),
      ...(decidedBy ? { decidedBy } : {}),
      ...(row.decidedBy === 'auto' || row.decidedBy === 'staff' ? { decidedByKind: row.decidedBy } : {}),
      ...(row.rejectionReason ? { rejectionReason: row.rejectionReason as AddressRejectionReason } : {}),
      ...(autoCheck ? { autoCheck } : {}),
      ...(fraud ? { fraud } : {}),
    };
  });

  const latestIdentity = identity.latest;
  const latestBackground = background.latest;
  const inReviewProof = state.addressRows.find((row) => row.status === 'in_review');
  const actions: AdminVerificationActionId[] = [];
  // Never on one's own account: another staff member decides (sweep 2026-11-20, security review).
  if (canDecideVerification(staff) && userId !== staff.id) {
    if (inReviewProof) actions.push('review_address');
    if (address.verified) actions.push('request_address');
    if (identity.capture?.status === 'submitted') actions.push('review_identity_capture');
    if (state.captureRows.some((row) => captureFileIds(row).length > 0)) actions.push('view_identity_photos');
    if (identity.nameCheck) actions.push('confirm_name');
    // A double check that didn't confirm our approval, and the same ID on another account, have their own decisions.
    if (identity.blocked === 'double_check_review') actions.push('allow_double_check_retry', 'reject_double_check');
    else if (identity.blocked === 'duplicate_id') actions.push('clear_duplicate_id', 'reject_duplicate_id');
    else if (identity.blocked) actions.push('allow_identity_retry');
    if (identity.verified) actions.push('request_identity');
    if (canAdjudicateBackground(staff)) {
      if (latestBackground?.status === 'consider' && (latestBackground.adjudication === null || latestBackground.adjudication === 'pre_adverse')) actions.push('engage_background');
      if (latestBackground?.status === 'consider' && latestBackground.adjudication === null) actions.push('pre_adverse_background');
      if (latestBackground?.status === 'consider' && latestBackground.adjudication === 'pre_adverse' && latestBackground.preAdverseAt && now.getTime() >= latestBackground.preAdverseAt.getTime() + BACKGROUND_RULES.disputeDays * DAY_MS) {
        actions.push('post_adverse_background');
      }
    }
  }
  const latestIdentityRow = state.identityRows.find((row) => row.id === latestIdentity?.id);
  const latestBackgroundRow = state.backgroundRows.find((row) => row.id === latestBackground?.id);
  const helperAgreement = state.agreements.helper_agreement;
  return {
    phone: {
      verified: state.facts.phoneVerified,
      ...(state.user?.phone ? { last4: state.user.phone.slice(-4) } : {}),
      ...(state.user?.phoneVerifiedAt ? { verifiedAt: state.user.phoneVerifiedAt.toISOString() } : {}),
    },
    ...(helperAgreement ? { agreement: { version: AGREEMENT_VERSIONS.helper_agreement, acceptedAt: helperAgreement.toISOString() } } : {}),
    identity: {
      status: identity.status,
      ...(identity.verifiedAt ? { verifiedAt: identity.verifiedAt.toISOString() } : {}),
      ...(identity.failureReason ? { failureReason: identity.failureReason } : {}),
      attempts: identity.attempts,
      ...(identity.verified && latestIdentity?.nameMatches !== null && latestIdentity?.nameMatches !== undefined ? { nameMatches: latestIdentity.nameMatches } : {}),
      ...(latestIdentity?.nameConfirmedAt ? { nameConfirmedAt: latestIdentity.nameConfirmedAt.toISOString() } : {}),
      ...(identity.blocked ? { blocked: identity.blocked } : {}),
      ...(identity.requested ? { requested: identity.requested } : {}),
      ...(state.agreements.biometric_consent ? { consentAt: state.agreements.biometric_consent.toISOString() } : {}),
      ...(latestIdentityRow?.redactionRequestedAt ? { redactionRequestedAt: latestIdentityRow.redactionRequestedAt.toISOString() } : {}),
      ...(providerOutcomeOf(latestIdentityRow?.providerOutcome) ? { providerOutcome: providerOutcomeOf(latestIdentityRow?.providerOutcome)! } : {}),
      captures,
    },
    address: {
      status: address.status as AddressVerificationStatus,
      ...(address.verifiedAt ? { verifiedAt: address.verifiedAt.toISOString() } : {}),
      proofs,
    },
    payout: { status: state.facts.payout },
    background: {
      status: background.status,
      ...(latestBackgroundRow?.completedAt ? { completedAt: latestBackgroundRow.completedAt.toISOString() } : {}),
      ...(background.validUntil ? { validUntil: background.validUntil.toISOString() } : {}),
      ...(latestBackgroundRow?.status === 'consider' && latestBackgroundRow.adjudication ? { adjudication: latestBackgroundRow.adjudication as BackgroundAdjudication } : {}),
      ...(latestBackgroundRow?.adjudication === 'pre_adverse' && latestBackgroundRow.preAdverseAt
        ? { finalDecisionFrom: new Date(latestBackgroundRow.preAdverseAt.getTime() + BACKGROUND_RULES.disputeDays * DAY_MS).toISOString() }
        : {}),
      requiredFor: state.facts.services.filter((s) => s.requiresBackgroundCheck).map((s) => s.categorySlug),
      ...(state.agreements.bg_check_disclosure ? { disclosureAt: state.agreements.bg_check_disclosure.toISOString() } : {}),
    },
    actions,
  };
}

// ---- Decisions ------------------------------------------------------------------------------------

async function audit(db: Db, staff: StaffActor, action: string, userId: string, note: string, metadata: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({ id: newId('aud'), actorId: staff.id, actorRole: roleOf(staff), action, targetType: 'user', targetId: userId, reason: note, metadata });
}

/** Approves or rejects the proof in review. The helper is told (a rejection with its reason, never the note). */
export async function decideAddress(db: Db, staff: StaffActor, input: AddressDecisionInput, now: Date): Promise<ActionResult> {
  if (!canDecideVerification(staff)) return { ok: false, code: 'not_allowed' };
  const parsed = addressDecisionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { verificationId, decision, reason, note } = parsed.data;
  const updated = await db
    .update(addressVerifications)
    .set({
      status: decision === 'approve' ? 'verified' : 'rejected',
      decidedAt: now,
      decidedByUserId: staff.id,
      decidedBy: 'staff',
      rejectionReason: decision === 'reject' ? (reason ?? 'other') : null,
      updatedAt: now,
    })
    // Never on one's own account: another staff member decides (sweep 2026-11-20, security review).
    .where(and(eq(addressVerifications.id, verificationId), eq(addressVerifications.status, 'in_review'), ne(addressVerifications.userId, staff.id)))
    .returning({ userId: addressVerifications.userId });
  const userId = updated[0]?.userId;
  if (!userId) return { ok: false, code: 'not_allowed' };
  await audit(db, staff, decision === 'approve' ? 'address.verified' : 'address.rejected', userId, note, { verificationId, ...(reason ? { reason } : {}) });
  await emitVerificationEvent(db, userId, 'address', decision === 'approve' ? 'passed' : 'action_needed');
  await syncHelperProfile(db, userId, now);
  return { ok: true, code: 'updated' };
}

/**
 * Approves or rejects the ID photos in review (our own check, stage 1). Approval verifies the ID where no ID provider
 * double-checks (2026-11-27), else opens the provider's double check; a rejection gives them the reason (never the
 * note), and they can try again within the limits (an `under_18` rejection closes helper setup until staff allow new
 * tries).
 *
 * Approval waits for the automatic reading (5.18), which also hashes the ID to find it on other accounts: with
 * `reading` it reads the photos now if the job hasn't yet (the staff actions only test accounts' photos, with the
 * stand-in: the server's own reader runs only in the job, never on a request). A duplicate found that way stops
 * the approval (`version_conflict`: staff see the other account first). `readerOn` says a reader is set up when
 * `reading` doesn't. A reading that hasn't come holds approval for `ID_READING_WAIT_MS` (`not_ready`); with no
 * reader, or after that, approval goes ahead and the audit log says it was made without the reading.
 */
/**
 * Reads one capture's photos now when it is in review without its automatic reading (staff opened it, or are
 * approving it), instead of waiting for the job: with `testAccountsOnly`, only a test account's. True when it read
 * them. A failure is logged and leaves the capture for the job.
 */
export async function readCaptureNow(db: Db, reading: IdReadingDeps | null | undefined, captureId: string, now: Date): Promise<boolean> {
  if (!reading || (!reading.reader && !reading.testAccountsOnly)) return false;
  const [capture] = await db.select({ userId: identityCaptures.userId, status: identityCaptures.status, autoCheck: identityCaptures.autoCheck }).from(identityCaptures).where(eq(identityCaptures.id, captureId)).limit(1);
  if (!capture || capture.status !== 'submitted' || capture.autoCheck !== null) return false;
  try {
    return (await readPendingIds(db, reading, now, { userIds: [capture.userId] })) > 0;
  } catch (error) {
    console.error('[verification] reading the ID for staff failed', error);
    return false;
  }
}

export async function decideIdentityCapture(
  db: Db,
  staff: StaffActor,
  input: IdentityCaptureDecisionInput,
  now: Date,
  options: { reading?: IdReadingDeps | null; readerOn?: boolean; doubleCheck?: boolean } = {},
): Promise<ActionResult> {
  if (!canDecideVerification(staff)) return { ok: false, code: 'not_allowed' };
  const parsed = identityCaptureDecisionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { captureId, decision, reason, note } = parsed.data;
  let withoutReading: 'no_reader' | 'timed_out' | undefined;
  if (decision === 'approve') {
    let [capture] = await db.select().from(identityCaptures).where(eq(identityCaptures.id, captureId)).limit(1);
    if (!capture || capture.status !== 'submitted' || capture.userId === staff.id) return { ok: false, code: 'not_allowed' };
    const reader = options.reading && (options.reading.reader || options.reading.testAccountsOnly) ? options.reading : null;
    if (capture.autoCheck === null && reader) {
      await readCaptureNow(db, reader, captureId, now);
      const flaggedBefore = capture.duplicateOfUserId;
      [capture] = await db.select().from(identityCaptures).where(eq(identityCaptures.id, captureId)).limit(1);
      if (!capture) return { ok: false, code: 'not_allowed' };
      if (capture.duplicateOfUserId && !flaggedBefore) return { ok: false, code: 'version_conflict' };
    }
    const reading = identityReadingState(capture, options.readerOn ?? reader !== null, now);
    if (reading?.state === 'waiting') return { ok: false, code: 'not_ready' };
    if (reading?.state === 'skipped') withoutReading = reading.why;
  }
  // The same path as the automatic decision (capture-decision.ts): without an ID provider's double check, our team's
  // approval verifies the ID.
  const decided = await applyCaptureDecision(db, { captureId, decision, ...(reason ? { reason } : {}), note, decider: { kind: 'staff', userId: staff.id } }, now, options.doubleCheck === undefined ? {} : { doubleCheck: options.doubleCheck });
  if (!decided) return { ok: false, code: 'not_allowed' };
  await audit(db, staff, decision === 'approve' ? 'identity_capture.approved' : 'identity_capture.rejected', decided.userId, note, {
    captureId,
    ...(decision === 'reject' && reason ? { reason } : {}),
    ...(withoutReading ? { withoutReading, remark: APPROVED_WITHOUT_READING } : {}),
    ...(decided.verified ? { verified: 'own' } : {}),
  });
  return { ok: true, code: 'updated' };
}

/** The other staff actions on a person's verification (src/contracts/admin-verification.ts). */
/**
 * `providers`: the ID provider where the double check is set up, and the background-check provider on its own (Checkr
 * can be set up without the others, 2026-11-27).
 */
export async function verificationAction(
  db: Db,
  providers: { identity?: VerificationProviders['identity'] | null; background?: VerificationProviders['background'] | null } | null,
  staff: StaffActor,
  input: VerificationActionInput,
  now: Date,
): Promise<ActionResult> {
  if (!canDecideVerification(staff)) return { ok: false, code: 'not_allowed' };
  const parsed = verificationActionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { userId, action, note } = parsed.data;
  if (BACKGROUND_ACTIONS.includes(action) && !canAdjudicateBackground(staff)) return { ok: false, code: 'not_allowed' };
  const view = await getPersonVerification(db, staff, userId, now);
  if (!view.actions.includes(action)) return { ok: false, code: 'not_allowed' };
  const state = await loadOnboardingState(db, userId, now);
  const latestIdentity = state.identity.latest as IdentityRow | undefined;
  const latestBackground = state.background.latest;
  /** What the audit row keeps besides the note (the double check's two results). */
  let metadata: Record<string, unknown> = {};

  switch (action) {
    case 'request_address':
      await db.insert(addressVerifications).values({ id: newId('adr'), userId, status: 'requested', requestedByUserId: staff.id, createdAt: now, updatedAt: now });
      await emitVerificationEvent(db, userId, 'address', 'action_needed');
      break;
    case 'confirm_name':
      await db.update(identityVerifications).set({ nameConfirmedAt: now, nameConfirmedByUserId: staff.id, updatedAt: now }).where(eq(identityVerifications.id, latestIdentity!.id));
      await emitVerificationEvent(db, userId, state.profile ? 'identity' : 'poster_identity', 'passed');
      break;
    case 'allow_identity_retry':
    case 'request_identity':
      // Photos still waiting for review belong to the check being replaced (their files are deleted at once).
      await db
        .update(identityCaptures)
        .set({ status: 'canceled', decidedAt: now, decidedByUserId: staff.id, updatedAt: now })
        .where(and(eq(identityCaptures.userId, userId), eq(identityCaptures.status, 'submitted')));
      await db.insert(identityVerifications).values({
        id: newId('idv'),
        userId,
        provider: providers?.identity?.provider ?? 'dev',
        providerSessionId: null,
        status: 'not_started',
        requestedReason: action === 'request_identity' ? 'staff_request' : 'allow_retry',
        requestedByUserId: staff.id,
        createdAt: now,
        updatedAt: now,
      });
      // A client (no helper profile) is sent to their own ID page.
      await emitVerificationEvent(db, userId, state.profile ? 'identity' : 'poster_identity', 'action_needed');
      break;
    case 'allow_double_check_retry': {
      // Staff looked at both and let the helper try the double check again (our approval stands).
      const failed = state.identity.doubleCheck!;
      await db.update(identityVerifications).set({ reviewOutcome: 'retry_allowed', reviewedAt: now, reviewedByUserId: staff.id, updatedAt: now }).where(eq(identityVerifications.id, failed.id));
      metadata = doubleCheckAudit(state, failed.id);
      await emitVerificationEvent(db, userId, 'identity', 'action_needed');
      break;
    }
    case 'reject_double_check': {
      // Staff agree with the provider: the approved photos are turned down, and the helper starts over.
      const failed = state.identity.doubleCheck!;
      const approved = state.captureRows.filter((row) => row.status === 'approved').at(-1)!;
      await db.update(identityVerifications).set({ reviewOutcome: 'rejected', reviewedAt: now, reviewedByUserId: staff.id, updatedAt: now }).where(eq(identityVerifications.id, failed.id));
      await db
        .update(identityCaptures)
        .set({ status: 'rejected', rejectionReason: 'double_check_failed', decidedAt: now, decidedByUserId: staff.id, staffNote: note, updatedAt: now })
        .where(and(eq(identityCaptures.id, approved.id), eq(identityCaptures.status, 'approved')));
      metadata = doubleCheckAudit(state, failed.id);
      await emitVerificationEvent(db, userId, 'identity', 'action_needed');
      break;
    }
    case 'clear_duplicate_id': {
      // Staff looked at both accounts and found it in order: the double check can go ahead.
      const flagged = state.identity.duplicate!;
      await db.update(identityCaptures).set({ duplicateClearedAt: now, duplicateClearedByUserId: staff.id, updatedAt: now }).where(eq(identityCaptures.id, flagged.id));
      metadata = { captureId: flagged.id, otherUserId: flagged.duplicateOfUserId ?? null };
      await emitVerificationEvent(db, userId, 'identity', 'action_needed');
      break;
    }
    case 'reject_duplicate_id': {
      // Staff turn these photos down: the ID belongs to another account. The helper sees why.
      const flagged = state.identity.duplicate!;
      await db
        .update(identityCaptures)
        .set({ status: 'rejected', rejectionReason: 'duplicate_id', decidedAt: now, decidedByUserId: staff.id, staffNote: note, updatedAt: now })
        .where(and(eq(identityCaptures.id, flagged.id), inArray(identityCaptures.status, ['submitted', 'approved'])));
      metadata = { captureId: flagged.id, otherUserId: flagged.duplicateOfUserId ?? null };
      await emitVerificationEvent(db, userId, 'identity', 'action_needed');
      break;
    }
    case 'engage_background': {
      // After a pre-adverse notice, the provider's scheduled final notice must not go.
      const [adverse] = await db.select({ adjudication: backgroundChecks.adjudication, ref: backgroundChecks.adverseActionRef }).from(backgroundChecks).where(eq(backgroundChecks.id, latestBackground!.id)).limit(1);
      if (adverse?.adjudication === 'pre_adverse' && adverse.ref && providers?.background?.cancelAdverseAction) await providers.background.cancelAdverseAction(adverse.ref);
      await db
        .update(backgroundChecks)
        .set({
          adjudication: 'engaged',
          adjudicatedAt: now,
          adjudicatedByUserId: staff.id,
          expiresAt: new Date((latestBackground!.completedAt ?? now).getTime() + BACKGROUND_RULES.validDays * DAY_MS),
          updatedAt: now,
        })
        .where(eq(backgroundChecks.id, latestBackground!.id));
      await emitVerificationEvent(db, userId, 'background', 'passed');
      break;
    }
    case 'pre_adverse_background':
      if (!providers?.background || !latestBackground!.providerRef) return { ok: false, code: 'not_allowed' };
      const adverseActionRef = await providers.background.preAdverseAction(latestBackground!.providerRef);
      await db
        .update(backgroundChecks)
        .set({ adjudication: 'pre_adverse', preAdverseAt: now, adverseActionRef: adverseActionRef ?? null, adjudicatedAt: now, adjudicatedByUserId: staff.id, updatedAt: now })
        .where(eq(backgroundChecks.id, latestBackground!.id));
      await emitVerificationEvent(db, userId, 'background', 'action_needed');
      break;
    case 'post_adverse_background':
      if (!providers?.background || !latestBackground!.providerRef) return { ok: false, code: 'not_allowed' };
      await providers.background.postAdverseAction(latestBackground!.providerRef);
      await db
        .update(backgroundChecks)
        .set({ adjudication: 'post_adverse', adjudicatedAt: now, adjudicatedByUserId: staff.id, updatedAt: now })
        .where(eq(backgroundChecks.id, latestBackground!.id));
      break;
  }
  await audit(db, staff, `verification.${action}`, userId, note, metadata);
  await syncHelperProfile(db, userId, now);
  return { ok: true, code: 'updated' };
}

/** Both results of a double check staff decided: our approval and the provider's word (no personal data). */
function doubleCheckAudit(state: Awaited<ReturnType<typeof loadOnboardingState>>, sessionId: string): Record<string, unknown> {
  const approved = state.captureRows.filter((row) => row.status === 'approved').at(-1);
  const session = state.identityRows.find((row) => row.id === sessionId);
  return {
    identityVerificationId: sessionId,
    providerOutcome: session?.providerOutcome ?? null,
    ...(approved ? { captureId: approved.id, approvedAt: (approved.decidedAt ?? approved.createdAt).toISOString() } : {}),
  };
}

// ---- Opening a proof of address -------------------------------------------------------------------

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`tnm.address-proof.v1.${payload}`).digest().subarray(0, 18).toString('base64url');
}

/** A link token for one document, one staff member and a few minutes. */
export function documentToken(input: { fileId: string; staffUserId: string; expiresAt: Date }, secret: string): string {
  const payload = Buffer.from(JSON.stringify([input.fileId, input.staffUserId, input.expiresAt.getTime()])).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function readDocumentToken(token: string, secret: string, now: Date): { fileId: string; staffUserId: string } | null {
  if (token.length > 400) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const [fileId, staffUserId, expires] = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as [unknown, unknown, unknown];
    if (typeof fileId !== 'string' || typeof staffUserId !== 'string' || typeof expires !== 'number' || expires <= now.getTime()) return null;
    return { fileId, staffUserId };
  } catch {
    return null;
  }
}

/** The address as entered and a 5-minute document link, after a reason (logged). */
export async function revealAddressProof(
  db: Db,
  deps: { cipher: FieldCipher; secret: string },
  staff: StaffActor,
  input: AddressProofRevealInput,
  now: Date,
): Promise<AddressProofRevealResult> {
  if (!canDecideVerification(staff)) return { ok: false, code: 'not_allowed' };
  const parsed = addressProofRevealInputSchema.safeParse(input);
  if (!parsed.success) {
    const result = validationFailed(parsed.error);
    return { ok: false, code: 'validation_failed', ...(result.ok === false && result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }
  const [row] = await db.select().from(addressVerifications).where(eq(addressVerifications.id, parsed.data.verificationId)).limit(1);
  if (!row || !row.addressCiphertext) return { ok: false, code: 'not_found' };
  // Never their own documents (security review): staff verification is somebody else's job.
  if (row.userId === staff.id) return { ok: false, code: 'not_allowed' };
  const [file] = row.documentFileId ? await db.select().from(files).where(eq(files.id, row.documentFileId)).limit(1) : [];
  const expiresAt = new Date(now.getTime() + DOCUMENT_LINK_MINUTES * 60_000);
  await audit(db, staff, 'address_proof.viewed', row.userId, parsed.data.reason, { verificationId: row.id, document: Boolean(file) });
  return {
    ok: true,
    address: addressLabel(row.addressCiphertext, deps.cipher) ?? '',
    ...(file
      ? { document: { url: `/api/verification-documents/${documentToken({ fileId: file.id, staffUserId: staff.id, expiresAt }, deps.secret)}`, kind: file.contentType === 'application/pdf' ? ('pdf' as const) : ('image' as const) } }
      : {}),
    expiresAt: expiresAt.toISOString(),
  };
}

/** A 5-minute link to each ID photo still stored (our own check), and the selfie's prompt, after a reason (logged). */
export async function revealIdentityCapture(db: Db, deps: { secret: string }, staff: StaffActor, input: IdentityCaptureRevealInput, now: Date): Promise<IdentityCaptureRevealResult> {
  if (!canDecideVerification(staff)) return { ok: false, code: 'not_allowed' };
  const parsed = identityCaptureRevealInputSchema.safeParse(input);
  if (!parsed.success) {
    const result = validationFailed(parsed.error);
    return { ok: false, code: 'validation_failed', ...(result.ok === false && result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }
  const [row] = await db.select().from(identityCaptures).where(eq(identityCaptures.id, parsed.data.captureId)).limit(1);
  if (!row) return { ok: false, code: 'not_found' };
  if (row.userId === staff.id) return { ok: false, code: 'not_allowed' };
  const expiresAt = new Date(now.getTime() + DOCUMENT_LINK_MINUTES * 60_000);
  const photos = photosOf(row).map((kind) => ({ kind, url: `/api/verification-documents/${documentToken({ fileId: row[PHOTO_COLUMN[kind]]!, staffUserId: staff.id, expiresAt }, deps.secret)}` }));
  await audit(db, staff, 'identity_capture.viewed', row.userId, parsed.data.reason, { captureId: row.id, photos: photos.length });
  return { ok: true, photos, prompt: row.promptKey as LivenessPrompt, expiresAt: expiresAt.toISOString() };
}

/**
 * The ID's details for staff before they open the photos (owner, 2026-11-21): the barcode on the back of a license or
 * state ID is read again on this server (in the readers' own process, never stored or logged) and compared with the
 * account and the home address on file. Why is logged, as for the photos. Test accounts get details made up from their
 * account, so flows and tests can show the panel.
 */
export async function revealIdentityDetails(
  db: Db,
  deps: {
    storage: FileStorage;
    files: ByteCipher;
    addressCipher: FieldCipher | null;
    readBarcode: (back: { bytes: Buffer; contentType: string }) => Promise<IdBarcodeDetails | null>;
  },
  staff: StaffActor,
  input: IdentityDetailsRevealInput,
  now: Date,
): Promise<IdentityDetailsRevealResult> {
  if (!canDecideVerification(staff)) return { ok: false, code: 'not_allowed' };
  const parsed = identityDetailsRevealInputSchema.safeParse(input);
  if (!parsed.success) {
    const result = validationFailed(parsed.error);
    return { ok: false, code: 'validation_failed', ...(result.ok === false && result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }
  const [row] = await db
    .select({ capture: identityCaptures, email: users.email, firstName: users.firstName, lastName: users.lastName, homeMarketId: users.homeMarketId })
    .from(identityCaptures)
    .innerJoin(users, eq(users.id, identityCaptures.userId))
    .where(eq(identityCaptures.id, parsed.data.captureId))
    .limit(1);
  if (!row) return { ok: false, code: 'not_found' };
  const { capture } = row;
  // Staff never open their own verification documents (as with the photos and the proofs of address).
  if (capture.userId === staff.id) return { ok: false, code: 'not_allowed' };
  const home = await homeAddressOf(db, deps.addressCipher, capture.userId);
  const timeZone = (await marketTimeZones(db, [row.homeMarketId])).get(row.homeMarketId)!;
  // What the automatic reading stored (2026-11-27), for any kind of ID; older captures read the barcode again below.
  const stored = storedDetails(capture.detailsCiphertext, deps.addressCipher);
  if (stored) {
    const { age, matches } = compareIdDetails(stored, row, home, now, timeZone);
    await audit(db, staff, 'identity_capture.details_viewed', capture.userId, parsed.data.reason, { captureId: capture.id, stored: true });
    return { ok: true, details: { ...captureDetailsView(stored, age, matches), stored: true } };
  }
  if (capture.documentType === 'passport') return { ok: false, code: 'no_barcode' };
  if (!capture.backFileId) return { ok: false, code: capture.filesDeletedAt ? 'not_found' : 'no_barcode' };
  let details: IdBarcodeDetails | null;
  if (isReservedEmailAddress(row.email)) {
    details = standInDetails(row, home, now);
  } else {
    const back = await openIdPhoto(db, deps, capture.backFileId);
    if (!back) return { ok: false, code: 'not_found' };
    try {
      details = await deps.readBarcode(back);
    } catch (error) {
      if (error instanceof AiUnavailableError) return { ok: false, code: 'unavailable' };
      throw error;
    }
  }
  if (!details) return { ok: false, code: 'no_barcode' };
  const { age, matches } = compareIdDetails(details, row, home, now, timeZone);
  // Who, why and which capture; never what it said.
  await audit(db, staff, 'identity_capture.details_viewed', capture.userId, parsed.data.reason, { captureId: capture.id });
  return {
    ok: true,
    details: {
      documentType: details.documentType,
      issuingState: details.issuingState,
      name: { given: details.givenNames, surname: details.surname, ...(details.middleNames ? { middle: details.middleNames } : {}), ...(details.suffix ? { suffix: details.suffix } : {}) },
      dateOfBirth: details.dateOfBirth,
      age: age ?? 0,
      expiryDate: details.expiryDate,
      ...(details.issueDate ? { issueDate: details.issueDate } : {}),
      documentNumber: details.documentNumber,
      ...(details.address ? { address: details.address } : {}),
      ...(details.sex ? { sex: details.sex } : {}),
      ...(details.height ? { height: details.height } : {}),
      ...(details.eyeColor ? { eyeColor: details.eyeColor } : {}),
      matches,
    },
  };
}

/** The stored details (IdDocumentDetails, encrypted), when they hold a name, birth date, expiry and number to show. */
function storedDetails(ciphertext: string | null, cipher: FieldCipher | null): (IdDocumentDetails & { givenNames: string; surname: string; dateOfBirth: string; expiryDate: string; documentNumber: string }) | null {
  if (!ciphertext || !cipher) return null;
  try {
    const details = JSON.parse(cipher.decrypt(ciphertext)) as IdDocumentDetails;
    if (!details.givenNames || !details.surname || !details.dateOfBirth || !details.expiryDate || !details.documentNumber) return null;
    return details as IdDocumentDetails & { givenNames: string; surname: string; dateOfBirth: string; expiryDate: string; documentNumber: string };
  } catch {
    return null;
  }
}

/** The staff view of stored details. */
function captureDetailsView(
  details: IdDocumentDetails & { givenNames: string; surname: string; dateOfBirth: string; expiryDate: string; documentNumber: string },
  age: number | undefined,
  matches: IdentityCaptureDetails['matches'],
): IdentityCaptureDetails {
  const extras = {
    licenseClass: details.licenseClass,
    restrictions: details.restrictions,
    endorsements: details.endorsements,
    documentDiscriminator: details.documentDiscriminator,
    inventoryControl: details.inventoryControl,
    aamvaVersion: details.aamvaVersion,
    jurisdictionVersion: details.jurisdictionVersion,
  };
  return {
    documentType: details.documentType,
    source: details.source,
    issuingState: details.issuingState ?? '',
    name: { given: details.givenNames, surname: details.surname, ...(details.middleNames ? { middle: details.middleNames } : {}), ...(details.suffix ? { suffix: details.suffix } : {}) },
    dateOfBirth: details.dateOfBirth,
    age: age ?? 0,
    expiryDate: details.expiryDate,
    ...(details.issueDate ? { issueDate: details.issueDate } : {}),
    documentNumber: details.documentNumber,
    ...(details.address ? { address: details.address } : {}),
    ...(details.sex ? { sex: details.sex } : {}),
    ...(details.height ? { height: details.height } : {}),
    ...(details.eyeColor ? { eyeColor: details.eyeColor } : {}),
    ...Object.fromEntries(Object.entries(extras).filter(([, value]) => value !== undefined)),
    matches,
  };
}

/** A test account's made-up license: its account's name, an adult's birth date, a valid card and its home address. */
function standInDetails(account: { firstName: string; lastName: string }, home: PostalAddress | null, now: Date): IdBarcodeDetails {
  const year = now.getUTCFullYear();
  return {
    documentType: 'drivers_license',
    issuingState: home?.state ?? 'TX',
    givenNames: account.firstName,
    surname: account.lastName,
    dateOfBirth: `${year - 30}-01-15`,
    expiryDate: `${year + 4}-01-15`,
    documentNumber: 'TEST0000',
    ...(home ? { address: home } : {}),
  };
}

/**
 * For the document route: the file a valid token opens, for the staff member it was made for, while it's
 * still part of its proof or capture. ID photos are decrypted here (`fileCipher`), and only here.
 */
export async function documentForToken(db: Db, storage: FileStorage, token: string, viewer: StaffActor | null, secret: string, now: Date, fileCipher: ByteCipher | null = null) {
  const read = readDocumentToken(token, secret, now);
  if (!read || !viewer || viewer.id !== read.staffUserId || !canDecideVerification(viewer)) return null;
  const [file] = await db.select().from(files).where(and(eq(files.id, read.fileId), inArray(files.kind, ['address_proof', ...IDENTITY_FILE_KINDS]))).limit(1);
  // A link is only ever made for someone else's documents; a staff member's own never open, whatever the link says.
  if (!file || file.ownerUserId === viewer.id) return null;
  if (file.kind === 'address_proof') {
    const [still] = await db.select({ id: addressVerifications.id }).from(addressVerifications).where(and(eq(addressVerifications.documentFileId, file.id), isNotNull(addressVerifications.documentFileId))).limit(1);
    if (!still) return null;
    const body = await storage.get(file.storageKey);
    return body ? { body, contentType: file.contentType } : null;
  }
  const [still] = await db
    .select({ id: identityCaptures.id })
    .from(identityCaptures)
    .where(or(eq(identityCaptures.frontFileId, file.id), eq(identityCaptures.backFileId, file.id), eq(identityCaptures.selfieFileId, file.id)))
    .limit(1);
  if (!still || !fileCipher) return null;
  const sealed = await storage.get(file.storageKey);
  if (!sealed) return null;
  try {
    return { body: fileCipher.decrypt(sealed), contentType: file.contentType };
  } catch {
    return null;
  }
}

/** Newest first: a person's decided proofs, for the timers. */
export async function decidedProofsWithDocuments(db: Db) {
  return db
    .select()
    .from(addressVerifications)
    .where(isNotNull(addressVerifications.documentFileId))
    .orderBy(desc(addressVerifications.createdAt));
}
