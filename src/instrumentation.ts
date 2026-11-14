import { E2E_BUILD } from '@/shared/dev-helpers';

/**
 * Runs once when a server instance starts (Next.js instrumentation): the job runner, on the Node.js
 * runtime only, and not during `next build`. `JOBS_DISABLED=1` turns it off.
 * The e2e build (src/shared/dev-helpers.ts) refuses to start unless APP_URL is a localhost address, so it can't
 * be deployed by mistake.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (E2E_BUILD && !/^http:\/\/localhost(:\d+)?$/.test(process.env.APP_URL ?? '')) {
    console.error(`This is the e2e build (TNM_E2E_BUILD=1). It serves http://localhost only, and APP_URL is ${process.env.APP_URL ?? 'unset'}.`);
    process.exit(1);
  }
  if (process.env.JOBS_DISABLED === '1') return;
  const [{ startJobRunner }, { db }] = await Promise.all([import('./modules/jobs/runner'), import('./platform/db/client')]);
  startJobRunner(db);
}
