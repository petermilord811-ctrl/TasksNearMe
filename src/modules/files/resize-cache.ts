/**
 * Resized images, kept in memory for a while (security review SEC23). `?w=` used to be made with sharp on every
 * request, so asking for the same one over and over cost the server each time. Keyed by file and width (a file's
 * bytes never change), within a byte budget, the least recently used going first; requests for the same one at
 * the same moment share one resize. Only ever reached after the file route's access check.
 */
const BUDGET_BYTES = 32 * 1024 * 1024;

const kept = new Map<string, Buffer>();
const making = new Map<string, Promise<Buffer>>();
let keptBytes = 0;

export async function cachedResize(key: string, make: () => Promise<Buffer>, budget = BUDGET_BYTES): Promise<Buffer> {
  const hit = kept.get(key);
  if (hit) {
    // Most recently used goes last.
    kept.delete(key);
    kept.set(key, hit);
    return hit;
  }
  const pending = making.get(key);
  if (pending) return pending;
  const job = make()
    .then((made) => {
      if (made.length <= budget / 4) {
        kept.set(key, made);
        keptBytes += made.length;
        for (const [oldKey, old] of kept) {
          if (keptBytes <= budget) break;
          kept.delete(oldKey);
          keptBytes -= old.length;
        }
      }
      return made;
    })
    .finally(() => making.delete(key));
  making.set(key, job);
  return job;
}

/** For tests: start empty. */
export function forgetResizedImages(): void {
  kept.clear();
  making.clear();
  keptBytes = 0;
}
