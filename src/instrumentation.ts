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
  // A production server's console lines carry no query values, addresses, emails, phones or secrets (src/platform/redact.ts).
  if (process.env.NODE_ENV === 'production') (await import('./platform/redact')).installConsoleRedaction();
  if (E2E_BUILD) (await import('./platform/e2e-guard')).refuseUnlessLocal(process.env.APP_URL);
  // A stopping server (a deploy's restart) ends its event streams, so Next's shutdown, which waits for every open
  // connection, takes a moment instead of the 90 s systemd allows (d8, 2026-11-24: 502s all along). Next's own SIGTERM
  // handler stops new connections; the browsers reconnect to the next server.
  // (With NEXT_MANUAL_SIG_HANDLE Next installs no handler, and a listener here would keep SIGTERM from stopping it.)
  if (!process.env.NEXT_MANUAL_SIG_HANDLE) {
    const { endOpenStreams } = await import('./platform/realtime/sse');
    process.once('SIGTERM', () => {
      const ended = endOpenStreams();
      if (ended > 0) console.info(`[realtime] stopping: ended ${ended} event stream${ended === 1 ? '' : 's'}`);
    });
  }
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
