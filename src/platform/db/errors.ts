/**
 * Postgres errors arrive wrapped by Drizzle ("Failed query: …"), with the driver's error as `cause`.
 * A unique violation (23505) means another request created the row first.
 */
export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, '23505');
}

/** A foreign key violation (23503): the row it points to is gone (a deleted person, say). */
export function isForeignKeyViolation(error: unknown): boolean {
  return hasCode(error, '23503');
}

/** The constraint a unique violation hit (`tasks_slug_unique`, say), or null. */
export function violatedConstraint(error: unknown): string | null {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    const { code, constraint } = current as { code?: unknown; constraint?: unknown };
    if (code === '23505') return typeof constraint === 'string' ? constraint : null;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

function hasCode(error: unknown, code: string): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
