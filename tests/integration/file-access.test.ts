import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canViewRelatedFile } from '@/modules/files/related-access';
import { files, taskPhotos, tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const TASK = 'tsk_photo_access';
const photo = { id: 'fil_photo_access', kind: 'task_photo' };

beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  if (!desk) throw new Error('The seeded desk is missing');
  await db.insert(tasks).values({ ...desk, id: TASK, slug: 'photo-access-desk', status: 'open', offerCount: 0, version: 1 });
  await db.insert(files).values({
    id: photo.id,
    ownerUserId: 'usr_maya',
    kind: 'task_photo',
    storageKey: 'test/photo-access.webp',
    contentType: 'image/webp',
    width: 800,
    height: 600,
    bytes: 1000,
  });
  await db.insert(taskPhotos).values({ taskId: TASK, fileId: photo.id, position: 0 });
});

describe('task photo access', () => {
  it('lets bookable helpers see the photos of open tasks, and nobody else', async () => {
    expect(await canViewRelatedFile(db, photo, 'usr_jordan', new Date())).toBe(true);
    expect(await canViewRelatedFile(db, photo, 'usr_priya', new Date())).toBe(false); // not bookable
    expect(await canViewRelatedFile(db, photo, 'usr_chris', new Date())).toBe(false); // not a helper
    expect(await canViewRelatedFile(db, { ...photo, kind: 'evidence' }, 'usr_jordan', new Date())).toBe(false);
  });

  it('stops once the task is no longer open', async () => {
    await db.update(tasks).set({ status: 'assigned' }).where(eq(tasks.id, TASK));
    expect(await canViewRelatedFile(db, photo, 'usr_jordan', new Date())).toBe(false);
  });
});
