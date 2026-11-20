import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readStaffFileToken } from '@/modules/files/staff-file-token';
import { createSupportRequest, getSupportCasePage } from '@/modules/support/service';
import { getAdminCase } from '@/modules/support/staff';
import type { StaffActor } from '@/modules/support/staff';
import { getAdminTaskPage } from '@/modules/tasks/moderation';
import { files, taskPhotos, tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Staff see another person's private file only from a page that has a reason or a role to show it (security review
 * SEC24): its address carries a token for that staff member and that page's context, and loading a case's files is
 * audited once. The person's own pages keep plain addresses.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const taylor: StaffActor = { id: 'usr_taylor', roles: ['trust_safety'] };
const FILE = 'fil_sfa_evidence';
const TASK = 'tsk_sfa_photo';
const TASK_FILE = 'fil_sfa_task';
const now = () => new Date();
const tokenOf = (src: string) => readStaffFileToken(decodeURIComponent(new URL(src, 'http://localhost').searchParams.get('t') ?? ''), now());

beforeAll(async () => {
  await db.delete(tasks).where(eq(tasks.id, TASK));
  await db.delete(files).where(inArray(files.id, [FILE, TASK_FILE]));
  await db.insert(files).values([
    { id: FILE, ownerUserId: 'usr_ben', kind: 'evidence', storageKey: 'test/sfa-evidence.webp', contentType: 'image/webp', width: 800, height: 600, bytes: 100 },
    { id: TASK_FILE, ownerUserId: 'usr_chris', kind: 'task_photo', storageKey: 'test/sfa-task.webp', contentType: 'image/webp', width: 800, height: 600, bytes: 100 },
  ]);
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  await db.insert(tasks).values({ ...desk!, id: TASK, slug: 'sfa-photo-desk', posterUserId: 'usr_chris', status: 'open', offerCount: 0, version: 1 });
  await db.insert(taskPhotos).values({ taskId: TASK, fileId: TASK_FILE, position: 0 });
});

afterAll(async () => {
  await db.delete(tasks).where(eq(tasks.id, TASK));
  await pool.end();
});

describe('staff and other people’s files', () => {
  it('see a case’s photos through a token for them and the case, audited once per load; the member’s page is plain', async () => {
    const created = await createSupportRequest(db, 'usr_ben', { topic: 'payment', description: 'The receipt shows a charge I don’t recognize, photo attached.', photoIds: [FILE] }, now());
    expect(created).toMatchObject({ ok: true });
    const caseId = created.ok ? created.redirectTo!.split('/').pop()! : '';

    const page = await getAdminCase(db, alex, caseId, now());
    const [photo] = page!.data.case.photos;
    expect(photo?.src).toMatch(new RegExp(`^/api/files/${FILE}\\?t=`));
    expect(tokenOf(photo!.src)).toEqual({ fileId: FILE, staffUserId: 'usr_alex', context: `case:${caseId}` });
    const viewed = await db.select().from(auditLog).where(and(eq(auditLog.action, 'case.files_viewed'), eq(auditLog.actorId, 'usr_alex')));
    expect(viewed.filter((row) => row.metadata.files === 1).length).toBeGreaterThanOrEqual(1);

    const own = await getSupportCasePage(db, 'usr_ben', caseId, now());
    expect(JSON.stringify(own)).toContain(`/api/files/${FILE}"`);
    expect(JSON.stringify(own)).not.toContain('?t=');
  });

  it('see a task’s photos on the moderation page through a token for them and the task', async () => {
    const page = await getAdminTaskPage(db, taylor, TASK, now());
    expect(page?.photos.map((photo) => tokenOf(photo.src))).toEqual([{ fileId: TASK_FILE, staffUserId: 'usr_taylor', context: `moderation:task:${TASK}` }]);
  });
});
