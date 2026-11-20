import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Photo } from '@/contracts';
import { appSecret } from '@/platform/crypto/app-secret';
import { photoFromFile, photoSrc } from './photos';

/**
 * Staff open another person's private file only from a context that already carries a reason or a role (security
 * review SEC23/SEC24): a case they may load, a conversation they revealed with a reason, a task they moderate. The
 * page that shows the file mints this token for the staff member and the context; the file route takes it, checks
 * that the same staff member (role and this session's two-step) asks within the time, and audits the fetch with the
 * context. A file id pasted on its own opens nothing. Like the verification documents' links (verification/staff.ts),
 * signed with the app secret, under a purpose of its own.
 */

export const STAFF_FILE_TOKEN_MINUTES = 30;

export interface StaffFileClaim {
  fileId: string;
  staffUserId: string;
  /** Where the staff member saw it: `case:<id>`, `reveal:case:<id>`, `reveal:booking:<id>`, `moderation:task:<id>`. */
  context: string;
  expiresAt: Date;
}

const sign = (payload: string, key: string) => createHmac('sha256', key).update(`staff-file:${payload}`).digest('base64url');

export function staffFileToken(claim: StaffFileClaim, key = appSecret()): string {
  const payload = Buffer.from(JSON.stringify([claim.fileId, claim.staffUserId, claim.context, claim.expiresAt.getTime()])).toString('base64url');
  return `${payload}.${sign(payload, key)}`;
}

/** The claim in a token: null for a forged, malformed or expired one. */
export function readStaffFileToken(token: string, now: Date, key = appSecret()): Omit<StaffFileClaim, 'expiresAt'> | null {
  if (token.length > 600) return null;
  const [payload, signature, ...rest] = token.split('.');
  if (!payload || !signature || rest.length > 0) return null;
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const [fileId, staffUserId, context, expires] = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown[];
    if (typeof fileId !== 'string' || typeof staffUserId !== 'string' || typeof context !== 'string' || typeof expires !== 'number' || expires <= now.getTime()) return null;
    return { fileId, staffUserId, context };
  } catch {
    return null;
  }
}

/**
 * A file as a staff page shows it: its own photo when it's the staff member's, otherwise through a token for them and
 * this context (its widths keep it: the token rides along in the address).
 */
export function staffPhotoFromFile(
  file: { id: string; width: number; height: number; alt: string; ownerUserId: string },
  staff: { id: string },
  context: string,
  now: Date,
  key = appSecret(),
): Photo {
  if (file.ownerUserId === staff.id) return photoFromFile(file);
  const token = staffFileToken({ fileId: file.id, staffUserId: staff.id, context, expiresAt: new Date(now.getTime() + STAFF_FILE_TOKEN_MINUTES * 60_000) }, key);
  const src = photoSrc(file);
  return { ...photoFromFile(file), src: `${src}${src.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}` };
}
