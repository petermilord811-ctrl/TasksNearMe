import 'server-only';

/**
 * The e2e build (src/shared/dev-helpers.ts) refuses to start unless APP_URL is a localhost address, so it can't be
 * deployed by mistake. Called from src/instrumentation.ts on the Node.js runtime only, since it exits the process.
 */
export function refuseUnlessLocal(appUrl: string | undefined): void {
  if (/^http:\/\/localhost(:\d+)?$/.test(appUrl ?? '')) return;
  console.error(`This is the e2e build (TNM_E2E_BUILD=1). It serves http://localhost only, and APP_URL is ${appUrl ?? 'unset'}.`);
  process.exit(1);
}
