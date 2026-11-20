import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { closeTaskInvites } from '@/modules/invites/holds';
import {
  taskModerationInputSchema,
  type ActionResult,
  type AdminTaskPageData,
  type CategorySlug,
  type OfferStatus,
  type StaffRole,
  type TaskModerationActionId,
  type TaskModerationInput,
  type TaskStatus,
} from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { photoFromFile } from '@/modules/files/uploads';
import { areas, categories, markets } from '@/modules/markets/schema';
import { offers } from '@/modules/offers/schema';
import { declinedForCancel } from '@/modules/offers/closing';
import { supportCases } from '@/modules/support/schema';
import { caseRowsFor, personSummaryOf, staffById, type StaffActor } from '@/modules/support/staff';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { budgetOf } from './projections';
import { files, taskPhotos, tasks } from './schema';

/**
 * Task moderation for staff (UI-033; blueprint 08 §4, backlog B-053): hide or restore, close, remove a
 * photo, move to another category. Every change needs a reason and goes to the audit log. Trust and
 * safety, support leads and admins moderate; other staff can read.
 */

const MODERATORS: readonly StaffRole[] = ['trust_safety', 'support_lead', 'admin'];
/** Offers still in play (closing a task declines them, like the poster's own cancel). */
const ACTIVE_OFFERS: OfferStatus[] = ['pending', 'stale'];
export const canModerateTasks = (roles: readonly StaffRole[]) => roles.some((role) => MODERATORS.includes(role));

/** The role the audit log records for a staff member (the most senior one they hold). */
const ROLE_ORDER: readonly StaffRole[] = ['admin', 'trust_safety', 'support_lead', 'finance', 'support_agent'];
export const auditRoleOf = (roles: readonly StaffRole[]): StaffRole => ROLE_ORDER.find((role) => roles.includes(role)) ?? roles[0] ?? 'support_agent';

interface TaskFacts {
  status: string;
  hidden: boolean;
  booked: boolean;
  photoCount: number;
  otherCategories: number;
}

/** What a staff member may do to a task now (pure, so it's testable). */
export function taskModerationActions(roles: readonly StaffRole[], task: TaskFacts): TaskModerationActionId[] {
  if (!canModerateTasks(roles) || task.status === 'draft') return [];
  const actions: TaskModerationActionId[] = [task.hidden ? 'restore_task' : 'hide_task'];
  if (task.status === 'open' && !task.booked) actions.push('close_task');
  if (task.photoCount > 0) actions.push('remove_photo');
  if (task.otherCategories > 0 && (task.status === 'open' || task.status === 'assigned')) actions.push('recategorize');
  return actions;
}

async function loadTask(db: Db, taskId: string) {
  const [row] = await db
    .select({ task: tasks, slug: categories.slug, areaName: areas.name, marketSlug: markets.slug })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .innerJoin(markets, eq(markets.id, tasks.marketId))
    .leftJoin(areas, eq(areas.id, tasks.publicAreaId))
    .where(eq(tasks.id, String(taskId)))
    .limit(1);
  if (!row) return null;
  const [photoRows, [booking], marketCategories] = await Promise.all([
    db
      .select({ file: files })
      .from(taskPhotos)
      .innerJoin(files, eq(files.id, taskPhotos.fileId))
      .where(eq(taskPhotos.taskId, row.task.id))
      .orderBy(asc(taskPhotos.position)),
    db.select({ id: bookings.id }).from(bookings).where(eq(bookings.taskId, row.task.id)).orderBy(desc(bookings.createdAt)).limit(1),
    db.select({ slug: categories.slug }).from(categories).where(and(eq(categories.status, 'active'), ne(categories.id, row.task.categoryId))).orderBy(asc(categories.sortOrder)),
  ]);
  const facts: TaskFacts = {
    status: row.task.status,
    hidden: row.task.hiddenAt !== null,
    booked: Boolean(booking),
    photoCount: photoRows.length,
    otherCategories: marketCategories.length,
  };
  return { ...row, photoRows, bookingId: booking?.id, otherCategories: marketCategories.map((item) => item.slug as CategorySlug), facts };
}

/** `routes.admin.task(taskId)`: what staff need to moderate it. Never the exact address. */
export async function getAdminTaskPage(db: Db, staff: StaffActor, taskId: string, now: Date): Promise<AdminTaskPageData | null> {
  const loaded = await loadTask(db, taskId);
  if (!loaded || loaded.task.status === 'draft') return null;
  const { task } = loaded;
  const [[poster], caseRows, hiddenBy] = await Promise.all([
    db.select().from(users).where(eq(users.id, task.posterUserId)).limit(1),
    db
      .select()
      .from(supportCases)
      .where(sql`${supportCases.context} ->> 'taskId' = ${task.id}`)
      .orderBy(desc(supportCases.createdAt))
      .limit(20),
    task.hiddenByUserId ? staffById(db, [task.hiddenByUserId]) : Promise.resolve(new Map()),
  ]);
  if (!poster) return null;
  const hider = task.hiddenByUserId ? hiddenBy.get(task.hiddenByUserId) : undefined;
  return {
    task: {
      id: task.id,
      slug: task.slug,
      title: task.title,
      categorySlug: loaded.slug as CategorySlug,
      status: task.status as TaskStatus,
      description: task.description,
      details: task.details,
      ...(loaded.areaName ? { areaName: loaded.areaName } : {}),
      windowStart: task.windowStart.toISOString(),
      windowEnd: task.windowEnd.toISOString(),
      budget: budgetOf(task),
      offerCount: task.offerCount,
      postedAt: (task.publishedAt ?? task.createdAt).toISOString(),
      ...(task.hiddenAt && hider ? { hidden: { reason: task.hiddenReason ?? '', at: task.hiddenAt.toISOString(), by: hider } } : {}),
    },
    poster: { ...personSummaryOf(poster), email: poster.email },
    photos: loaded.photoRows.map(({ file }) => photoFromFile(file)),
    ...(loaded.bookingId ? { bookingId: loaded.bookingId } : {}),
    cases: await caseRowsFor(db, caseRows, now),
    categories: loaded.otherCategories,
    actions: taskModerationActions(staff.roles, loaded.facts),
  };
}

