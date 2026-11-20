import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedResize, forgetResizedImages } from './resize-cache';

beforeEach(() => forgetResizedImages());
const bytes = (size: number, fill = 1) => Buffer.alloc(size, fill);

describe('resized images (security review SEC23)', () => {
  it('are made once per file and width, also when asked for at the same moment', async () => {
    const make = vi.fn(async () => bytes(10));
    await Promise.all([cachedResize('fil_a:256', make), cachedResize('fil_a:256', make)]);
    await cachedResize('fil_a:256', make);
    expect(make).toHaveBeenCalledTimes(1);
    await cachedResize('fil_a:1280', make);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('keep within their budget, the least recently used going first', async () => {
    const make = vi.fn(async () => bytes(20));
    await cachedResize('a', make, 100);
    await cachedResize('b', make, 100);
    await cachedResize('a', make, 100); // a is used again: b is now the oldest
    // Six of 20 bytes pass the 100-byte budget: the oldest, b, goes.
    for (const key of ['c', 'd', 'e', 'f']) await cachedResize(key, make, 100);
    expect(make).toHaveBeenCalledTimes(6);
    await cachedResize('a', make, 100);
    expect(make).toHaveBeenCalledTimes(6);
    await cachedResize('b', make, 100);
    expect(make).toHaveBeenCalledTimes(7);
  });

  it('never keep one larger than a quarter of the budget, nor a failed resize', async () => {
    const big = vi.fn(async () => bytes(30));
    await cachedResize('big', big, 100);
    await cachedResize('big', big, 100);
    expect(big).toHaveBeenCalledTimes(2);
    const failing = vi.fn(async () => {
      throw new Error('not an image');
    });
    await expect(cachedResize('bad', failing)).rejects.toThrow('not an image');
    await expect(cachedResize('bad', failing)).rejects.toThrow('not an image');
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
