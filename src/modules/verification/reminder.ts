import type { HelperSetupReminder } from '@/contracts';
import type { Db } from '@/platform/db/connect';
import { computeOnboarding, VERIFIED_HELPER_CHECKS } from './progress';
import { loadOnboardingState } from './state';

/**
 * The verified-helper reminder beside the search bar (owner, 2026-11-23): the checks that apply and where each stands,
 * for a helper who isn't a verified helper yet. Null once they are. Only for someone in helper mode (the shell asks
 * then), with or without a profile yet.
 */
export async function helperSetupReminder(db: Db, userId: string, now: Date): Promise<HelperSetupReminder | null> {
  const state = await loadOnboardingState(db, userId, now);
  const result = computeOnboarding(state.facts);
  if (result.complete) return null;
  const phoneCounts = (state.facts.phoneCheck ?? 'required') === 'required' || state.facts.phoneVerified;
  const checks = result.progress.steps.filter(
    ({ step, state: stepState }) => (VERIFIED_HELPER_CHECKS as readonly string[]).includes(step) && stepState !== 'skipped' && (step !== 'phone' || phoneCounts),
  );
  return {
    canHelp: result.progress.bookable,
    checks,
    done: result.progress.checks?.done ?? checks.filter((check) => check.state === 'done').length,
    total: result.progress.checks?.total ?? checks.length,
    next: result.firstIncomplete === 'done' ? 'address' : result.firstIncomplete,
  };
}
