import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { IdentityCaptureDetails, TimeZone } from '@/contracts';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { addressVerifications } from './schema';
import { calendarDate, IDENTITY_CAPTURE_RULES, localToday, namesMatch } from './standing';

/**
 * How an ID's details compare with the account (owner, 2026-11-21: "check it's matched with current user's name and
 * address or birthday"): the legal name (the same rule as the provider's check), the home address on file, 18 or
 * older, and not expired. The account keeps no birth date, so the birth date feeds the age only. Used by the reading
 * job (from the barcode on the back, stored as yes/no answers only) and by the staff view of the details (read
 * again when staff ask, never stored).
 */

export interface PostalAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
}

/** Street words written either way: "Street" and "St", "North" and "N", "Avenue" and "Ave". */
const STREET_WORDS: Record<string, string> = {
  street: 'st', str: 'st', avenue: 'ave', av: 'ave', road: 'rd', boulevard: 'blvd', lane: 'ln', drive: 'dr', court: 'ct',
  place: 'pl', terrace: 'ter', circle: 'cir', parkway: 'pkwy', highway: 'hwy', trail: 'trl', square: 'sq', way: 'way',
  north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
};

/** The street part of a line without its unit ("Apt 12", "#4", "Suite 300"), folded for comparing. */
function streetKey(line: string): string {
  const folded = line.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const withoutUnit = folded.replace(/(?:\s|,)(?:apt|apartment|unit|suite|ste|#)\b.*$|\s#\s*\w+.*$/, '');
  return withoutUnit.replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean).map((word) => STREET_WORDS[word] ?? word).join(' ');
}

const zip5 = (zip: string) => zip.replace(/\D/g, '').slice(0, 5);

/**
 * The same place: the same 5-digit ZIP, house number and street (St and Street, N and North alike). The unit and the
 * city's spelling don't count: one ZIP can carry several city names, and a barcode may hold the unit on its own line.
 */
export function sameAddress(a: PostalAddress, b: PostalAddress): boolean {
  const zip = zip5(a.zip);
  if (zip.length !== 5 || zip !== zip5(b.zip)) return false;
  const street = streetKey(a.line1);
  return /^\d/.test(street) && street === streetKey(b.line1);
}

/** Whole years from a YYYY-MM-DD birth date to `today`; a Feb 29 birthday counts on Mar 1 in a common year. */
export function ageOn(dateOfBirth: string, today: { year: number; month: number; day: number }): number | undefined {
  const born = calendarDate(dateOfBirth);
  if (!born) return undefined;
  const hadBirthday = today.month > born.month || (today.month === born.month && today.day >= born.day);
  return today.year - born.year - (hadBirthday ? 0 : 1);
}

/** The comparison for a set of details, on the person's market's clock. */
export function compareIdDetails(
  details: { givenNames: string; surname: string; dateOfBirth: string; expiryDate: string; address?: PostalAddress | undefined },
  account: { firstName: string; lastName: string },
  home: PostalAddress | null,
  now: Date,
  timeZone: TimeZone,
): { age: number | undefined; matches: IdentityCaptureDetails['matches'] } {
  const today = localToday(now, timeZone);
  const age = ageOn(details.dateOfBirth, today);
  const expires = calendarDate(details.expiryDate);
  const dayNumber = (date: { year: number; month: number; day: number }) => date.year * 10_000 + date.month * 100 + date.day;
  return {
    age,
    matches: {
      name: namesMatch(account, { firstName: details.givenNames, lastName: details.surname }),
      address: home && details.address ? sameAddress(details.address, home) : null,
      adult: age !== undefined && age >= IDENTITY_CAPTURE_RULES.adultAge,
      // An ID is good through its expiry date.
      notExpired: expires !== undefined && dayNumber(today) <= dayNumber(expires),
    },
  };
}

/** The person's home address on file: their newest address check that holds one (in review or verified), decrypted. */
export async function homeAddressOf(db: Db, cipher: FieldCipher | null | undefined, userId: string): Promise<PostalAddress | null> {
  if (!cipher) return null;
  const [row] = await db
    .select({ ciphertext: addressVerifications.addressCiphertext })
    .from(addressVerifications)
    .where(and(eq(addressVerifications.userId, userId), isNotNull(addressVerifications.addressCiphertext), inArray(addressVerifications.status, ['in_review', 'verified'])))
    .orderBy(desc(addressVerifications.createdAt))
    .limit(1);
  if (!row?.ciphertext) return null;
  try {
    return JSON.parse(cipher.decrypt(row.ciphertext)) as PostalAddress;
  } catch {
    return null;
  }
}
