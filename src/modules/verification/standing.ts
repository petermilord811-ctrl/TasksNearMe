import type {
  AddressDocumentType,
  AddressRejectionReason,
  AddressVerificationStatus,
  BackgroundAdjudication,
  BackgroundCheckStatus,
  IdentityBlockedReason,
  IdentityFailureReason,
  IdentityRequestReason,
  IdentityStatus,
} from '@/contracts';

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
  createdAt: Date;
  updatedAt: Date;
}

export interface IdentityStanding {
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
  /** Provider sessions since the last reset. */
  attempts: number;
  canStart: boolean;
  /** For the staff queue: waiting on our team since then. */
  reviewSince?: Date;
  /** The row the status describes. */
  latest?: IdentityRow;
}

const byCreated = <T extends { createdAt: Date }>(rows: readonly T[]) => [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

function asRequestReason(value: string | null): IdentityRequestReason | undefined {
  return value === 'staff_request' || value === 'name_changed' ? value : undefined;
}

export function identityStanding(rows: readonly IdentityRow[], now: Date): IdentityStanding {
  const ordered = byCreated(rows);
  const latest = ordered.at(-1);
  if (!latest) return { status: 'not_started', verified: false, cleared: false, attempts: 0, canStart: true };

  const resetIndex = ordered.findLastIndex((row) => row.providerSessionId === null);
  const sessions = ordered.slice(resetIndex + 1);
  const attempts = sessions.length;
  const isRequest = latest.providerSessionId === null;
  const status: IdentityStatus = isRequest ? 'not_started' : (latest.status as IdentityStatus);
  const verified = status === 'verified';
  const nameOpen = verified && latest.nameMatches === false && latest.nameConfirmedAt === null;

  const standing: IdentityStanding = {
    status,
    verified,
    cleared: verified && !nameOpen,
    attempts,
    canStart: false,
    latest,
    ...(verified && latest.verifiedAt ? { verifiedAt: latest.verifiedAt } : {}),
    ...(status === 'requires_input' && latest.failureReason ? { failureReason: latest.failureReason as IdentityFailureReason } : {}),
    ...(nameOpen ? { nameCheck: 'in_review' as const, reviewSince: latest.verifiedAt ?? latest.updatedAt } : {}),
  };
  if (isRequest) {
    const requested = asRequestReason(latest.requestedReason);
    if (requested) standing.requested = requested;
  }
  if (verified) return standing;

  const under18 = sessions.some((row) => row.failureReason === 'under_18' || row.isAdult === false);
  const failed = sessions.filter((row) => row.status === 'requires_input' || row.status === 'canceled');
  const lastDay = sessions.filter((row) => now.getTime() - row.createdAt.getTime() < DAY_MS);
  if (under18) standing.blocked = 'under_18';
  else if (failed.length >= IDENTITY_RULES.total && status !== 'processing') {
    standing.blocked = 'too_many_attempts';
    standing.reviewSince = failed.at(-1)!.updatedAt;
  } else if (lastDay.length >= IDENTITY_RULES.perDay && status !== 'processing') {
    standing.blocked = 'try_later';
    standing.retryAt = new Date(lastDay[0]!.createdAt.getTime() + DAY_MS);
  }
  standing.canStart = !standing.blocked;
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
