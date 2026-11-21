import { and, asc, eq, inArray } from 'drizzle-orm';
import { MARKET_TIME_ZONE } from '@/contracts';
import type {
  AddressRejectionReason,
  CategorySlug,
  IdentityCaptureRejectionReason,
  IdentityCaptureSummary,
  IdentityDocumentType,
  PayoutAccountStatus,
  VerificationSummary,
} from '@/contracts';
import { currentAgreements } from '@/modules/accounts/agreements';
import { loadPhoneCheck } from '@/modules/accounts/phone-check';
import { users } from '@/modules/accounts/schema';
import { awaitingCity, OPEN_MARKET_STATUSES } from '@/modules/markets/coverage';
import { categories, markets } from '@/modules/markets/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { marketTimeZone } from '@/modules/markets/time-zone';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { computeOnboarding, type OnboardingFacts } from './progress';
import { addressVerifications, backgroundChecks, identityCaptures, identityVerifications, payoutAccounts } from './schema';
import { addressStanding, backgroundStanding, identityStanding, livenessPromptFor } from './standing';

/**
 * A helper's onboarding state from every track (blueprint 06 §1), and the profile fields cached from it
 * (status and badges). Functions take the database so tests can use their own.
 */

export type VerificationTrack = 'phone' | 'identity' | 'address' | 'payout' | 'background' | 'helper' | 'poster_identity';
/** `city_open` (track `helper`): a helper who waited outside the cities we're open in can choose a neighborhood now. */
/** `recheck`: a step checked again by our team, nothing for the person to do (the home address, when the ID's legal name differs). */
export type VerificationOutcome = 'passed' | 'action_needed' | 'expiring' | 'expired' | 'ready' | 'city_open' | 'recheck';

/** `verification.updated` in the outbox: the dispatcher turns it into the person's notification. */
export async function emitVerificationEvent(
  db: Pick<Db, 'insert'>,
  userId: string,
  track: VerificationTrack,
  outcome: VerificationOutcome,
  extra: { days?: number; city?: string } = {},
): Promise<void> {
  await db.insert(outboxEvents).values({
    id: newId('evt'),
    type: 'verification.updated',
    aggregateType: 'user',
    aggregateId: userId,
    payload: { userId, track, outcome, ...extra },
  });
}

export async function loadOnboardingState(db: Db, userId: string, now: Date) {
  const [[user], [profile], serviceRows, identityRows, addressRows, backgroundRows, [payout], agreements, captureRows, openMarkets, phone] = await Promise.all([
    db
      .select({ firstName: users.firstName, lastName: users.lastName, phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt, homeMarketId: users.homeMarketId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db.select().from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1),
    db
      .select({ service: helperServices, category: categories })
      .from(helperServices)
      .innerJoin(categories, eq(categories.id, helperServices.categoryId))
      .where(and(eq(helperServices.userId, userId), eq(helperServices.status, 'active')))
      .orderBy(asc(categories.sortOrder)),
    db.select().from(identityVerifications).where(eq(identityVerifications.userId, userId)).orderBy(asc(identityVerifications.createdAt)),
    db.select().from(addressVerifications).where(eq(addressVerifications.userId, userId)).orderBy(asc(addressVerifications.createdAt)),
    db.select().from(backgroundChecks).where(eq(backgroundChecks.userId, userId)).orderBy(asc(backgroundChecks.createdAt)),
    db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, userId)).limit(1),
    currentAgreements(db, userId),
    db.select().from(identityCaptures).where(eq(identityCaptures.userId, userId)).orderBy(asc(identityCaptures.createdAt)),
    db.select({ id: markets.id, status: markets.status, zipPrefixes: markets.zipPrefixes }).from(markets).where(inArray(markets.status, [...OPEN_MARKET_STATUSES])),
    // Whether the phone is asked for at all (plan 9.2: only where texts work; asked, not needed, in the grace).
    loadPhoneCheck(db, userId),
  ]);
  // Outside every city we're open in: the helper gave a ZIP and waits for their city (owner, 2026-11-14).
  const waitingIn = profile ? awaitingCity(profile, openMarkets) : null;
  const identity = identityStanding(identityRows, now, captureRows, user ? await marketTimeZone(db, user.homeMarketId) : MARKET_TIME_ZONE);
  const address = addressStanding(addressRows);
  const background = backgroundStanding(backgroundRows, now);

  const facts: OnboardingFacts = {
    profileComplete: Boolean(profile && profile.headline.trim() && profile.bio.trim() && profile.languages.length > 0),
    agreementAccepted: agreements.helper_agreement !== undefined,
    services: serviceRows.map(({ category }) => ({
      categorySlug: category.slug as CategorySlug,
      requiresBackgroundCheck: category.requiresBackgroundCheck,
    })),
    areaSet: Boolean(profile?.areaId) || waitingIn !== null,
    awaitingCity: waitingIn !== null,
    phoneVerified: Boolean(user?.phone && user.phoneVerifiedAt),
    phoneCheck: phone.check,
    // Waiting for our team: photos in review, a double check that didn't confirm their approval, or the
    // same ID on another account. `renewal`: a new check while the earlier one still counts (6.3).
    identity: {
      status: identity.status,
      cleared: identity.cleared,
      captureInReview: identity.capture?.status === 'submitted' || identity.blocked === 'double_check_review' || identity.blocked === 'duplicate_id',
      ...(identity.captureApproved ? { captureApproved: true } : {}),
      ...(identity.renewal ? { renewal: true } : {}),
    },
    address: { status: address.status, verified: address.verified },
    payout: (payout?.status as PayoutAccountStatus | undefined) ?? 'not_started',
    background: { status: background.status, eligible: background.eligible },
  };
  return {
    userId,
    user: user ?? null,
    profile: profile ?? null,
    serviceRows,
    identityRows,
    /** Our own ID check's tries (stage 1), oldest first. */
    captureRows,
    addressRows,
    backgroundRows,
    identity,
    address,
    background,
    payout: payout ?? null,
    agreements,
    /** Where the helper waits for us to open, when they're outside every open market. */
    awaitingCity: waitingIn,
    facts,
  };
}

