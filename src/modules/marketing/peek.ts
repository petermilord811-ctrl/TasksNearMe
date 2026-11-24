import { and, eq } from 'drizzle-orm';
import type { HelperPeekData } from '@/contracts';
import { savedHelpers } from '@/modules/reviews/schema';
import type { Db } from '@/platform/db/connect';
import type { RowScope } from '@/shared/sample-data';
import { getHelperProfilePageData } from './queries';

/**
 * A helper's profile in a peek sheet (2026-11-23, owner: "you have to show new window for showing helper profile instead
 * of redirect"): their public page's data as this viewer may see it (a sample person where samples are hidden: null), and
 * whether the viewer saved them or is them.
 */
export async function getHelperPeek(db: Db, viewerId: string, handle: string, rows: RowScope): Promise<HelperPeekData | null> {
  const profile = await getHelperProfilePageData(handle, rows);
  if (!profile) return null;
  const self = profile.helper.id === viewerId;
  const [saved] = self ? [] : await db.select({ userId: savedHelpers.userId }).from(savedHelpers).where(and(eq(savedHelpers.userId, viewerId), eq(savedHelpers.helperUserId, profile.helper.id))).limit(1);
  return { profile, saved: Boolean(saved), self };
}
