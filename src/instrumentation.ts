import { E2E_BUILD } from '@/shared/dev-helpers';

/**
 * Runs once when a server instance starts (Next.js instrumentation): the job runner, on the Node.js
 * runtime only, and not during `next build`. `JOBS_DISABLED=1` turns it off.
 * The e2e build (src/shared/dev-helpers.ts) refuses to start unless it serves this machine only: APP_URL on
 * localhost, and the server listening on loopback (src/platform/e2e-guard.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (E2E_BUILD) (await import('./platform/e2e-guard')).refuseUnlessLocal(process.env.APP_URL);
  if (process.env.JOBS_DISABLED === '1') return;
  const [{ startJobRunner }, { db }, { startRealtimeListener }, { startOutboxWake }] = await Promise.all([
    import('./modules/jobs/runner'),
    import('./platform/db/client'),
    import('./platform/realtime/listener'),
    import('./modules/realtime/wake'),
  ]);
  startJobRunner(db);
  // Live notices (completion plan 7.1): this server's one LISTEN connection, and the dispatcher woken by it.
  startRealtimeListener();
  startOutboxWake(db);
}
