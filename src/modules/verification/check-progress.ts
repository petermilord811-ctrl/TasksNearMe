import {
  ADDRESS_CHECK_KEYS,
  ID_CHECK_KEYS,
  type AddressCheckKey,
  type AddressCheckProgress,
  type AddressDocumentType,
  type AddressRejectionReason,
  type CheckItem,
  type CheckOutcome,
  type CheckProgress,
  type DecidedBy,
  type IdCheckKey,
  type IdCheckProgress,
  type IdentityCaptureRejectionReason,
  type IdentityDocumentType,
} from '@/contracts';
import type { Db } from '@/platform/db/connect';
import type { StoredAddressAutoCheck, StoredIdentityAutoCheck } from './schema';
import { loadOnboardingState, type OnboardingState } from './state';

/**
 * Where the document someone just sent stands, for the flows' "Verifying…" screen (owner, 2026-11-27: "clear output").
 * The person sees each check that passed; anything else reads "Our team will look", never which check caught it, except
 * the one reason an automatic rejection gives. Once approved, every check shows as passed: what our team confirmed by
 * hand counts as passed for the person.
 */

const asDecidedBy = (value: string | null | undefined): DecidedBy | undefined => (value === 'auto' || value === 'staff' ? value : undefined);

/** The person's view of stored checks: a fail or unsure reads unsure while our team decides; approved shows every check passed. */
export function personChecks<K extends string>(stored: readonly CheckItem<K>[] | undefined, order: readonly K[], phase: 'review' | 'approved' | 'rejected'): CheckItem<K>[] {
  const byKey = new Map((stored ?? []).map((item) => [item.key, item.outcome] as const));
  return order.map((key) => {
    const outcome: CheckOutcome = byKey.get(key) ?? 'unsure';
    if (outcome === 'skipped') return { key, outcome };
    if (phase === 'approved') return { key, outcome: 'pass' };
    if (phase === 'review' && outcome === 'fail') return { key, outcome: 'unsure' };
    return { key, outcome };
  });
}

/** Older readings (before 2026-11-27) and the stand-in kept yes/no answers only: the checks they speak to. */
function idChecksFromAnswers(check: StoredIdentityAutoCheck): CheckItem<IdCheckKey>[] {
  const yes = (value: boolean | undefined): CheckOutcome => (value === true ? 'pass' : value === false ? 'fail' : 'unsure');
  return ID_CHECK_KEYS.map((key) => {
    switch (key) {
      case 'readable':
        return { key, outcome: check.readable ? 'pass' : 'fail' };
      case 'machine_readable':
        return { key, outcome: check.source === 'barcode' ? 'pass' : 'unsure' };
      case 'front_matches':
        return { key, outcome: yes(check.frontAgrees) };
      case 'name':
        return { key, outcome: yes(check.nameMatches) };
      case 'adult':
        return { key, outcome: yes(check.isAdult) };
      case 'not_expired':
        return { key, outcome: yes(check.notExpired) };
      default:
        return { key, outcome: 'unsure' };
    }
  });
}

function addressChecksFromAnswers(check: StoredAddressAutoCheck): CheckItem<AddressCheckKey>[] {
  const yes = (value: boolean | undefined): CheckOutcome => (value === true ? 'pass' : value === false ? 'fail' : 'unsure');
  return ADDRESS_CHECK_KEYS.map((key) => {
    switch (key) {
      case 'readable':
        return { key, outcome: check.readable ? 'pass' : 'fail' };
      case 'name':
        return { key, outcome: yes(check.nameMatches) };
      case 'address':
        return { key, outcome: yes(check.addressMatches) };
      case 'recent':
        return { key, outcome: yes(check.recent) };
      default:
        return { key, outcome: 'unsure' };
    }
  });
}

/** The ID photos of our own check, the latest since the last request. Null before any were sent. */
export function idCheckProgress(state: OnboardingState): IdCheckProgress | null {
  // The stored row behind the standing's latest capture (its answers and who decided).
  const capture = state.captureRows.find((row) => row.id === state.identity.capture?.id);
  if (!capture) return null;
  const check = (capture.autoCheck ?? undefined) as StoredIdentityAutoCheck | undefined;
  const phase: IdCheckProgress['phase'] =
    capture.status === 'approved' ? 'approved' : capture.status === 'rejected' ? 'rejected' : capture.status === 'submitted' ? (check ? 'review' : 'reading') : 'rejected';
  const stored = check ? (check.checks ?? idChecksFromAnswers(check)) : undefined;
  const decidedBy = asDecidedBy(capture.decidedBy);
  return {
    kind: 'identity',
    phase,
    documentType: capture.documentType as IdentityDocumentType,
    checks: phase === 'reading' ? [] : personChecks(stored, ID_CHECK_KEYS, phase),
    ...(decidedBy && phase !== 'reading' && phase !== 'review' ? { decidedBy } : {}),
    ...(phase === 'rejected' && capture.rejectionReason ? { rejectionReason: capture.rejectionReason as IdentityCaptureRejectionReason } : {}),
    ...(phase === 'approved' ? { next: state.identity.verified ? ('verified' as const) : ('double_check' as const) } : {}),
    ...(phase === 'rejected' ? { canRetry: state.identity.canCapture } : {}),
    submittedAt: capture.submittedAt.toISOString(),
  };
}

/** The latest proof of address (a newer one in review after a verified one counts as the latest). Null before any. */
export function addressCheckProgress(state: OnboardingState): AddressCheckProgress | null {
  const latest = state.address.update?.row ?? state.address.latest;
  const row = state.addressRows.find((entry) => entry.id === latest?.id);
  if (!row || !row.submittedAt) return null;
  const check = (row.autoCheck ?? undefined) as StoredAddressAutoCheck | undefined;
  const phase: AddressCheckProgress['phase'] =
    row.status === 'verified' ? 'approved' : row.status === 'rejected' ? 'rejected' : row.status === 'in_review' ? (check ? 'review' : 'reading') : 'rejected';
  const stored = check ? (check.checks ?? addressChecksFromAnswers(check)) : undefined;
  const decidedBy = asDecidedBy(row.decidedBy);
  return {
    kind: 'address',
    phase,
    ...(row.documentType ? { documentType: row.documentType as AddressDocumentType } : {}),
    ...(check?.issuer ? { issuer: check.issuer } : {}),
    checks: phase === 'reading' ? [] : personChecks(stored, ADDRESS_CHECK_KEYS, phase),
    ...(decidedBy && phase !== 'reading' && phase !== 'review' ? { decidedBy } : {}),
    ...(phase === 'rejected' && row.rejectionReason ? { rejectionReason: row.rejectionReason as AddressRejectionReason } : {}),
    ...(phase === 'rejected' ? { canRetry: state.address.canSubmit } : {}),
    submittedAt: row.submittedAt.toISOString(),
  };
}

export async function getCheckProgress(db: Db, userId: string, kind: 'identity' | 'address', now: Date): Promise<CheckProgress | null> {
  const state = await loadOnboardingState(db, userId, now);
  return kind === 'identity' ? idCheckProgress(state) : addressCheckProgress(state);
}
