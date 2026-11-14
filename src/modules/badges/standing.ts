import { desc, eq } from 'drizzle-orm';
import { VERIFICATION_STEP_IDS, type AccountVerification, type OnboardingProgress, type OnboardingStepState, type VerificationStepId } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { computeOnboarding } from '@/modules/verification/progress';
import { identityVerifications } from '@/modules/verification/schema';
import { loadOnboardingState } from '@/modules/verification/state';
import type { Db } from '@/platform/db/connect';

/**
 * Where a person stands (completion plan 6.5): the verification steps, for the profile's first page (onboarding's
 * profile step, the profile editor) and the account page. The welcome gift card beside them comes from
 * `welcomeCardFor` (src/modules/rewards/welcome.ts). Reads the verification state through its own loaders; it
 * never changes it.
 */

const isVerificationStep = (step: string): step is VerificationStepId => (VERIFICATION_STEP_IDS as readonly string[]).includes(step);

/** The verification steps the helper needs (a skipped background check isn't one), with their states. */
export function verificationSteps(progress: OnboardingProgress): AccountVerification['steps'] {
  return progress.steps.flatMap((entry) => (isVerificationStep(entry.step) && entry.state !== 'skipped' ? [{ step: entry.step, state: entry.state }] : []));
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
