/**
 * The e2e suite's production build (`npm run e2e:build`): made with TNM_E2E_BUILD=1, which next.config.ts inlines
 * at build time, so no variable set at run time can switch it on in another build. It serves only requests made
 * on this machine (src/proxy.ts answers 404 to everything else) and is never deployed.
 */
export const E2E_BUILD = process.env.TNM_E2E_BUILD === '1';

/**
 * Whether the development helpers are on: the stand-in providers used when a provider's key is missing (payments,
 * the email and text outboxes, the AI writers and readers, geocoding, gift cards, Google and Microsoft sign-in,
 * Turnstile), the dev tools under /dev, and the staff dev code. On in `next dev` and in the e2e build; off in every
 * other production build. `env` lets tests pass a NODE_ENV; the e2e flag comes only from the build.
 */
export function devHelpersOn(env: { NODE_ENV?: string } = process.env): boolean {
  return env.NODE_ENV !== 'production' || E2E_BUILD;
}
