import { createHmac } from 'node:crypto';
import { CHECKABLE_PROMPTS } from '@/integrations/ocr/face';
import type {
  AddressDocumentType,
  AddressRejectionReason,
  AddressVerificationStatus,
  BackgroundAdjudication,
  BackgroundCheckStatus,
  IdentityBlockedReason,
  IdentityDocumentType,
  IdentityFailureReason,
  IdentityRequestReason,
  IdentityStatus,
  LivenessPrompt,
} from '@/contracts';
import type { TimeZone } from '@/contracts';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';

/**
 * Where each verification track stands, as pure functions of its rows (blueprint 06 §1, extended
 * 2026-11-12). The latest row is the current one; "request" rows (no provider reference) start a track
 * again: the earlier verification stops counting and the attempt count resets.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const IDENTITY_RULES = {
  /** Tries per rolling 24 hours. */
  perDay: 3,
  /** Tries without a pass before our team looks at it. */
  total: 5,
  /** A hosted session nobody finished is closed after this long. */
  staleHours: 48,
} as const;

/**
 * The ID a helper verified with runs out (plan 6.3): we keep only its expiry month and year (from our own
 * check's reading), so it counts until that month ends in Austin. A new check is asked for this long
 * before; the helper stays bookable until the month ends, then not until a new check passes.
 */
export const ID_EXPIRY_RULES = {
  noticeDays: 30,
} as const;

/**
 * The first instant after an ID's expiry month, in the person's own market zone (an ID is good through its expiry
 * date, a calendar date where they live; completion plan 8.1).
 */
export function idExpiresAt(month: number, year: number, timeZone: TimeZone): Date | undefined {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2200) return undefined;
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return new Date(marketLocalToUtc(`${next.year}-${String(next.month).padStart(2, '0')}-01`, '00:00', timeZone));
}

/** The 30-day notice (and the new check it asks for) is due. */
export const idExpiryNoticeDue = (expiresAt: Date, now: Date) => now.getTime() >= expiresAt.getTime() - ID_EXPIRY_RULES.noticeDays * DAY_MS;

export const BACKGROUND_RULES = {
  /** A clear (or approved) check counts this long. */
  validDays: 365,
  /** A renewal can start this long before the current check runs out. */
  renewalDays: 30,
  /** Checkr's invitation link works this long. */
  invitationDays: 7,
  /** After the pre-adverse notice, the person has this long to dispute before a final decision. */
  disputeDays: 7,
} as const;

export const ADDRESS_RULES = {
  /** Documents are deleted this long after the decision. */
  documentRetentionDays: 30,
  /** Staff aim to decide within this long. */
  responseTargetHours: 48,
} as const;

/** Our own ID check (stage 1, added 2026-11-13). Its tries count toward `IDENTITY_RULES`. */
export const IDENTITY_CAPTURE_RULES = {
  /**
   * The photos and what was read from the ID are kept, encrypted, for our team's review this long after the decision
   * (owner, 2026-11-27: "store DL infos and images for further possible manual review"; Texas CUBI allows up to a year
   * after the purpose ends), then deleted; at once for a canceled try or a deleted account.
   */
  photoRetentionDays: 365,
  /** Staff aim to decide within this long. */
  responseTargetHours: 48,
  /** The age a helper must be. */
  adultAge: 18,
} as const;

// ---- Identity -------------------------------------------------------------------------------------

