import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Runs `work` while no other Playwright worker on this machine runs work under the same name. For tests that change
 * something the whole app shares, or read it (the admin search setting: robots.txt, the sitemap, X-Robots-Tag): the
 * phone and desktop projects run the same file at the same time, so test order alone doesn't keep them apart. A lock
 * left behind by a crashed worker counts as gone after `staleMs`. CI's shards are separate machines, each with its own
 * database, so a lock per machine is what's needed.
 */
export async function exclusive<T>(name: string, work: () => Promise<T>, options: { waitMs?: number; staleMs?: number } = {}): Promise<T> {
  const { waitMs = 180_000, staleMs = 300_000 } = options;
  const file = path.join(os.tmpdir(), `tasksnearme-e2e-${name}.lock`);
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
      break;
    } catch {
      try {
        if (Date.now() - fs.statSync(file).mtimeMs > staleMs) fs.rmSync(file, { force: true });
      } catch {
        // Released meanwhile.
      }
      if (Date.now() > deadline) throw new Error(`waited ${waitMs} ms for the e2e lock "${name}"`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  try {
    return await work();
  } finally {
    fs.rmSync(file, { force: true });
  }
}
