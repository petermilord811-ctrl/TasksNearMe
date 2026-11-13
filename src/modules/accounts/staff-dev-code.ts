import { isLocalRequest } from '@/shared/local-request';

/**
 * Whether the staff two-step check runs as in production, without the development code (123456): always in
 * production builds, and on a dev server for any request that isn't from this machine (a public proxy in front
 * of it). The verify page and its actions use the same answer, so the page never offers a code the action
 * would refuse.
 */
export function staffCheckIsStrict(nodeEnv: string | undefined, header: (name: string) => string | null | undefined): boolean {
  return nodeEnv === 'production' || !isLocalRequest(header);
}
