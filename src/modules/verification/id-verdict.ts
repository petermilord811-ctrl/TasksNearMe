import { ID_CHECK_KEYS, type AutoDecision, type CheckItem, type CheckOutcome, type IdCheckKey, type IdSignal } from '@/contracts';
import type { IdDocumentReading } from '@/integrations/ai/id-document-reader';

/**
 * The automatic decision on our own ID check's photos (owner, 2026-11-27: "verify the correct issued and non-fake DL"):
 * each of the ten checks (ID_CHECK_KEYS) from the reading, the account comparison and the duplicate search, then
 *
 * - `approved` only when every check passes: readable, read by machine (a barcode or a passport's zone), genuine, the
 *   front agreeing, the account's name, 18 or older, not expired, the selfie's face matching the ID's, a live selfie
 *   that followed its instruction, and no other account with the same ID;
 * - `rejected` only for the objective failures read by machine (a barcode or a passport's zone, never OCR of the
 *   print): under 18 (`under_18`) or expired (`expired`);
 * - `review` for everything else: our team decides, with the checks and their findings beside the photos.
 *
 * With automatic decisions off (the `auto_verification_id` flag; off by default since 2026-11-27: our team double-checks
 * every ID), the checks are kept and everything goes to review, with the ID's fraud score (shared/fraud/score.ts).
 */

export interface IdVerdictInput {
  reading: IdDocumentReading;
  /** The account comparison (deriveIdentityAutoCheck): undefined where the ID didn't say. */
  answers: { nameMatches?: boolean; isAdult?: boolean; notExpired?: boolean };
  /** Another account has the same ID (true), none has (false), or the ID's number wasn't read (undefined). */
  duplicate: boolean | undefined;
  autoDecisions: boolean;
}

export interface IdVerdict {
  checks: CheckItem<IdCheckKey>[];
  signals: IdSignal[];
  decision: AutoDecision;
  rejectionReason?: 'expired' | 'under_18';
}

const yes = (value: boolean | undefined): CheckOutcome => (value === true ? 'pass' : value === false ? 'fail' : 'unsure');

export function idVerdict({ reading, answers, duplicate, autoDecisions }: IdVerdictInput): IdVerdict {
  const machine = reading.readable && (reading.source === 'barcode' || reading.source === 'mrz');
  const face = reading.face;
  const genuine: CheckOutcome = !reading.readable ? 'unsure' : face?.photocopy ? 'fail' : (reading.genuine?.outcome ?? 'unsure');
  const outcomes: Record<IdCheckKey, CheckOutcome> = {
    readable: reading.readable ? 'pass' : 'fail',
    machine_readable: machine ? 'pass' : 'unsure',
    genuine,
    // A passport's zone is confirmed by its own printed page (mrz.ts); a front read alone has nothing to agree with.
    front_matches: reading.source === 'mrz' ? 'pass' : reading.source === 'barcode' ? yes(reading.frontAgrees) : 'unsure',
    name: yes(answers.nameMatches),
    adult: yes(answers.isAdult),
    not_expired: yes(answers.notExpired),
    face_match: face?.faceMatch ?? 'unsure',
    live: face?.live ?? 'unsure',
    unique: duplicate === true ? 'fail' : duplicate === false ? 'pass' : 'unsure',
  };
  const checks = ID_CHECK_KEYS.map((key) => ({ key, outcome: outcomes[key] }));
  const signals = [...new Set<IdSignal>([...(reading.genuine?.signals ?? []), ...(face?.signals ?? [])])];
  if (!autoDecisions) return { checks, signals, decision: 'review' };
  if (machine && outcomes.adult === 'fail') return { checks, signals, decision: 'rejected', rejectionReason: 'under_18' };
  if (machine && outcomes.not_expired === 'fail') return { checks, signals, decision: 'rejected', rejectionReason: 'expired' };
  const decision: AutoDecision = checks.every((check) => check.outcome === 'pass') ? 'approved' : 'review';
  return { checks, signals, decision };
}