export type OnboardingState = Awaited<ReturnType<typeof loadOnboardingState>>;

/**
 * Recomputes what the profile shows from the tracks: status (draft until bookable; paused and suspended
 * stay as they are) and the badge dates. The first time a profile becomes bookable, the helper is told.
 */
export async function syncHelperProfile(db: Db, userId: string, now: Date): Promise<void> {
  const state = await loadOnboardingState(db, userId, now);
  if (!state.profile) return;
  const { progress } = computeOnboarding(state.facts);
  const keep = state.profile.status === 'paused' || state.profile.status === 'suspended';
  const status = keep ? state.profile.status : progress.bookable ? 'active' : 'draft';
  await db
    .update(helperProfiles)
    .set({
      status,
      idVerifiedAt: state.identity.cleared && state.identity.verifiedAt ? state.identity.verifiedAt.toISOString() : null,
      backgroundCheckedAt: state.background.badgeAt ? state.background.badgeAt.toISOString() : null,
      addressVerifiedAt: state.address.verified && state.address.verifiedAt ? state.address.verifiedAt.toISOString() : null,
      payoutsReadyAt: state.payout?.status === 'active' && state.payout.activatedAt ? state.payout.activatedAt.toISOString() : null,
      updatedAt: now.toISOString(),
    })
    .where(eq(helperProfiles.userId, userId));
  if (state.profile.status === 'draft' && status === 'active') await emitVerificationEvent(db, userId, 'helper', 'ready');
}

/** "1234 Example Lane, Apt 2, Austin, TX 78723" from the encrypted address (only ever shown to its owner and, with a reason, staff). */
export function addressLabel(ciphertext: string | null, cipher: FieldCipher | null): string | undefined {
  if (!ciphertext || !cipher) return undefined;
  try {
    const address = JSON.parse(cipher.decrypt(ciphertext)) as { line1: string; line2?: string; city: string; state: string; zip: string };
    return [address.line1, address.line2, `${address.city}, ${address.state} ${address.zip}`].filter(Boolean).join(', ');
  } catch {
    return undefined;
  }
}

/**
 * Our own ID check (stage 1) as the helper sees it. `secret` keys the selfie's prompt (BETTER_AUTH_SECRET),
 * so the prompt for the next try can't be predicted or changed by reloading.
 */
