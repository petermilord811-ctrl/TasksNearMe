/**
 * The proxy's own database connection under load (load pass, 2026-11-21). Where samples are hidden (every production
 * build but the e2e one), each signed-out request for a task page or a helper's profile asks the database whether it's a
 * sample, over the proxy's one connection (src/modules/seo/proxy-database.ts: a pool of one, a 2 s wait at most; one
 * failure pauses all its reads for 30 s). The e2e build never asks, so an HTTP load test there can't show this.
 *
 * This fires `level` checks at once through that same code and connection, each for a different task (none from the
 * cache), and reports how long they waited and whether any failed.
 *
 *   DATABASE_URL=<a scratch database> npx tsx scripts/perf/proxy-lookups.ts [--levels 50,200,1000] [--rounds 3]
 */
import { createDatabaseLookup, isSamplePage } from '../../src/modules/seo/sample-pages';
import { proxyDatabase } from '../../src/modules/seo/proxy-database';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback;
};

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL (a scratch database, never the live one).');
  const levels = option('levels', '50,200,1000').split(',').map(Number);
  const rounds = Number(option('rounds', '3'));
  const database = proxyDatabase();
  const { rows } = await database.run('select slug from tasks order by created_at desc');
  const slugs = rows.map((row) => String(row.slug));
  console.log(`${slugs.length} task slugs in the database`);
  let next = 0;
  for (const level of levels) {
    for (let round = 1; round <= rounds; round += 1) {
      // A fresh cache each round, as for slugs the proxy hasn't seen; the same connection throughout, as in the proxy.
      const lookup = createDatabaseLookup(database);
      const paths = Array.from({ length: level }, () => `/tasks/${slugs[next++ % slugs.length] ?? 'missing'}`);
      const started = performance.now();
      const results = await Promise.all(
        paths.map(async (path) => {
          const begin = performance.now();
          const sample = await isSamplePage(path, lookup);
          return { ms: performance.now() - begin, sample };
        }),
      );
      const elapsed = performance.now() - started;
      const times = results.map((result) => result.ms).sort((a, b) => a - b);
      const at = (q: number) => Math.round(times[Math.min(times.length - 1, Math.floor(q * times.length))] ?? 0);
      // A failed read answers "not a sample" at once; after one, every read fails for 30 s, so fast "false" answers in a
      // round after a slow one mean the pause is on. The probe below tells the two apart.
      let paused = false;
      try {
        await database.run('select 1');
      } catch {
        paused = true;
      }
      console.log(`${String(level).padStart(5)} at once, round ${round}: all done in ${Math.round(elapsed)} ms; each p50 ${at(0.5)} ms, p95 ${at(0.95)} ms, max ${at(1)} ms${paused ? '; the proxy\'s reads are PAUSED (a read failed)' : ''}`);
      if (paused) {
        console.log('  waiting 31 s for the pause to end');
        await new Promise((resolve) => setTimeout(resolve, 31_000));
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(`proxy lookups failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
