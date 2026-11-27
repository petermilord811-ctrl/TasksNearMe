import { ADDRESS_CHECK_KEYS, ID_CHECK_KEYS, type AddressCheckProgress, type CheckOutcome, type IdCheckProgress } from '@/contracts';

/**
 * Where a document stands on the flows' "Verifying…" screen (2026-11-27): canonical answers for previews and tests.
 * The person sees passed checks; anything else reads "Our team will look"; an automatic rejection gives one reason.
 */

const idChecks = (outcomes: Partial<Record<(typeof ID_CHECK_KEYS)[number], CheckOutcome>> = {}) =>
  ID_CHECK_KEYS.map((key) => ({ key, outcome: outcomes[key] ?? ('pass' as CheckOutcome) }));

const addressChecks = (outcomes: Partial<Record<(typeof ADDRESS_CHECK_KEYS)[number], CheckOutcome>> = {}) =>
  ADDRESS_CHECK_KEYS.map((key) => ({ key, outcome: outcomes[key] ?? ('pass' as CheckOutcome) }));

const SENT = '2026-11-27T15:00:00.000Z';

export const idProgressReading: IdCheckProgress = { kind: 'identity', phase: 'reading', documentType: 'drivers_license', checks: [], submittedAt: SENT };

/** Every check passed: our own check verified the ID (no provider double check is set up). */
export const idProgressVerified: IdCheckProgress = { kind: 'identity', phase: 'approved', documentType: 'drivers_license', checks: idChecks(), decidedBy: 'auto', next: 'verified', submittedAt: SENT };

/** Approved, and a provider double-checks next. */
export const idProgressDoubleCheck: IdCheckProgress = { ...idProgressVerified, next: 'double_check' };

/** The selfie's match and the prompt weren't sure: our team decides (the person sees "Our team will look"). */
export const idProgressReview: IdCheckProgress = { kind: 'identity', phase: 'review', documentType: 'drivers_license', checks: idChecks({ face_match: 'unsure', live: 'unsure' }), submittedAt: SENT };

/** The ID had run out: turned down at once, with its one reason. */
export const idProgressExpired: IdCheckProgress = {
  kind: 'identity',
  phase: 'rejected',
  documentType: 'drivers_license',
  checks: idChecks({ not_expired: 'fail', face_match: 'unsure', live: 'unsure' }),
  decidedBy: 'auto',
  rejectionReason: 'expired',
  canRetry: true,
  submittedAt: SENT,
};

/** A passport: no barcode, its machine-readable zone instead. */
export const idProgressPassportVerified: IdCheckProgress = { ...idProgressVerified, documentType: 'passport' };

export const addressProgressReading: AddressCheckProgress = { kind: 'address', phase: 'reading', documentType: 'bank_statement', checks: [], submittedAt: SENT };

export const addressProgressVerified: AddressCheckProgress = { kind: 'address', phase: 'approved', documentType: 'utility_bill', issuer: 'Gainesville Regional Utilities', checks: addressChecks(), decidedBy: 'auto', submittedAt: SENT };

/** Edited after it was made: our team looks. */
export const addressProgressReview: AddressCheckProgress = { kind: 'address', phase: 'review', documentType: 'bank_statement', issuer: 'Chase', checks: addressChecks({ unedited: 'unsure' }), submittedAt: SENT };

export const addressProgressTooOld: AddressCheckProgress = {
  kind: 'address',
  phase: 'rejected',
  documentType: 'phone_or_internet_bill',
  checks: addressChecks({ recent: 'fail' }),
  decidedBy: 'auto',
  rejectionReason: 'too_old',
  canRetry: true,
  submittedAt: SENT,
};

/** A PDF the person picked (previews show its card). */
export const sampleProofFile = { name: 'GRU-statement-November.pdf', size: 482_000, type: 'application/pdf' };