export function captureSummary(state: OnboardingState, secret: string): IdentityCaptureSummary {
  const { identity } = state;
  const latest = identity.capture;
  const stage: IdentityCaptureSummary['stage'] = identity.verified ? 'done' : identity.captureApproved ? 'approved' : latest?.status === 'submitted' ? 'in_review' : 'needed';
  return {
    stage,
    canSubmit: identity.canCapture,
    ...(latest ? { documentType: latest.documentType as IdentityDocumentType, submittedAt: latest.submittedAt.toISOString() } : {}),
    ...(stage === 'needed' && latest?.status === 'rejected' && latest.rejectionReason ? { rejectionReason: latest.rejectionReason as IdentityCaptureRejectionReason } : {}),
    prompt: livenessPromptFor(state.userId, state.captureRows.length, secret),
  };
}

/** What the helper's screens show of each track. `promptSecret` picks the selfie's prompt (helpers' own ID check). */
export function verificationSummary(state: OnboardingState, backgroundRequired: boolean, cipher: FieldCipher | null, options: { promptSecret?: string } = {}): VerificationSummary {
  const { identity, address, background } = state;
  const reason = (value: string | null | undefined) => (value ? (value as AddressRejectionReason) : undefined);
  // The label is the address the status describes (the verified one while a newer proof waits).
  const described = address.verifiedRow ?? address.latest;
  const latestAddress = address.update?.row ?? address.latest;
  const label = addressLabel(state.addressRows.find((row) => row.id === described?.id)?.addressCiphertext ?? null, cipher);
  const payoutActive = state.facts.payout === 'active';
  return {
    phone: { verified: state.facts.phoneVerified, ...(state.user?.phone ? { last4: state.user.phone.slice(-4) } : {}) },
    identity: {
      status: identity.status,
      ...(identity.verifiedAt ? { verifiedAt: identity.verifiedAt.toISOString() } : {}),
      ...(identity.failureReason ? { failureReason: identity.failureReason } : {}),
      consentNeeded: state.agreements.biometric_consent === undefined,
      ...(identity.blocked ? { blocked: identity.blocked } : {}),
      ...(identity.retryAt ? { retryAt: identity.retryAt.toISOString() } : {}),
      ...(identity.nameCheck ? { nameCheck: identity.nameCheck } : {}),
      ...(identity.requested ? { requested: identity.requested } : {}),
      ...(identity.renewal ? { renewal: { countsUntil: identity.renewal.countsUntil.toISOString() } } : {}),
      // Helpers take our own check first; a client's ID check is the provider's alone.
      ...(state.profile ? { capture: captureSummary(state, options.promptSecret ?? '') } : {}),
    },
    address: {
      status: address.status,
      ...(address.verifiedAt ? { verifiedAt: address.verifiedAt.toISOString() } : {}),
      ...(label ? { label } : {}),
      ...(latestAddress?.submittedAt ? { submittedAt: latestAddress.submittedAt.toISOString() } : {}),
      ...(address.documentType ? { documentType: address.documentType } : {}),
      ...(address.rejectionReason ? { rejectionReason: address.rejectionReason } : {}),
      // Back with our team because the ID's legal name differs from the account's (ab, 2026-11-21): said on the step.
      ...(address.status === 'in_review' && identity.nameCheck ? { recheck: 'name_differs' as const } : {}),
      ...(address.update
        ? { update: { status: address.update.status, ...(reason(address.update.row.rejectionReason) ? { rejectionReason: reason(address.update.row.rejectionReason) } : {}) } }
        : {}),
    },
    payout: { status: state.facts.payout },
    background: {
      status: backgroundRequired ? background.status : 'not_required',
      ...(background.eligible && background.eligibleRow?.completedAt ? { checkedAt: background.eligibleRow.completedAt.toISOString() } : {}),
      requiredFor: state.facts.services.filter((s) => s.requiresBackgroundCheck).map((s) => s.categorySlug),
      disclosureNeeded: state.agreements.bg_check_disclosure === undefined,
      ...(background.validUntil ? { validUntil: background.validUntil.toISOString() } : {}),
      renewalOpen: background.renewalOpen,
      ...(background.invitationExpiresAt ? { invitationExpiresAt: background.invitationExpiresAt.toISOString() } : {}),
      ...(background.adjudication ? { adjudication: background.adjudication } : {}),
      ...(background.disputeUntil ? { disputeUntil: background.disputeUntil.toISOString() } : {}),
      canStart: backgroundRequired && payoutActive && state.identity.verified && background.canStart,
    },
  };
}
