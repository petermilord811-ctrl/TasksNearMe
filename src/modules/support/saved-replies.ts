import { and, asc, eq, isNull, or } from 'drizzle-orm';
import {
  ADMIN_QUEUES,
  savedReplyInputSchema,
  type ActionResult,
  type AdminQueue,
  type AdminSavedRepliesPageData,
  type SavedReplyInput,
  type SavedReplyOption,
} from '@/contracts';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { supportMacros } from './schema';
import { staffById, type StaffActor } from './staff';
import { canManageSavedReplies } from './staff-domain';

/**
 * Saved replies (completion plan P2): text staff start a case reply from. Leads keep the list; the
 * placeholders are filled when the reply is sent (`fillReplyPlaceholders` in staff-domain.ts).
 */

const queueOf = (value: string | null): AdminQueue | undefined => (ADMIN_QUEUES as readonly string[]).includes(value ?? '') ? (value as AdminQueue) : undefined;
const queueRank = (value: string | null) => (value === null ? -1 : ADMIN_QUEUES.indexOf(value as AdminQueue));

export async function getSavedRepliesPage(db: Db, staff: StaffActor): Promise<AdminSavedRepliesPageData> {
  const rows = await db.select().from(supportMacros).where(isNull(supportMacros.archivedAt)).orderBy(asc(supportMacros.title));
  const editors = await staffById(db, rows.map((row) => row.updatedByUserId));
  return {
    canManage: canManageSavedReplies(staff.roles),
    replies: rows
      .sort((a, b) => queueRank(a.queue) - queueRank(b.queue))
      .flatMap((row) => {
        const updatedBy = editors.get(row.updatedByUserId);
        if (!updatedBy) return [];
        const queue = queueOf(row.queue);
        return [{ id: row.id, title: row.title, body: row.body, ...(queue ? { queue } : {}), updatedAt: row.updatedAt.toISOString(), updatedBy }];
      }),
  };
}

/** The saved replies a case in `queue` can start from: its queue's and every queue's, by title. */
export async function savedRepliesFor(db: Db, queue: AdminQueue): Promise<SavedReplyOption[]> {
  return db
    .select({ id: supportMacros.id, title: supportMacros.title, body: supportMacros.body })
    .from(supportMacros)
    .where(and(isNull(supportMacros.archivedAt), or(isNull(supportMacros.queue), eq(supportMacros.queue, queue))))
    .orderBy(asc(supportMacros.title));
}

async function audit(db: Db, staff: StaffActor, action: string, id: string, now: Date, metadata: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({ id: newId('aud'), at: now.toISOString(), actorId: staff.id, actorRole: staff.roles[0] ?? 'staff', action, targetType: 'saved_reply', targetId: id, metadata });
}

export async function createSavedReply(db: Db, staff: StaffActor, input: SavedReplyInput, now: Date): Promise<ActionResult> {
  if (!canManageSavedReplies(staff.roles)) return { ok: false, code: 'not_allowed' };
  const parsed = savedReplyInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const id = newId('mac');
  await db.insert(supportMacros).values({ id, title: parsed.data.title, body: parsed.data.body, queue: parsed.data.queue || null, createdByUserId: staff.id, updatedByUserId: staff.id, createdAt: now, updatedAt: now });
  await audit(db, staff, 'saved_reply.create', id, now, { title: parsed.data.title });
  return { ok: true, code: 'saved' };
}

export async function updateSavedReply(db: Db, staff: StaffActor, id: string, input: SavedReplyInput, now: Date): Promise<ActionResult> {
  if (!canManageSavedReplies(staff.roles)) return { ok: false, code: 'not_allowed' };
  const parsed = savedReplyInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const updated = await db
    .update(supportMacros)
    .set({ title: parsed.data.title, body: parsed.data.body, queue: parsed.data.queue || null, updatedByUserId: staff.id, updatedAt: now })
    .where(and(eq(supportMacros.id, String(id)), isNull(supportMacros.archivedAt)))
    .returning({ id: supportMacros.id });
  if (updated.length === 0) return { ok: false, code: 'not_found' };
  await audit(db, staff, 'saved_reply.update', String(id), now, { title: parsed.data.title });
  return { ok: true, code: 'updated' };
}

export async function archiveSavedReply(db: Db, staff: StaffActor, id: string, now: Date): Promise<ActionResult> {
  if (!canManageSavedReplies(staff.roles)) return { ok: false, code: 'not_allowed' };
  const archived = await db
    .update(supportMacros)
    .set({ archivedAt: now, updatedByUserId: staff.id, updatedAt: now })
    .where(and(eq(supportMacros.id, String(id)), isNull(supportMacros.archivedAt)))
    .returning({ id: supportMacros.id, title: supportMacros.title });
  if (archived.length === 0) return { ok: false, code: 'not_found' };
  await audit(db, staff, 'saved_reply.archive', String(id), now, { title: archived[0]!.title });
  return { ok: true, code: 'updated' };
}