/** What changed, for the server action to refresh the public pages (the market's and the task's). */
export interface ModerationOutcome {
  result: ActionResult;
  slug?: string;
  marketSlug?: string;
}

export async function moderateTask(db: Db, staff: StaffActor, taskId: string, input: TaskModerationInput, now: Date): Promise<ModerationOutcome> {
  const parsed = taskModerationInputSchema.safeParse(input);
  if (!parsed.success) return { result: validationFailed(parsed.error) };
  const loaded = await loadTask(db, taskId);
  if (!loaded || loaded.task.status === 'draft') return { result: { ok: false, code: 'not_found' } };
  const action = parsed.data;
  if (!taskModerationActions(staff.roles, loaded.facts).includes(action.action)) return { result: { ok: false, code: 'not_allowed' } };
  const { task } = loaded;
  const audit = (name: string, metadata: Record<string, unknown> = {}) => ({
    id: newId('aud'),
    actorId: staff.id,
    actorRole: auditRoleOf(staff.roles),
    action: name,
    targetType: 'task',
    targetId: task.id,
    reason: action.reason,
    metadata,
  });

  switch (action.action) {
    case 'hide_task':
      await db.transaction(async (tx) => {
        await tx.update(tasks).set({ hiddenAt: now, hiddenByUserId: staff.id, hiddenReason: action.reason, updatedAt: now }).where(eq(tasks.id, task.id));
        await tx.insert(auditLog).values(audit('task.hide'));
      });
      break;
    case 'restore_task':
      await db.transaction(async (tx) => {
        await tx.update(tasks).set({ hiddenAt: null, hiddenByUserId: null, hiddenReason: null, updatedAt: now }).where(eq(tasks.id, task.id));
        await tx.insert(auditLog).values(audit('task.restore'));
      });
      break;
    case 'close_task':
      await db.transaction(async (tx) => {
        await tx.update(tasks).set({ status: 'canceled', offerCount: 0, updatedAt: now, version: task.version + 1 }).where(eq(tasks.id, task.id));
        const declined = await tx.update(offers).set({ status: 'declined', closedAt: now, updatedAt: now }).where(and(eq(offers.taskId, task.id), inArray(offers.status, ACTIVE_OFFERS))).returning({ id: offers.id, helperUserId: offers.helperUserId });
        // The task is canceled for the helpers whose offers were open too: each hears it once.
        await tx.insert(outboxEvents).values([{ id: newId('evt'), type: 'task.canceled', aggregateType: 'task', aggregateId: task.id, payload: { taskId: task.id, reason: 'staff' } }, ...declinedForCancel(task.id, declined)]);
        await tx.insert(auditLog).values(audit('task.close'));
      });
      // Direct invites for the task end too, and let go of the client's card now (repeats review #11).
      await closeTaskInvites(db, task.id, now);
      break;
    case 'remove_photo': {
      if (!loaded.photoRows.some(({ file }) => file.id === action.photoId)) return { result: { ok: false, code: 'not_found' } };
      await db.transaction(async (tx) => {
        await tx.delete(taskPhotos).where(and(eq(taskPhotos.taskId, task.id), eq(taskPhotos.fileId, action.photoId)));
        // No longer a task photo, so a new post (Post again, a saved draft) can't attach it again (sweep PT13). Its owner and
        // staff can still open it (files/access.ts).
        await tx.update(files).set({ kind: 'removed_task_photo' }).where(eq(files.id, action.photoId));
        await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, task.id));
        await tx.insert(auditLog).values(audit('task.remove_photo', { photoId: action.photoId }));
      });
      break;
    }
    case 'recategorize': {
      if (!loaded.otherCategories.includes(action.categorySlug)) return { result: { ok: false, code: 'not_allowed' } };
      const [target] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, action.categorySlug)).limit(1);
      if (!target) return { result: { ok: false, code: 'not_allowed' } };
      await db.transaction(async (tx) => {
        await tx.update(tasks).set({ categoryId: target.id, updatedAt: now, version: task.version + 1 }).where(eq(tasks.id, task.id));
        await tx.insert(auditLog).values(audit('task.recategorize', { from: loaded.slug, to: action.categorySlug }));
      });
      break;
    }
  }
  return { result: { ok: true, code: 'updated' }, slug: task.slug, marketSlug: loaded.marketSlug };
}
