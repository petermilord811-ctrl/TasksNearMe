/**
 * The app's secret (`BETTER_AUTH_SECRET`) for the links the app signs itself: unsubscribe links and "Not you?"
 * links (completion plan 5.23). It fails closed: in a production build an unset or empty secret throws when a link
 * is signed or checked, rather than signing with a value anyone can read in the source. Development and tests fall
 * back to a fixed stand-in. Read at each use, never when a module loads, so a build without the secret still builds.
 */

export const DEV_ONLY_SECRET = 'dev-only-secret';

export function appSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (env.NODE_ENV === 'production') throw new Error('BETTER_AUTH_SECRET is not set: signed links (unsubscribe, "Not you?") need it in production.');
  return DEV_ONLY_SECRET;
}
