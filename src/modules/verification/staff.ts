import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import type {
  ActionResult,
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
  IdentityAutoCheck,
  IdentityCaptureDecisionInput,
  IdentityCapturePhoto,
  IdentityCaptureRejectionReason,
  IdentityCaptureRevealInput,
  IdentityCaptureRevealResult,
  IdentityCaptureStatus,
  IdentityDocumentType,
  LivenessPrompt,
  StaffRole,
  VerificationActionInput,
} from '@/contracts';
import {
  ADMIN_VERIFICATION_QUEUES,
  addressDecisionInputSchema,
  addressProofRevealInputSchema,
  IDENTITY_CAPTURE_PHOTOS,
  identityCaptureDecisionInputSchema,
  identityCaptureRevealInputSchema,
  verificationActionInputSchema,
} from '@/contracts';
import type { FileStorage } from '@/integrations/storage';
import { AGREEMENT_VERSIONS } from '@/modules/accounts/agreements';
import { users } from '@/modules/accounts/schema';
import { areas } from '@/modules/markets/schema';
import { personSummaryOf, type StaffActor } from '@/modules/support/staff';
import { files } from '@/modules/tasks/schema';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { ByteCipher, FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
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
const roleOf = (staff: StaffActor) => DECIDERS.find((role) => staff.roles.includes(role)) ?? staff.roles[0] ?? 'support_agent';

function autoCheckView(stored: StoredAddressAutoCheck | null): AddressAutoCheck | undefined {
  if (!stored) return undefined;
  return {
    readable: stored.readable,
    ...(stored.nameMatches !== undefined ? { nameMatches: stored.nameMatches } : {}),
    ...(stored.addressMatches !== undefined ? { addressMatches: stored.addressMatches } : {}),
    ...(stored.recent !== undefined ? { recent: stored.recent } : {}),
    ...(stored.documentType ? { documentType: stored.documentType as AddressDocumentType | 'other' } : {}),
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
  };
}

const PHOTO_COLUMN: Record<IdentityCapturePhoto, 'frontFileId' | 'backFileId' | 'selfieFileId'> = { front: 'frontFileId', back: 'backFileId', selfie: 'selfieFileId' };
const photosOf = (row: Record<'frontFileId' | 'backFileId' | 'selfieFileId', string | null>) => IDENTITY_CAPTURE_PHOTOS.filter((kind) => row[PHOTO_COLUMN[kind]] !== null);

async function areaNames(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const rows = await db.select({ id: areas.id, name: areas.name }).from(areas).where(inArray(areas.id, wanted));
  return new Map(rows.map((row) => [row.id, row.name]));
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
  const names = await areaNames(db, rows.map((row) => row.proof.areaId));
  return rows.map(({ proof, user }) => {
    const submittedAt = proof.submittedAt ?? proof.createdAt;
    const autoCheck = autoCheckView(proof.autoCheck);
    const areaName = proof.areaId ? names.get(proof.areaId) : undefined;
    return {
      id: proof.id,
      person: personSummaryOf(user),
      submittedAt: submittedAt.toISOString(),
      documentType: (proof.documentType ?? 'utility_bill') as AddressDocumentType,
      ...(areaName ? { areaName } : {}),
      ...(autoCheck ? { autoCheck } : {}),
      overdue: now.getTime() - submittedAt.getTime() > ADDRESS_RULES.responseTargetHours * HOUR_MS,
    };
  });
}

async function identityQueue(db: Db, now: Date): Promise<AdminIdentityReviewRow[]> {
  // People who could need staff: photos waiting for review, a verified ID whose name didn't match, or failed tries.
  const [fromChecks, fromCaptures] = await Promise.all([
    db
      .selectDistinct({ userId: identityVerifications.userId })
      .from(identityVerifications)
      .where(or(and(eq(identityVerifications.status, 'verified'), eq(identityVerifications.nameMatches, false)), inArray(identityVerifications.status, ['requires_input', 'canceled']))),
    db.selectDistinct({ userId: identityCaptures.userId }).from(identityCaptures).where(inArray(identityCaptures.status, ['submitted', 'rejected', 'canceled'])),
  ]);
  const ids = [...new Set([...fromChecks, ...fromCaptures].map((row) => row.userId))];
  if (ids.length === 0) return [];
  const [rows, captures, people] = await Promise.all([
    db.select().from(identityVerifications).where(inArray(identityVerifications.userId, ids)),
    db.select().from(identityCaptures).where(inArray(identityCaptures.userId, ids)),
    db.select().from(users).where(inArray(users.id, ids)),
  ]);
  const out: AdminIdentityReviewRow[] = [];
  for (const person of people) {
    const theirs = captures.filter((row) => row.userId === person.id);
    const standing = identityStanding(rows.filter((row) => row.userId === person.id), now, theirs);
    const waiting = standing.capture?.status === 'submitted' ? theirs.find((row) => row.id === standing.capture!.id) : undefined;
    if (waiting) {
      const autoCheck = identityAutoCheckView(waiting.autoCheck);
      out.push({
        id: waiting.id,
        person: personSummaryOf(person),
        kind: 'capture',
        at: waiting.submittedAt.toISOString(),
        attempts: standing.attempts,
        capture: { documentType: waiting.documentType as IdentityDocumentType, ...(autoCheck ? { autoCheck } : {}), overdue: now.getTime() - waiting.submittedAt.getTime() > IDENTITY_CAPTURE_RULES.responseTargetHours * HOUR_MS },
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

export async function getAdminVerificationsPage(db: Db, staff: StaffActor, queue: string | undefined, now: Date): Promise<AdminVerificationsPageData> {
  const [address, identity, background] = await Promise.all([addressQueue(db, now), identityQueue(db, now), backgroundQueue(db, now)]);
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

export async function getPersonVerification(db: Db, staff: StaffActor, userId: string, now: Date): Promise<AdminPersonVerification> {
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
  const captures: AdminIdentityCaptureView[] = captureRows.map((row) => {
    const autoCheck = identityAutoCheckView(row.autoCheck);
    const decidedBy = deciders.find((person) => person.id === row.decidedByUserId)?.name;
    return {
      id: row.id,
      status: row.status as IdentityCaptureStatus,
      documentType: row.documentType as IdentityDocumentType,
      submittedAt: row.submittedAt.toISOString(),
      prompt: row.promptKey as LivenessPrompt,
      ...(autoCheck ? { autoCheck } : {}),
      photos: photosOf(row),
      ...(row.filesDeletedAt ? { photosDeletedAt: row.filesDeletedAt.toISOString() } : {}),
      ...(row.decidedAt ? { decidedAt: row.decidedAt.toISOString() } : {}),
      ...(decidedBy ? { decidedBy } : {}),
      ...(row.rejectionReason ? { rejectionReason: row.rejectionReason as IdentityCaptureRejectionReason } : {}),
      ...(row.staffNote ? { note: row.staffNote } : {}),
    };
  });
  const proofs: AdminAddressProofView[] = proofRows.map((row) => {
    const autoCheck = autoCheckView(row.autoCheck);
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
      ...(row.rejectionReason ? { rejectionReason: row.rejectionReason as AddressRejectionReason } : {}),
      ...(autoCheck ? { autoCheck } : {}),
    };
  });

  const latestIdentity = identity.latest;
  const latestBackground = background.latest;
  const inReviewProof = state.addressRows.find((row) => row.status === 'in_review');
  const actions: AdminVerificationActionId[] = [];
  if (canDecideVerification(staff)) {
    if (inReviewProof) actions.push('review_address');
    if (address.verified) actions.push('request_address');
    if (identity.capture?.status === 'submitted') actions.push('review_identity_capture');
    if (state.captureRows.some((row) => captureFileIds(row).length > 0)) actions.push('view_identity_photos');
    if (identity.nameCheck) actions.push('confirm_name');
    if (identity.blocked) actions.push('allow_identity_retry');
    if (identity.verified) actions.push('request_identity');
    if (latestBackground?.status === 'consider' && (latestBackground.adjudication === null || latestBackground.adjudication === 'pre_adverse')) actions.push('engage_background');
    if (latestBackground?.status === 'consider' && latestBackground.adjudication === null) actions.push('pre_adverse_background');
    if (latestBackground?.status === 'consider' && latestBackground.adjudication === 'pre_adverse' && latestBackground.preAdverseAt && now.getTime() >= latestBackground.preAdverseAt.getTime() + BACKGROUND_RULES.disputeDays * DAY_MS) {
      actions.push('post_adverse_background');
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
      rejectionReason: decision === 'reject' ? (reason ?? 'other') : null,
      updatedAt: now,
    })
    .where(and(eq(addressVerifications.id, verificationId), eq(addressVerifications.status, 'in_review')))
    .returning({ userId: addressVerifications.userId });
  const userId = updated[0]?.userId;
  if (!userId) return { ok: false, code: 'not_allowed' };
  await audit(db, staff, decision === 'approve' ? 'address.verified' : 'address.rejected', userId, note, { verificationId, ...(reason ? { reason } : {}) });
  await emitVerificationEvent(db, userId, 'address', decision === 'approve' ? 'passed' : 'action_needed');
  await syncHelperProfile(db, userId, now);
  return { ok: true, code: 'updated' };
}

/**
 * Approves or rejects the ID photos in review (our own check, stage 1). Approval opens the provider's
 * double check for the helper; a rejection gives them the reason (never the note), and they can try
 * again within the limits (an `under_18` rejection closes helper setup until staff allow new tries).
 */
export async function decideIdentityCapture(db: Db, staff: StaffActor, input: IdentityCaptureDecisionInput, now: Date): Promise<ActionResult> {
  if (!canDecideVerification(staff)) return { ok: false, code: 'not_allowed' };
  const parsed = identityCaptureDecisionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { captureId, decision, reason, note } = parsed.data;
  const updated = await db
    .update(identityCaptures)
    .set({
      status: decision === 'approve' ? 'approved' : 'rejected',
      rejectionReason: decision === 'reject' ? (reason ?? 'other') : null,
      decidedAt: now,
      decidedByUserId: staff.id,
      staffNote: note,
      updatedAt: now,
    })
    .where(and(eq(identityCaptures.id, captureId), eq(identityCaptures.status, 'submitted')))
    .returning({ userId: identityCaptures.userId });
  const userId = updated[0]?.userId;
  if (!userId) return { ok: false, code: 'not_allowed' };
  await audit(db, staff, decision === 'approve' ? 'identity_capture.approved' : 'identity_capture.rejected', userId, note, { captureId, ...(decision === 'reject' && reason ? { reason } : {}) });
  // Either way the helper has something to do: the double check, or new photos.
  await emitVerificationEvent(db, userId, 'identity', 'action_needed');
  await syncHelperProfile(db, userId, now);
  return { ok: true, code: 'updated' };
}

/** The other staff actions on a person's verification (src/contracts/admin-verification.ts). */
export async function verificationAction(db: Db, providers: VerificationProviders | null, staff: StaffActor, input: VerificationActionInput, now: Date): Promise<ActionResult> {
  if (!canDecideVerification(staff)) return { ok: false, code: 'not_allowed' };
  const parsed = verificationActionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { userId, action, note } = parsed.data;
  const view = await getPersonVerification(db, staff, userId, now);
  if (!view.actions.includes(action)) return { ok: false, code: 'not_allowed' };
  const state = await loadOnboardingState(db, userId, now);
  const latestIdentity = state.identity.latest as IdentityRow | undefined;
  const latestBackground = state.background.latest;

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
        provider: providers?.identity.provider ?? 'dev',
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
    case 'engage_background': {
      // After a pre-adverse notice, the provider's scheduled final notice must not go.
      const [adverse] = await db.select({ adjudication: backgroundChecks.adjudication, ref: backgroundChecks.adverseActionRef }).from(backgroundChecks).where(eq(backgroundChecks.id, latestBackground!.id)).limit(1);
      if (adverse?.adjudication === 'pre_adverse' && adverse.ref && providers?.background.cancelAdverseAction) await providers.background.cancelAdverseAction(adverse.ref);
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
      if (!providers || !latestBackground!.providerRef) return { ok: false, code: 'not_allowed' };
      const adverseActionRef = await providers.background.preAdverseAction(latestBackground!.providerRef);
      await db
        .update(backgroundChecks)
        .set({ adjudication: 'pre_adverse', preAdverseAt: now, adverseActionRef: adverseActionRef ?? null, adjudicatedAt: now, adjudicatedByUserId: staff.id, updatedAt: now })
        .where(eq(backgroundChecks.id, latestBackground!.id));
      await emitVerificationEvent(db, userId, 'background', 'action_needed');
      break;
    case 'post_adverse_background':
      if (!providers || !latestBackground!.providerRef) return { ok: false, code: 'not_allowed' };
      await providers.background.postAdverseAction(latestBackground!.providerRef);
      await db
        .update(backgroundChecks)
        .set({ adjudication: 'post_adverse', adjudicatedAt: now, adjudicatedByUserId: staff.id, updatedAt: now })
        .where(eq(backgroundChecks.id, latestBackground!.id));
      break;
  }
  await audit(db, staff, `verification.${action}`, userId, note);
  await syncHelperProfile(db, userId, now);
  return { ok: true, code: 'updated' };
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
  const expiresAt = new Date(now.getTime() + DOCUMENT_LINK_MINUTES * 60_000);
  const photos = photosOf(row).map((kind) => ({ kind, url: `/api/verification-documents/${documentToken({ fileId: row[PHOTO_COLUMN[kind]]!, staffUserId: staff.id, expiresAt }, deps.secret)}` }));
  await audit(db, staff, 'identity_capture.viewed', row.userId, parsed.data.reason, { captureId: row.id, photos: photos.length });
  return { ok: true, photos, prompt: row.promptKey as LivenessPrompt, expiresAt: expiresAt.toISOString() };
}

/**
 * For the document route: the file a valid token opens, for the staff member it was made for, while it's
 * still part of its proof or capture. ID photos are decrypted here (`fileCipher`), and only here.
 */
export async function documentForToken(db: Db, storage: FileStorage, token: string, viewer: StaffActor | null, secret: string, now: Date, fileCipher: ByteCipher | null = null) {
  const read = readDocumentToken(token, secret, now);
  if (!read || !viewer || viewer.id !== read.staffUserId || !canDecideVerification(viewer)) return null;
  const [file] = await db.select().from(files).where(and(eq(files.id, read.fileId), inArray(files.kind, ['address_proof', ...IDENTITY_FILE_KINDS]))).limit(1);
  if (!file) return null;
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
