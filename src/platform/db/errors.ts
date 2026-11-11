/**
 * Postgres errors arrive wrapped by Drizzle ("Failed query: …"), with the driver's error as `cause`.
 * A unique violation (23505) means another request created the row first.
 */
export function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
