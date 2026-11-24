import os from 'node:os';
import path from 'node:path';
import { and, eq, gte, inArray, like } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { createStandInGifs } from '@/integrations/gifs/stand-in';
import { GifTooLargeError, type GifProvider } from '@/integrations/gifs/types';
import { createLocalFileStorage } from '@/integrations/storage';
import { GIF_SEARCH_RULE, MAX_GIF_BYTES, attachGif, searchGifs } from '@/modules/messaging/gifs';
import { files } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * GIFs in chat (2026-11-24): a GIF is attached by its id only, looked up again and checked before it's stored. The
 * samples stand in for KLIPY (no network); crafted providers hand over what KLIPY never should. Everything runs in
 * its own far-off rate-limit windows, and the files and windows it makes are removed after.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const storage = createLocalFileStorage(path.join(os.tmpdir(), `tnm-gifs-${process.pid}`));
const userId = 'usr_maya';
const at = new Date('2031-03-03T10:00:00.000Z');
const deps = { db, storage, now: () => at };
const made: string[] = [];

afterAll(async () => {
  if (made.length) await db.delete(files).where(inArray(files.id, made));
  await db.delete(rateLimits).where(and(like(rateLimits.key, `gifs:%:user:${userId}`), gte(rateLimits.windowStart, new Date('2031-01-01T00:00:00.000Z'))));
  await pool.end();
});

/** A provider that hands over these bytes for the id `crafted`. */
function handing(bytes: Buffer | (() => never)): GifProvider {
  return {
    name: 'stand-in',
    search: async () => ({ results: [], hasMore: false }),
    find: async (id) => (id === 'crafted' ? { id, title: 'Crafted', url: 'https://static.klipy.com/ii/crafted.gif' } : null),
    download: async () => (typeof bytes === 'function' ? bytes() : bytes),
  };
}

async function gifsOwned(): Promise<number> {
  return (await db.select({ id: files.id }).from(files).where(and(eq(files.ownerUserId, userId), eq(files.contentType, 'image/gif')))).length;
}

describe('attaching a GIF', () => {
  it('stores a known GIF as it came, as an animated message photo', async () => {
    const result = await attachGif(deps, { userId, id: 'sample-party' }, createStandInGifs());
    if (!result.ok) throw new Error(result.code);
    made.push(result.photo.id);
    expect(result.photo).toEqual({ id: expect.stringMatching(/^fil_/), src: `/api/files/${result.photo.id}`, alt: 'Party time', width: 160, height: 120, animated: true });

    const [row] = await db.select().from(files).where(eq(files.id, result.photo.id));
    expect(row).toMatchObject({ ownerUserId: userId, kind: 'message', contentType: 'image/gif', width: 160, height: 120, storageKey: `message/${result.photo.id}.gif` });
    const stored = await storage.get(row!.storageKey);
    const meta = await sharp(stored!, { animated: true }).metadata();
    expect(meta.format).toBe('gif');
    expect(meta.pages).toBe(4);
    expect(stored!.length).toBe(row!.bytes);
  });

  it('refuses unknown and malformed ids without storing anything', async () => {
    const before = await gifsOwned();
    const standIn = createStandInGifs();
    for (const id of ['sample-nope', '../../etc/passwd', 'https://static.klipy.com/ii/a.gif', '', 42, undefined]) {
      expect(await attachGif(deps, { userId, id }, standIn)).toEqual({ ok: false, code: 'unsupported_type' });
    }
    expect(await gifsOwned()).toBe(before);
  });

  it('refuses files over 4 MB', async () => {
    expect(await attachGif(deps, { userId, id: 'crafted' }, handing(Buffer.alloc(MAX_GIF_BYTES + 1)))).toEqual({ ok: false, code: 'too_large' });
    expect(await attachGif(deps, { userId, id: 'crafted' }, handing(() => { throw new GifTooLargeError('Too large'); }))).toEqual({ ok: false, code: 'too_large' });
  });

  it('refuses anything that isn’t an animated GIF of a sane size', async () => {
    const before = await gifsOwned();
    const png = await sharp({ create: { width: 120, height: 90, channels: 3, background: '#3a7' } }).png().toBuffer();
    const still = await sharp({ create: { width: 120, height: 90, channels: 3, background: '#3a7' } }).gif().toBuffer();
    const frame = await sharp({ create: { width: 1200, height: 40, channels: 3, background: '#a37' } }).png().toBuffer();
    const tooWide = await sharp([frame, frame], { join: { animated: true } }).gif().toBuffer();
    const html = Buffer.from('GIF89a<script>alert(1)</script>');
    for (const bytes of [png, still, tooWide, html]) {
      expect(await attachGif(deps, { userId, id: 'crafted' }, handing(bytes))).toEqual({ ok: false, code: 'unsupported_type' });
    }
    expect(await gifsOwned()).toBe(before);
  });

  it('answers unknown when GIFs are off', async () => {
    expect(await attachGif(deps, { userId, id: 'sample-party' }, null)).toEqual({ ok: false, code: 'unknown' });
  });
});

describe('searching GIFs', () => {
  it('finds the samples, and allows 60 searches a minute', async () => {
    const standIn = createStandInGifs();
    const later = new Date(at.getTime() + 10 * 60_000);
    const first = await searchGifs(db, userId, { q: 'gracias' }, later, standIn);
    expect(first).toEqual({ ok: true, results: [expect.objectContaining({ id: 'sample-thank-you', title: 'Thank you' })] });
    for (let search = 2; search <= GIF_SEARCH_RULE.limit; search++) expect((await searchGifs(db, userId, {}, later, standIn)).ok).toBe(true);
    expect(await searchGifs(db, userId, {}, later, standIn)).toEqual({ ok: false, code: 'rate_limited' });
    expect(await searchGifs(db, userId, { q: 'x'.repeat(101) }, new Date(later.getTime() + 60_000), standIn)).toEqual({ ok: false, code: 'unavailable' });
    expect(await searchGifs(db, userId, {}, new Date(later.getTime() + 120_000), null)).toEqual({ ok: false, code: 'unavailable' });
  });
});
