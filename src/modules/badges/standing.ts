import { and, desc, eq } from 'drizzle-orm';
import { VERIFICATION_STEP_IDS, type AccountVerification, type FoundingHelperCard, type OnboardingProgress, type OnboardingStepState, type VerificationStepId } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { areas } from '@/modules/markets/schema';
import { getFlags } from '@/modules/markets/queries';
import { helperProfiles } from '@/modules/profiles/schema';
import { countFoundingHelpers } from '@/modules/profiles/queries';
import { REWARD_RULES } from '@/modules/rewards/domain';
import { WELCOME_PROGRAM } from '@/modules/rewards/programs';
import { rewardGrants } from '@/modules/rewards/schema';
import { computeOnboarding } from '@/modules/verification/progress';
import { identityVerifications } from '@/modules/verification/schema';
import { loadOnboardingState } from '@/modules/verification/state';
import type { Db } from '@/platform/db/connect';

/**
 * Where a person stands (completion plan 6.5): the founding-helper gift card and the verification steps, for
 * the profile's first page (onboarding's profile step, the profile editor) and the account page. Reads the
 * verification state through its own loaders; it never changes it.
 */

const DAY = 86_400_000;
const isVerificationStep = (step: string): step is VerificationStepId => (VERIFICATION_STEP_IDS as readonly string[]).includes(step);

/** The verification steps the helper needs (a skipped background check isn't one), with their states. */
export function verificationSteps(progress: OnboardingProgress): AccountVerification['steps'] {
  return progress.steps.flatMap((entry) => (isVerificationStep(entry.step) && entry.state !== 'skipped' ? [{ step: entry.step, state: entry.state }] : []));
}

/** The founding-helper gift card for the helper, or nothing when it doesn't apply (see `FoundingHelperCard`). */
export async function foundingCardFor(db: Db, userId: string, progress: OnboardingProgress, now: Date): Promise<FoundingHelperCard | undefined> {
  const [row] = await db
    .select({ number: helperProfiles.foundingNumber, idVerifiedAt: helperProfiles.idVerifiedAt, areaMarket: areas.marketId, homeMarket: users.homeMarketId })
    .from(users)
    .leftJoin(helperProfiles, eq(helperProfiles.userId, users.id))
    .leftJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return undefined;
  const marketId = row.areaMarket ?? row.homeMarket;
  const flags = await getFlags(marketId, db);
  if (flags['reward.welcome'] !== true) return undefined;

  const steps = verificationSteps(progress);
  const base = {
    amountCents: WELCOME_PROGRAM.amountCents,
    cohortSize: REWARD_RULES.welcome.cohortSize,
    minTaskPriceCents: WELCOME_PROGRAM.minTaskPriceCents,
    windowDays: WELCOME_PROGRAM.windowDays,
    stillNeeded: steps.filter((entry) => entry.state !== 'done').map((entry) => entry.step),
    progress: { done: steps.filter((entry) => entry.state === 'done').length, total: steps.length },
  };
  const spotsLeft = Math.max(0, REWARD_RULES.welcome.cohortSize - (await countFoundingHelpers(marketId, db)));

  if (row.number !== null) {
    const [grant] = await db
      .select({ status: rewardGrants.status, voidReason: rewardGrants.voidReason })
      .from(rewardGrants)
      .where(and(eq(rewardGrants.helperUserId, userId), eq(rewardGrants.program, 'welcome')))
      .orderBy(desc(rewardGrants.createdAt))
      .limit(1);
    if (grant && grant.status !== 'voided' && grant.status !== 'expired') return { ...base, state: 'earned', number: row.number, spotsLeft };
    // Staff ended the program for this helper after a risk review.
    if (grant?.voidReason === 'risk_review') return undefined;
    const claimBy = row.idVerifiedAt ? new Date(new Date(row.idVerifiedAt).getTime() + WELCOME_PROGRAM.windowDays * DAY) : undefined;
    if (claimBy && claimBy < now) return undefined;
    return { ...base, state: 'yours', number: row.number, spotsLeft, ...(claimBy ? { claimBy: claimBy.toISOString() } : {}) };
  }
  return spotsLeft > 0 ? { ...base, state: 'open', spotsLeft } : undefined;
}

/** The account page's verification section (see `AccountVerification`). */
export async function accountVerificationFor(db: Db, userId: string, now: Date): Promise<AccountVerification> {
  const [person] = await db
    .select({ phoneVerifiedAt: users.phoneVerifiedAt, profile: helperProfiles })
    .from(users)
    .leftJoin(helperProfiles, eq(helperProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  const profile = person?.profile;
  const phoneVerified = !!person?.phoneVerifiedAt;
  if (profile) {
    const state = await loadOnboardingState(db, userId, now);
    const { progress } = computeOnboarding(state.facts, 'profile');
    return {
      role: 'helper',
      steps: verificationSteps(progress),
      badges: {
        ...(profile.idVerifiedAt ? { idVerifiedAt: new Date(profile.idVerifiedAt).toISOString() } : {}),
        ...(profile.backgroundCheckedAt ? { backgroundCheckedAt: new Date(profile.backgroundCheckedAt).toISOString() } : {}),
        ...(profile.addressVerifiedAt ? { addressVerifiedAt: new Date(profile.addressVerifiedAt).toISOString() } : {}),
        phoneVerified,
      },
    };
  }
  // Clients: the phone, and an ID check only when there is one (our team asks for it when risk calls for it).
  const [identity] = await db
    .select({ status: identityVerifications.status, verifiedAt: identityVerifications.verifiedAt })
    .from(identityVerifications)
    .where(eq(identityVerifications.userId, userId))
    .orderBy(desc(identityVerifications.createdAt))
    .limit(1);
  const identityState: OnboardingStepState | null = !identity ? null : identity.status === 'verified' ? 'done' : identity.status === 'processing' ? 'in_review' : 'todo';
  return {
    role: 'client',
    steps: [{ step: 'phone', state: phoneVerified ? 'done' : 'todo' }, ...(identityState ? [{ step: 'identity' as const, state: identityState }] : [])],
    badges: { ...(identity?.status === 'verified' && identity.verifiedAt ? { idVerifiedAt: identity.verifiedAt.toISOString() } : {}), phoneVerified },
  };
}
