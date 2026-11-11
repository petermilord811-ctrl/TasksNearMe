/**
 * Runs once when a server instance starts (Next.js instrumentation): the job runner, on the Node.js
 * runtime only, and not during `next build`. `JOBS_DISABLED=1` turns it off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.JOBS_DISABLED === '1') return;
  const [{ startJobRunner }, { db }] = await Promise.all([import('./modules/jobs/runner'), import('./platform/db/client')]);
  startJobRunner(db);
}
