/**
 * Whether a request was made on this machine (a browser or test runner on localhost), rather than coming
 * through a reverse proxy such as the VPS's public Caddy address. Development tools that act as someone else
 * (`/dev/sign-in`, the email and text outbox, the Google and Microsoft stand-in, the test clock) answer only
 * these, so a dev server reachable from the internet can't be used to sign in as anyone.
 *
 * Next fills `x-forwarded-for` with the socket's address only when it's missing; a proxy sets it to the
 * visitor's address and passes the public host along. So a local request has only loopback addresses there
 * and a loopback host; anything else came from outside.
 */

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostnameOf(host: string): string {
  const value = host.trim().toLowerCase();
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1);
  return value.split(':')[0] ?? '';
}

export function isLocalRequest(header: (name: string) => string | null | undefined): boolean {
  const forwardedFor = (header('x-forwarded-for') ?? '').split(',').map((part) => part.trim()).filter(Boolean);
  if (forwardedFor.some((address) => !LOOPBACK_ADDRESSES.has(address))) return false;
  const hosts = [header('host'), header('x-forwarded-host')].filter((value): value is string => Boolean(value));
  return hosts.length > 0 && hosts.every((host) => LOOPBACK_HOSTS.has(hostnameOf(host)));
}
