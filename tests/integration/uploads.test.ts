import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { createLocalFileStorage } from '@/integrations/storage';
import { storePhoto } from '@/modules/files/uploads';
import { files } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const storage = createLocalFileStorage(path.join(os.tmpdir(), `tnm-uploads-${process.pid}`));
const deps = { db, storage };

async function jpegWithExif(width: number, height: number): Promise<File> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'tnm-secret-marker', Artist: 'Maya' } })
    .toBuffer();
  expect((await sharp(buffer).metadata()).exif).toBeDefined();
  return new File([new Uint8Array(buffer)], 'desk.jpg', { type: 'image/jpeg' });
}

describe('photo uploads', () => {
  it('re-encodes to WebP, shrinks to 2000 px, and drops all metadata', async () => {
    const result = await storePhoto(deps, { userId: 'usr_maya', kind: 'task_photo', file: await jpegWithExif(3000, 2000) });
    if (!result.ok) throw new Error(result.code);
    expect(result.photo).toMatchObject({ width: 2000, height: 1333, src: `/api/files/${result.photo.id}` });

    const [row] = await db.select().from(files).where(eq(files.id, result.photo.id));
    expect(row).toMatchObject({ ownerUserId: 'usr_maya', kind: 'task_photo', contentType: 'image/webp' });
    const stored = await storage.get(row!.storageKey);
    const meta = await sharp(stored!).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(stored!.toString('latin1')).not.toContain('tnm-secret-marker');
  });

  it('refuses other file types, oversized files, and unreadable images', async () => {
    const text = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    expect(await storePhoto(deps, { userId: 'usr_maya', kind: 'task_photo', file: text })).toEqual({ ok: false, code: 'unsupported_type' });

    const huge = new File([new Uint8Array(11 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
    expect(await storePhoto(deps, { userId: 'usr_maya', kind: 'task_photo', file: huge })).toEqual({ ok: false, code: 'too_large' });

    const broken = new File([new Uint8Array([0xff, 0xd8, 0x00, 0x01, 0x02])], 'broken.jpg', { type: 'image/jpeg' });
    expect(await storePhoto(deps, { userId: 'usr_maya', kind: 'task_photo', file: broken })).toEqual({ ok: false, code: 'unsupported_type' });
  });
});
