/** How long a staff member's two-step check lasts in a session: a working day, not the session's 30 days (blueprint 08). */
export const STAFF_CHECK_TTL_MS = 12 * 3_600_000;

/**
 * Whether this session's two-step check still counts (sweep 2026-11-20): a stolen staff cookie stops working as staff by
 * the next day, and passing the check again renews it.
 */
export function staffCheckCurrent(checks: readonly { verifiedAt: Date }[], now: number = Date.now()): boolean {
  return checks.some((check) => now - check.verifiedAt.getTime() < STAFF_CHECK_TTL_MS);
}
