import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { PublicTaskPageData, TaskMemberDetails } from '@/contracts';
import { photoFromFile } from '@/modules/files/uploads';
import { helperProfiles } from '@/modules/profiles/schema';
import { maskContactDetails } from '@/modules/trust/contact-masking';
import type { Db } from '@/platform/db/connect';
import { files, taskPhotos, tasks } from './schema';

/** Profile statuses of helpers who can offer (syncHelperProfile: active once bookable; paused ones keep it). */
const CAN_OFFER = ['active', 'paused'];

/**
 * What a task's public page adds for the person looking (2026-11-23, the structured page with a photo carousel): the
 * full description, the category's answers, the photos and the expense allowance, as Find work shows them, for a helper
 * who can offer (their home address verified) and for the poster; nothing more for anyone else. Per visitor, never
 * cached with the public page.
 */
export async function publicTaskDetailsFor(db: Db, taskId: string, viewerId: string | null): Promise<Pick<PublicTaskPageData, 'details' | 'viewer'>> {
  if (!viewerId) return { viewer: 'visitor' };
  const [[task], [profile]] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1),
    db.select({ status: helperProfiles.status }).from(helperProfiles).where(and(eq(helperProfiles.userId, viewerId), inArray(helperProfiles.status, CAN_OFFER))).limit(1),
  ]);
  if (!task) return { viewer: 'member' };
  const own = task.posterUserId === viewerId;
  if (!own && !profile) return { viewer: 'member' };
  const photoRows = await db.select({ file: files }).from(taskPhotos).innerJoin(files, eq(files.id, taskPhotos.fileId)).where(eq(taskPhotos.taskId, taskId)).orderBy(asc(taskPhotos.position));
  // Free-text answers and the expense note are masked like the description, before a booking (sweep PT8).
  const details: TaskMemberDetails = {
    description: maskContactDetails(task.description).text,
    answers: Object.fromEntries(Object.entries(task.details).map(([key, value]) => [key, typeof value === 'string' ? maskContactDetails(value).text : value])),
    photos: photoRows.map(({ file }) => photoFromFile(file)),
    ...(task.expenseAllowanceCents > 0 ? { expenseAllowance: { amountCents: task.expenseAllowanceCents, description: maskContactDetails(task.expenseAllowanceNote ?? '').text } } : {}),
  };
  return { viewer: own ? 'poster' : 'helper', details };
}