export interface IdentityRow {
  id: string;
  status: string;
  providerSessionId: string | null;
  failureReason: string | null;
  isAdult: boolean | null;
  nameMatches: boolean | null;
  nameConfirmedAt: Date | null;
  verifiedAt: Date | null;
  requestedReason: string | null;
  /** Staff's decision on a double check that didn't confirm our approval (`retry_allowed`, `rejected`). */
  reviewOutcome?: string | null;
  /** On an `id_expiring` request row: 1 once the helper was told the ID runs out, 2 once told it has. */
  expiryNotices?: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A try at our own ID check (stage 1). */
export interface CaptureRow {
  id: string;
  status: string; // submitted | approved | rejected | canceled
  documentType: string;
  rejectionReason: string | null;
  submittedAt: Date;
  decidedAt: Date | null;
  /** The reading's answers: only the expiry month and year are used here (the ID's expiry, 6.3). */
  autoCheck?: { expiresMonth?: number; expiresYear?: number } | null;
  /** Another account has the same ID (6.3), until staff clear it. */
  duplicateOfUserId?: string | null;
  duplicateClearedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdentityStanding {
  /** The provider's check (not_started while none ran since the last reset). */
  status: IdentityStatus;
  /** The latest check is verified (a name check may still be open). */
  verified: boolean;
  /** Verified, and the name matched or our team confirmed it: counts toward bookable. */
  cleared: boolean;
  verifiedAt?: Date;
  failureReason?: IdentityFailureReason;
  nameCheck?: 'in_review';
  requested?: IdentityRequestReason;
  blocked?: IdentityBlockedReason;
  retryAt?: Date;
  /** Tries since the last reset: our own check's photos and the provider's sessions. */
  attempts: number;
  /** The provider's check may start (or continue) as far as the limits go. Helpers also need `captureApproved`. */
  canStart: boolean;
  /** For the staff queue: waiting on our team since then (a name check, or too many tries). */
  reviewSince?: Date;
  /** The row the status describes. */
  latest?: IdentityRow;
  /** Our own check's latest try since the last reset. */
  capture?: CaptureRow;
  /** Our team approved photos since the last reset: the provider's double check can open. */
  captureApproved: boolean;
  /** New photos can be sent now (not verified, not paused, nothing in review or approved). */
  canCapture: boolean;
  /** With `blocked: double_check_review`: the provider's session that didn't confirm the approved photos. */
  doubleCheck?: IdentityRow;
  /** With `blocked: duplicate_id`: the photos whose ID is on another account too. */
  duplicate?: CaptureRow;
  /** Verified: when the ID behind it runs out (the end of its expiry month), when we know it. */
  expiresAt?: Date;
  /**
   * A new check asked for because the ID runs out (`id_expiring`): the verification before it still counts
   * (`cleared`, `verifiedAt`) until `countsUntil`.
   */
  renewal?: { countsUntil: Date };
}

const byCreated = <T extends { createdAt: Date }>(rows: readonly T[]) => [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

function asRequestReason(value: string | null): IdentityRequestReason | undefined {
  return value === 'staff_request' || value === 'name_changed' || value === 'id_expiring' ? value : undefined;
}

/**
 * When the ID behind a verified session runs out: the expiry month of the photos our team approved for it
 * (the newest approved capture in its window, from `windowStart`, made before the session).
 */
function verificationExpiry(session: IdentityRow, captures: readonly CaptureRow[], windowStart: number, timeZone: TimeZone): Date | undefined {
  const approval = captures.findLast((row) => row.status === 'approved' && row.createdAt.getTime() >= windowStart && row.createdAt.getTime() <= session.createdAt.getTime());
  const month = approval?.autoCheck?.expiresMonth;
  const year = approval?.autoCheck?.expiresYear;
  return month && year ? idExpiresAt(month, year, timeZone) : undefined;
}

/**
 * Where the ID check stands. `captures` are our own check's tries (helpers; clients have none): each one
 * counts toward the limits like a provider session, a capture in review is in flight like a processing
 * session, and an approved one isn't a failed try. The provider's verified result is what verifies, so
 * helpers verified before stage 1 existed stay verified without a capture.
 */
/** `timeZone`: the person's own (their home market's), where their ID's dates are calendar dates. */
export function identityStanding(rows: readonly IdentityRow[], now: Date, captures: readonly CaptureRow[], timeZone: TimeZone): IdentityStanding {
  const ordered = byCreated(rows);
  const latest = ordered.at(-1);
  const resetIndex = ordered.findLastIndex((row) => row.providerSessionId === null);
  const reset = resetIndex >= 0 ? ordered[resetIndex] : undefined;
  const resetAt = reset ? reset.createdAt.getTime() : Number.NEGATIVE_INFINITY;
  const sessions = ordered.slice(resetIndex + 1);
  const allCaptures = byCreated(captures);
  // A capture sent the moment a new check was asked for belongs to the new check.
  const currentCaptures = allCaptures.filter((row) => row.createdAt.getTime() >= resetAt);
  const capture = currentCaptures.at(-1);
  const captureApproved = currentCaptures.some((row) => row.status === 'approved');
  const captureInReview = capture?.status === 'submitted';
  const attempts = sessions.length + currentCaptures.length;
  const isRequest = latest?.providerSessionId === null;
  const status: IdentityStatus = !latest || isRequest ? 'not_started' : (latest.status as IdentityStatus);
  const verified = status === 'verified';
  const nameOpen = verified && latest!.nameMatches === false && latest!.nameConfirmedAt === null;

  const standing: IdentityStanding = {
    status,
    verified,
    cleared: verified && !nameOpen,
    attempts,
    canStart: false,
    captureApproved,
    canCapture: false,
    ...(latest ? { latest } : {}),
    ...(capture ? { capture } : {}),
    ...(verified && latest!.verifiedAt ? { verifiedAt: latest!.verifiedAt } : {}),
    ...(status === 'requires_input' && latest!.failureReason ? { failureReason: latest!.failureReason as IdentityFailureReason } : {}),
    ...(nameOpen ? { nameCheck: 'in_review' as const, reviewSince: latest!.verifiedAt ?? latest!.updatedAt } : {}),
  };
  if (isRequest) {
    const requested = asRequestReason(latest!.requestedReason);
    if (requested) standing.requested = requested;
  }
  if (verified) {
    // The ID behind it runs out at the end of its expiry month (6.3): from then on it doesn't count.
    const expiresAt = verificationExpiry(latest!, allCaptures, resetAt, timeZone);
    if (expiresAt) {
      standing.expiresAt = expiresAt;
      if (now.getTime() >= expiresAt.getTime()) {
        standing.cleared = false;
        standing.requested = 'id_expired';
      }
    }
    return standing;
  }

  // A new check asked for because the ID runs out: the verification before it counts until the ID's
  // expiry month ends (the helper stays bookable meanwhile), then not until the new check passes.
  if (reset?.requestedReason === 'id_expiring') {
    const previousResetIndex = ordered.slice(0, resetIndex).findLastIndex((row) => row.providerSessionId === null);
    const previousResetAt = previousResetIndex >= 0 ? ordered[previousResetIndex]!.createdAt.getTime() : Number.NEGATIVE_INFINITY;
    const counted = ordered.slice(previousResetIndex + 1, resetIndex).at(-1);
    const countedClears = counted?.status === 'verified' && (counted.nameMatches !== false || counted.nameConfirmedAt !== null);
    const countsUntil = counted && countedClears ? verificationExpiry(counted, allCaptures, previousResetAt, timeZone) : undefined;
    if (countsUntil && now.getTime() < countsUntil.getTime()) {
      standing.renewal = { countsUntil };
      standing.cleared = true;
      if (counted!.verifiedAt) standing.verifiedAt = counted!.verifiedAt;
    } else if (standing.requested === 'id_expiring') {
      standing.requested = 'id_expired';
    }
  }

  const under18 = sessions.some((row) => row.failureReason === 'under_18' || row.isAdult === false) || currentCaptures.some((row) => row.status === 'rejected' && row.rejectionReason === 'under_18');
  const failures = [
    ...sessions.filter((row) => row.status === 'requires_input' || row.status === 'canceled').map((row) => row.updatedAt),
    ...currentCaptures.filter((row) => row.status === 'rejected' || row.status === 'canceled').map((row) => row.decidedAt ?? row.updatedAt),
  ].sort((a, b) => a.getTime() - b.getTime());
  // Tries in the last 24 hours that didn't pass (approved photos aren't one).
  const lastDay = [...sessions.map((row) => row.createdAt), ...currentCaptures.filter((row) => row.status !== 'approved').map((row) => row.createdAt)]
    .filter((at) => now.getTime() - at.getTime() < DAY_MS)
    .sort((a, b) => a.getTime() - b.getTime());
  const inFlight = status === 'processing' || captureInReview;
  // The double check (the provider, after our team approved the photos) ended without a pass: our team
  // looks at both before anything else happens, unless they already decided.
  const approval = currentCaptures.findLast((row) => row.status === 'approved');
  const approvedAt = approval ? (approval.decidedAt ?? approval.createdAt).getTime() : Number.POSITIVE_INFINITY;
  const lastDoubleCheck = sessions.filter((row) => row.createdAt.getTime() >= approvedAt).at(-1);
  const doubleCheckFailed = lastDoubleCheck?.status === 'requires_input' && !lastDoubleCheck.reviewOutcome;
  // The ID on photos in review or approved is on another account too (6.3): the double check waits for staff.
  const duplicate = currentCaptures.findLast((row) => !!row.duplicateOfUserId && !row.duplicateClearedAt && (row.status === 'submitted' || row.status === 'approved'));
  if (under18) standing.blocked = 'under_18';
  else if (duplicate) {
    standing.blocked = 'duplicate_id';
    standing.duplicate = duplicate;
    standing.reviewSince = duplicate.submittedAt;
  } else if (doubleCheckFailed) {
    standing.blocked = 'double_check_review';
    standing.doubleCheck = lastDoubleCheck;
    standing.reviewSince = lastDoubleCheck.updatedAt;
  } else if (failures.length >= IDENTITY_RULES.total && !inFlight) {
    standing.blocked = 'too_many_attempts';
    standing.reviewSince = failures.at(-1)!;
  } else if (lastDay.length >= IDENTITY_RULES.perDay && !inFlight) {
    standing.blocked = 'try_later';
    standing.retryAt = new Date(lastDay[0]!.getTime() + DAY_MS);
  }
  standing.canStart = !standing.blocked;
  standing.canCapture = !standing.blocked && !captureInReview && !captureApproved;
  // A renewal that turns up something for our team to look at (a minor, the same ID elsewhere, a double
  // check that didn't confirm) pauses the helper instead of waiting for the month to end.
  if (standing.renewal && (standing.blocked === 'under_18' || standing.blocked === 'duplicate_id' || standing.blocked === 'double_check_review')) {
    delete standing.renewal;
    delete standing.verifiedAt;
    standing.cleared = false;
  }
  return standing;
}

/** Hosted ID sessions nobody finished within 48 hours (they're closed so a new one can start). */
export function identitySessionIsStale(row: Pick<IdentityRow, 'status' | 'providerSessionId' | 'createdAt'>, now: Date): boolean {
  return row.providerSessionId !== null && row.status === 'processing' && now.getTime() - row.createdAt.getTime() >= IDENTITY_RULES.staleHours * HOUR_MS;
}

/** "Robert O'Neil-Smith" and "robert oneil smith" are the same name; accents and punctuation don't count. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether the ID's name matches the account's legal name: the same last name (ignoring accents,
 * punctuation and hyphens) and a first name that is the same or starts the other (Alex / Alexandra).
 * Anything else goes to a staff name check.
 */
export function namesMatch(account: { firstName: string; lastName: string }, verified: { firstName: string; lastName: string }): boolean {
  const accountLast = normalizeName(account.lastName).replace(/\s/g, '');
  const verifiedLast = normalizeName(verified.lastName).replace(/\s/g, '');
  const accountFirst = normalizeName(account.firstName).split(' ')[0] ?? '';
  const verifiedFirst = normalizeName(verified.firstName).split(' ')[0] ?? '';
  if (!accountLast || !accountFirst || accountLast !== verifiedLast) return false;
  return accountFirst === verifiedFirst || (accountFirst.length >= 3 && verifiedFirst.startsWith(accountFirst)) || (verifiedFirst.length >= 3 && accountFirst.startsWith(verifiedFirst));
}

// ---- Our own ID check (stage 1) -------------------------------------------------------------------

/**
 * The selfie's prompt for a person's next try: a keyed hash of who and which try, so it can't be
 * predicted, and reloading the page (or sending the form again) doesn't change it. `tries` counts every
 * capture the person sent, so each new try gets its own.
 */
export function livenessPromptFor(userId: string, tries: number, secret: string): LivenessPrompt {
  // Since 2026-11-27 only the turns our server can check from the face's pose (face.ts); older tries kept theirs.
  const digest = createHmac('sha256', secret).update(`tnm.liveness.v2.${userId}.${tries}`).digest();
  return CHECKABLE_PROMPTS[digest.readUInt32BE(0) % CHECKABLE_PROMPTS.length]!;
}

/** Whether a capture's photos are due for deletion: a year after the decision, or at once when it was canceled. */
export function capturePhotosDue(row: { status: string; decidedAt: Date | null; filesDeletedAt: Date | null; hasFiles: boolean }, now: Date): boolean {
  if (!row.hasFiles || row.filesDeletedAt !== null) return false;
  if (row.status === 'canceled') return true;
  return row.decidedAt !== null && now.getTime() - row.decidedAt.getTime() >= IDENTITY_CAPTURE_RULES.photoRetentionDays * DAY_MS;
}

/** What a reader made out of an ID, held only in memory (`deriveIdentityAutoCheck` keeps the answers). */
export interface IdentityReading {
  readable: boolean;
  givenNames?: string;
  surname?: string;
  /** YYYY-MM-DD. */
  dateOfBirth?: string;
  /** YYYY-MM-DD. */
  expiryDate?: string;
  documentType?: IdentityDocumentType | 'other';
  issuingState?: string;
}

export interface IdentityAutoCheckAnswers {
  readable: boolean;
  nameMatches?: boolean;
  isAdult?: boolean;
  notExpired?: boolean;
  expiresMonth?: number;
  expiresYear?: number;
  documentType?: IdentityDocumentType | 'other';
}

/** A real calendar date from "YYYY-MM-DD" (anything else, or Feb 30, is no date). */
export function calendarDate(value: string | undefined): { year: number; month: number; day: number } | undefined {
  const match = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return { year, month, day };
}

/** Today's date where the person lives (their market's zone), as the ID's dates are calendar dates there. */
export function localToday(now: Date, timeZone: TimeZone): { year: number; month: number; day: number } {
  const [year, month, day] = marketDayKey(now, timeZone).split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

const dayNumber = (date: { year: number; month: number; day: number }) => date.year * 10_000 + date.month * 100 + date.day;

/**
 * The answers kept from a reading (stage 1): whether the name matches the account's legal name (the same
 * rule as the provider's check), 18 or older, not expired, and the expiry month and year. The name, birth
 * date and document number are never returned, so they're never stored.
 */
export function deriveIdentityAutoCheck(reading: IdentityReading, account: { firstName: string; lastName: string }, now: Date, timeZone: TimeZone): IdentityAutoCheckAnswers {
  if (!reading.readable) return { readable: false };
  const today = localToday(now, timeZone);
  const born = calendarDate(reading.dateOfBirth);
  const expires = calendarDate(reading.expiryDate);
  const nameMatches = reading.givenNames?.trim() && reading.surname?.trim() ? namesMatch(account, { firstName: reading.givenNames, lastName: reading.surname }) : undefined;
  // 18 on the 18th birthday (where they live); someone born on Feb 29 turns 18 on Mar 1 in a common year.
  const isAdult = born ? dayNumber(today) >= dayNumber({ year: born.year + IDENTITY_CAPTURE_RULES.adultAge, month: born.month, day: born.day }) : undefined;
  return {
    readable: true,
    ...(nameMatches !== undefined ? { nameMatches } : {}),
    ...(isAdult !== undefined ? { isAdult } : {}),
    // An ID is good through its expiry date.
    ...(expires ? { notExpired: dayNumber(today) <= dayNumber(expires), expiresMonth: expires.month, expiresYear: expires.year } : {}),
    ...(reading.documentType ? { documentType: reading.documentType } : {}),
  };
}

// ---- Address --------------------------------------------------------------------------------------

export interface AddressRow {
  id: string;
  status: string;
  documentType: string | null;
  documentFileId: string | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
}

export interface AddressStanding {
  status: AddressVerificationStatus;
  /** Counts toward bookable. */
  verified: boolean;
  verifiedAt?: Date;
  /** The verified row, while it counts. */
  verifiedRow?: AddressRow;
  /** The row the status describes (or the newer one in `update`). */
  latest?: AddressRow;
  rejectionReason?: AddressRejectionReason;
  documentType?: AddressDocumentType;
  update?: { status: 'in_review' | 'rejected'; rejectionReason?: AddressRejectionReason; row: AddressRow };
  canSubmit: boolean;
}

export function addressStanding(rows: readonly AddressRow[]): AddressStanding {
  const ordered = byCreated(rows).filter((row) => row.status !== 'withdrawn');
  const latest = ordered.at(-1);
  if (!latest) return { status: 'not_started', verified: false, canSubmit: true };
  const lastRequest = ordered.findLastIndex((row) => row.status === 'requested');
  const verifiedRow = ordered.slice(lastRequest + 1).findLast((row) => row.status === 'verified');
  const reason = (row: AddressRow) => (row.rejectionReason ? (row.rejectionReason as AddressRejectionReason) : undefined);
  const documentType = (row: AddressRow) => (row.documentType ? { documentType: row.documentType as AddressDocumentType } : {});

  if (latest.status === 'requested') return { status: 'requested', verified: false, latest, canSubmit: true };
  if (latest.status === 'verified') {
    return { status: 'verified', verified: true, verifiedRow: latest, latest, canSubmit: true, ...(latest.decidedAt ? { verifiedAt: latest.decidedAt } : {}), ...documentType(latest) };
  }
  const pending = latest.status === 'in_review' ? ('in_review' as const) : ('rejected' as const);
  if (verifiedRow) {
    return {
      status: 'verified',
      verified: true,
      verifiedRow,
      latest: verifiedRow,
      ...(verifiedRow.decidedAt ? { verifiedAt: verifiedRow.decidedAt } : {}),
      ...documentType(verifiedRow),
      update: { status: pending, row: latest, ...(reason(latest) ? { rejectionReason: reason(latest) } : {}) },
      canSubmit: pending === 'rejected',
    };
  }
  return {
    status: pending,
    verified: false,
    latest,
    ...documentType(latest),
    ...(pending === 'rejected' && reason(latest) ? { rejectionReason: reason(latest) } : {}),
    canSubmit: pending === 'rejected',
  };
}

/** Whether a decided proof's document is due for deletion. */
export function addressDocumentDue(row: { documentFileId: string | null; decidedAt: Date | null; status: string }, now: Date): boolean {
  if (!row.documentFileId) return false;
  if (row.status === 'withdrawn') return true;
  return row.decidedAt !== null && now.getTime() - row.decidedAt.getTime() >= ADDRESS_RULES.documentRetentionDays * DAY_MS;
}

// ---- Background -----------------------------------------------------------------------------------

export interface BackgroundRow {
  id: string;
  status: string;
  providerRef: string | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  invitationExpiresAt: Date | null;
  adjudication: string | null;
  preAdverseAt: Date | null;
  createdAt: Date;
}

export interface BackgroundStanding {
  /** The latest check's status, with expiry applied (`not_started` when there's none). */
  status: BackgroundCheckStatus;
  /** A clear or approved check that hasn't run out: in-home categories are open. */
  eligible: boolean;
  /** The public badge's date: only a clear check (not one approved after review). */
  badgeAt?: Date;
  validUntil?: Date;
  renewalOpen: boolean;
  adjudication?: BackgroundAdjudication;
  disputeUntil?: Date;
  invitationExpiresAt?: Date;
  canStart: boolean;
  latest?: BackgroundRow;
  /** The check that makes the helper eligible. */
  eligibleRow?: BackgroundRow;
}

function counts(row: BackgroundRow, now: Date): boolean {
  const approved = row.status === 'clear' || (row.status === 'consider' && row.adjudication === 'engaged');
  return approved && row.expiresAt !== null && row.expiresAt > now;
}

export function backgroundStanding(rows: readonly BackgroundRow[], now: Date): BackgroundStanding {
  const ordered = byCreated(rows);
  const latest = ordered.at(-1);
  const eligibleRow = ordered.findLast((row) => counts(row, now));
  const validUntil = eligibleRow?.expiresAt ?? undefined;
  const renewalOpen = validUntil !== undefined && validUntil.getTime() - now.getTime() <= BACKGROUND_RULES.renewalDays * DAY_MS;
  const base = {
    eligible: eligibleRow !== undefined,
    renewalOpen,
    ...(eligibleRow ? { eligibleRow } : {}),
    ...(validUntil ? { validUntil } : {}),
    ...(eligibleRow?.status === 'clear' && eligibleRow.completedAt ? { badgeAt: eligibleRow.completedAt } : {}),
  };
  if (!latest || latest.providerRef === null) return { ...base, status: 'not_started', canStart: !eligibleRow || renewalOpen, ...(latest ? { latest } : {}) };

  let status = latest.status as BackgroundCheckStatus;
  const approved = latest.status === 'clear' || (latest.status === 'consider' && latest.adjudication === 'engaged');
  if (approved && latest.expiresAt !== null && latest.expiresAt <= now) status = 'expired';
  if (latest.status === 'invited' && latest.invitationExpiresAt !== null && latest.invitationExpiresAt <= now) status = 'expired';

  const adjudication = latest.status === 'consider' && latest.adjudication ? (latest.adjudication as BackgroundAdjudication) : undefined;
  const inFlight = status === 'invited' || status === 'pending' || status === 'suspended';
  const inReview = status === 'consider' && adjudication !== 'engaged';
  const canStart = !inFlight && !inReview && (!eligibleRow || renewalOpen);
  return {
    ...base,
    status,
    latest,
    canStart,
    ...(adjudication ? { adjudication } : {}),
    ...(adjudication === 'pre_adverse' && latest.preAdverseAt ? { disputeUntil: new Date(latest.preAdverseAt.getTime() + BACKGROUND_RULES.disputeDays * DAY_MS) } : {}),
    ...(status === 'invited' && latest.invitationExpiresAt ? { invitationExpiresAt: latest.invitationExpiresAt } : {}),
  };
}

/** Renewal notices: 1 at 30 days before the check runs out, 2 at 7 days, 3 when it has. */
export function backgroundNoticeDue(row: { expiresAt: Date | null; expiryNotices: number }, now: Date): 1 | 2 | 3 | null {
  if (!row.expiresAt) return null;
  const left = row.expiresAt.getTime() - now.getTime();
  if (left <= 0) return row.expiryNotices < 3 ? 3 : null;
  if (left <= 7 * DAY_MS) return row.expiryNotices < 2 ? 2 : null;
  if (left <= BACKGROUND_RULES.renewalDays * DAY_MS) return row.expiryNotices < 1 ? 1 : null;
  return null;
}
