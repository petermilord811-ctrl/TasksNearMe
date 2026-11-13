import type { ActionResult } from './actions';
import type { VerificationSummary } from './onboarding';

/**
 * ID checks for posters, triggered by risk (blueprint 01 P2; src/modules/trust/poster-risk.ts). Clients
 * don't verify their ID to use the app, unless one of these asks for it; then posting and paying wait
 * until the ID check passes (the same hosted check helpers use, with its limits and the Texas notice).
 * - `staff_request`: our team asked (from the person page).
 * - `reports`: 2 or more reports about the person in 30 days (not ones staff dismissed).
 * - `failed_payments`: 5 or more failed card payments in 24 hours (honest retries stay under it; card testing doesn't).
 * - `new_account_large_booking`: a booking of $500 or more from an account under 7 days old.
 */
export const POSTER_ID_REASONS = ['staff_request', 'reports', 'failed_payments', 'new_account_large_booking'] as const;
export type PosterIdReason = (typeof POSTER_ID_REASONS)[number];

/** `routes.app.verifyIdentity(next)`: the poster's ID check. */
export interface PosterIdentityPageData {
  /** What asks for it now; absent once nothing does (verified, or the reason has passed). */
  reason?: PosterIdReason;
  identity: VerificationSummary['identity'];
  /** Where to go once verified: back to what they were doing (a relative app path), or home. */
  continueHref: string;
}

/**
 * - `onStartIdentity`: pass `continueHref` as `next`, so the check comes back to this page and then to it.
 *   Ok with `redirectTo` (the provider's page); `fieldErrors.consent` (`must_accept`), `not_allowed`.
 * - `onRefreshStatus`: results arrive by webhook; this shows the latest.
 */
export interface PosterIdentityHandlers {
  onStartIdentity: (input: { consent?: boolean; next?: string }) => Promise<ActionResult>;
  onRefreshStatus: () => Promise<ActionResult>;
}
