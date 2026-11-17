import { createHmac, timingSafeEqual } from 'node:crypto';
import { CONTACT_REVERT_DAYS, routes } from '@/contracts';

/**
 * The "Not you?" link in an email or phone change notice (completion plan 5.23), sent to the old address or
 * number. It names one change (a `contact_change_reverts` row) and is signed with the app secret over everything
 * about that change, so it can't be pointed at another change, another account or a later expiry. Nothing secret
 * is stored: the row keeps only its id, and the signature is recomputed when the link comes back. Expiry and
 * single use are the row's; `checkContactRevertLink` decides from both.
 */

export { CONTACT_REVERT_DAYS };
export const CONTACT_REVERT_MS = CONTACT_REVERT_DAYS * 24 * 60 * 60 * 1000;

export interface ContactRevertClaim {
  id: string;
  userId: string;
  kind: 'email' | 'phone';
  expiresAt: Date;
}

const ID = /^ccr_[0-9a-f]{32}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{43}$/;

const secret = (env: Record<string, string | undefined> = process.env) => env.BETTER_AUTH_SECRET ?? 'dev-only-secret';

function signature(claim: ContactRevertClaim, key: string): string {
  return createHmac('sha256', key).update(`contact-revert:${claim.id}:${claim.userId}:${claim.kind}:${claim.expiresAt.getTime()}`).digest('base64url');
}

export function contactRevertToken(claim: ContactRevertClaim, key = secret()): string {
  return `${claim.id}.${signature(claim, key)}`;
}

/** The change a link names, before its row is loaded; null for anything that isn't a link of this shape. */
export function contactRevertIdOf(token: unknown): string | null {
  if (typeof token !== 'string' || token.length > 100) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [id, given] = parts as [string, string];
  return ID.test(id) && SIGNATURE.test(given) ? id : null;
}

/** Whether `token` is the link for this change (compared in constant time). */
export function contactRevertTokenMatches(token: string, claim: ContactRevertClaim, key = secret()): boolean {
  const expected = Buffer.from(signature(claim, key));
  const given = Buffer.from(contactRevertIdOf(token) === claim.id ? token.slice(claim.id.length + 1) : '');
  // Same length always (43 characters), so a wrong signature costs the same comparison as a right one.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type ContactRevertCheck = { ok: true } | { ok: false; reason: 'invalid' | 'used' | 'expired' };

/**
 * Whether the link can be used now. The signature is checked first, so a link that wasn't signed for this row
 * learns nothing about it; then single use, then expiry. `row` is null when no change has the link's id.
 */
export function checkContactRevertLink(token: string, row: (ContactRevertClaim & { usedAt: Date | null }) | null, now: Date, key = secret()): ContactRevertCheck {
  if (!row || !contactRevertTokenMatches(token, row, key)) return { ok: false, reason: 'invalid' };
  if (row.usedAt) return { ok: false, reason: 'used' };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true };
}

/** Where the link goes: a page that asks first, so a mail scanner opening it changes nothing. */
export function contactRevertUrl(appUrl: string, claim: ContactRevertClaim, key = secret()): string {
  return `${appUrl}${routes.contactRevert(contactRevertToken(claim, key))}`;
}
