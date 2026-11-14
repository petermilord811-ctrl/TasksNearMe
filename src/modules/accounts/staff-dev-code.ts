import { devHelpersOn } from '@/shared/dev-helpers';
import { isLocalRequest } from '@/shared/local-request';

/**
 * Whether the staff two-step check runs as in production, without the development code (123456): always in
 * production builds other than the e2e build (src/shared/dev-helpers.ts), and for any request that isn't from
 * this machine (a public proxy in front of it). The verify page and its actions use the same answer, so the page
 * never offers a code the action would refuse.
 */
export function staffCheckIsStrict(nodeEnv: string | undefined, header: (name: string) => string | null | undefined): boolean {
  return !devHelpersOn({ NODE_ENV: nodeEnv }) || !isLocalRequest(header);
}
