import 'server-only';

/**
 * The e2e build (src/shared/dev-helpers.ts) keeps the development helpers on, including `/dev/sign-in`, which signs
 * in as anyone. It refuses to start unless it serves this machine only (called from src/instrumentation.ts on the
 * Node.js runtime, since it exits the process):
 * - APP_URL is a localhost address, so it can't be deployed by mistake;
 * - the server listens on loopback. `next start` without `--hostname` listens on every interface, and on this VPS
 *   nothing filters the port. Requests that reach it directly carry whatever Host and X-Forwarded-For the sender
 *   wants, so the request checks (src/shared/local-request.ts) can't tell them apart (security review 5.18).
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * The hostname the server listens on: `--hostname`/`-H` for `next start` (which ignores HOSTNAME), HOSTNAME for the
 * standalone server.js. Undefined when none is given, which means every interface.
 */
export function listenHostname(argv: readonly string[] = process.argv, env: Record<string, string | undefined> = process.env): string | undefined {
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === '--hostname' || arg === '-H') return argv[index + 1];
    if (arg.startsWith('--hostname=')) return arg.slice('--hostname='.length);
    if (arg.startsWith('-H') && arg.length > 2) return arg.slice(2);
  }
  const nextCli = argv.some((arg) => /(^|[/\\])next(\.js)?$/.test(arg));
  return nextCli ? undefined : env.HOSTNAME || undefined;
}

/** Why the e2e build mustn't start with these settings, or null when it may. */
export function e2eStartProblem(appUrl: string | undefined, hostname: string | undefined): string | null {
  if (!/^http:\/\/localhost(:\d+)?$/.test(appUrl ?? '')) return `It serves http://localhost only, and APP_URL is ${appUrl ?? 'unset'}.`;
  if (!hostname || !LOOPBACK.has(hostname.toLowerCase())) {
    return `It must listen on this machine only, and the hostname is ${hostname ?? 'unset (every interface)'}. Start it with \`next start --hostname localhost\` (npm run e2e:serve). Use localhost rather than 127.0.0.1: with 127.0.0.1 every English page redirects to itself.`;
  }
  return null;
}

export function refuseUnlessLocal(appUrl: string | undefined, hostname: string | undefined = listenHostname()): void {
  const problem = e2eStartProblem(appUrl, hostname);
  if (!problem) return;
  console.error(`This is the e2e build (TNM_E2E_BUILD=1). ${problem}`);
  process.exit(1);
}
