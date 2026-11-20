import { randomBytes } from 'node:crypto';
import { violatedConstraint } from '@/platform/db/errors';

/** A copy's slug (a regular visit, a rebooking): its template's without the 4 random characters, and 4 new ones. */
export const copySlug = (templateSlug: string) => `${templateSlug.replace(/-[a-z0-9]{4}$/, '')}-${randomBytes(3).toString('hex').slice(0, 4)}`;

/**
 * Runs `insert` with a fresh copy slug, and again with another when that slug is taken (repeats review #16; the posting
 * review's PT5): 4 random characters meet an existing slug now and then, about once in 1,300 visits of a weekly series
 * after a year, and the visit or rebooking wasn't created. Run the insert in its own transaction or savepoint, so a taken
 * slug doesn't abort the work around it. Any other error is the caller's.
 */
export async function withCopySlug<T>(templateSlug: string, insert: (slug: string) => Promise<T>, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await insert(copySlug(templateSlug));
    } catch (error) {
      if (attempt >= tries || violatedConstraint(error) !== 'tasks_slug_unique') throw error;
    }
  }
}
