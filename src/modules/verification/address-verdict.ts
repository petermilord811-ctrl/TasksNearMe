import {
  ADDRESS_CHECK_KEYS,
  ADDRESS_DOCUMENT_TYPES,
  type AddressCheckKey,
  type AddressRejectionReason,
  type AutoDecision,
  type CheckItem,
  type CheckOutcome,
} from '@/contracts';
import type { AddressDocumentReading } from '@/integrations/ai/document-reader';

/**
 * The automatic decision on a proof of address (owner, 2026-11-27: "by bank statement or document uploading, verify the
 * address"), from its reading: each check's outcome, and what they decide.
 * - **approved** only when every check passes (it reads, it's a kind of document we accept, it shows the account's name
 *   and the address entered, it's dated within 90 days, and nothing says it was edited) and its text can be trusted: a
 *   PDF's own text, or a photo OCR read with confidence;
 * - **rejected** only for an objective failure read with that same confidence: dated more than 90 days before it was
 *   sent (`too_old`). Nothing about how a file was made ever rejects it;
 * - **review** otherwise: our team decides, with the checks beside it.
 * Pure: no I/O.
 */

export interface AddressVerdict {
  checks: CheckItem<AddressCheckKey>[];
  decision: AutoDecision;
  /** With `rejected`. */
  rejectionReason?: AddressRejectionReason;
}

const answer = (value: boolean | undefined): CheckOutcome => (value === true ? 'pass' : value === false ? 'fail' : 'unsure');

function outcomeOf(key: AddressCheckKey, reading: AddressDocumentReading): CheckOutcome {
  if (key === 'readable') return reading.readable ? 'pass' : 'fail';
  // Nothing more can be said about a document that didn't read.
  if (!reading.readable) return 'unsure';
  switch (key) {
    case 'accepted_kind':
      if (reading.documentType && (ADDRESS_DOCUMENT_TYPES as readonly string[]).includes(reading.documentType)) return 'pass';
      return reading.documentType === 'other' && reading.confident ? 'fail' : 'unsure';
    case 'name':
      return answer(reading.nameMatches);
    case 'address':
      return answer(reading.addressMatches);
    case 'recent':
      return answer(reading.recent);
    case 'unedited':
      return reading.unedited ?? 'unsure';
  }
}

export function addressVerdict(reading: AddressDocumentReading): AddressVerdict {
  const checks = ADDRESS_CHECK_KEYS.map((key) => ({ key, outcome: outcomeOf(key, reading) }));
  const trusted = reading.readable && reading.confident === true;
  if (trusted && reading.recent === false) return { checks, decision: 'rejected', rejectionReason: 'too_old' };
  if (trusted && checks.every((check) => check.outcome === 'pass')) return { checks, decision: 'approved' };
  return { checks, decision: 'review' };
}

/** The reason a person reads when a proof that didn't pass is turned down: the most telling check that didn't pass. */
export function missReason(checks: readonly CheckItem<AddressCheckKey>[]): AddressRejectionReason {
  const failed = (key: AddressCheckKey) => checks.some((check) => check.key === key && check.outcome === 'fail');
  if (failed('unedited')) return 'suspicious';
  if (failed('recent')) return 'too_old';
  if (failed('name')) return 'name_mismatch';
  if (failed('address')) return 'address_mismatch';
  if (failed('accepted_kind')) return 'not_accepted';
  // Unreadable, or not sure of something: a clearer photo or the PDF itself.
  return 'unreadable';
}

export type AddressAutoOutcome = { decision: 'approved' } | { decision: 'rejected'; rejectionReason: AddressRejectionReason } | { decision: 'review' };

/**
 * The owner's rule for proofs of address (2026-11-27: "no need to double check on my end. Just request another
 * verification, if fraud. if that is also failed, request human review"): a proof that passes every check is verified at
 * once; one that doesn't is turned down at once with its reason, so the person sends another; when the next one doesn't
 * pass either (`earlierMisses`: proofs turned down automatically since the last verified one, staff decision or staff
 * request), our team decides. Pure.
 */
export function addressAutoOutcome(verdict: AddressVerdict, earlierMisses: number): AddressAutoOutcome {
  if (verdict.decision === 'approved') return { decision: 'approved' };
  if (earlierMisses >= 1) return { decision: 'review' };
  return { decision: 'rejected', rejectionReason: verdict.rejectionReason ?? missReason(verdict.checks) };
}
