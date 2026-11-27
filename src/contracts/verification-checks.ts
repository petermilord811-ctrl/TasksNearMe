import type { ISODateTime } from './common';
import type { AddressDocumentType, AddressRejectionReason, IdentityCaptureRejectionReason, IdentityDocumentType } from './onboarding';

/**
 * The automatic checks our own server runs on an ID (our own ID check) and on a proof of address (owner, 2026-11-27:
 * "verify the correct issued and non-fake DL", "by bank statement or document uploading, verify the address", with
 * open-source technology on our own server, no paid services). Each check ends in an outcome; together they make an
 * automatic decision: a clean reading is approved without waiting for staff, anything doubtful goes to our team, and only
 * objective failures (an expired ID, someone under 18, a document older than 90 days) are turned down at once.
 *
 * The person sees the checks as a short list while their document is read and after ("clear output"): passed ones with a
 * check mark, anything else as "Our team will look" (a fraudster never learns which check caught them), and an
 * automatic rejection with its one reason. Staff see every check with its signals (`IdSignal`, `AddressSignal`).
 */

/** One check's outcome. `unsure`: not enough to say (staff decide); `skipped`: doesn't apply (a passport has no barcode). */
export const CHECK_OUTCOMES = ['pass', 'fail', 'unsure', 'skipped'] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

/** The automatic decision on a document. `review`: our team decides (with the checks beside it). */
export const AUTO_DECISIONS = ['approved', 'review', 'rejected'] as const;
export type AutoDecision = (typeof AUTO_DECISIONS)[number];

/**
 * An ID's checks, in the order the flow shows them:
 * - `readable`: the photos could be read at all;
 * - `machine_readable`: the barcode on a license or state ID's back decoded, or a passport's machine-readable zone with
 *   every check digit;
 * - `genuine`: the barcode is encoded as the issuing state encodes it (AAMVA's header, the state's issuer number, its
 *   version, its sections and their lengths, its required fields), and the license number has that state's format (in
 *   Florida and other states that build it from the name and birth date, it matches them);
 * - `front_matches`: the front's print agrees with the barcode (name, birth date, number, expiry);
 * - `name`: the name on the ID is the account's legal name;
 * - `adult`: 18 or older;
 * - `not_expired`: the ID hasn't run out;
 * - `face_match`: the selfie's face matches the ID's photo;
 * - `live`: the selfie is of a live person following its prompt, not a photo of a photo or a screen;
 * - `unique`: the same ID isn't on another account.
 */
export const ID_CHECK_KEYS = ['readable', 'machine_readable', 'genuine', 'front_matches', 'name', 'adult', 'not_expired', 'face_match', 'live', 'unique'] as const;
export type IdCheckKey = (typeof ID_CHECK_KEYS)[number];

/** A proof of address's checks: read, an accepted kind of document (and who sent it), the name, the address, dated within 90 days, no signs of editing. */
export const ADDRESS_CHECK_KEYS = ['readable', 'accepted_kind', 'name', 'address', 'recent', 'unedited'] as const;
export type AddressCheckKey = (typeof ADDRESS_CHECK_KEYS)[number];

export interface CheckItem<K extends string> {
  key: K;
  outcome: CheckOutcome;
}

/**
 * What staff see beside an ID's checks: each a finding, never personal data. `good` findings back a pass (a Florida
 * number that matches the name and birth date), the others explain a fail or an unsure.
 */
export const ID_SIGNALS = [
  // The barcode (AAMVA DL/ID Card Design Standard).
  'barcode_missing',
  'header_malformed',
  'issuer_unknown',
  'issuer_mismatch',
  'version_unknown',
  'version_too_new',
  'subfile_layout_off',
  'required_fields_missing',
  'field_format_off',
  'number_format_off',
  'number_derivation_off',
  'number_derivation_ok',
  'dates_inconsistent',
  'validity_too_long',
  'expiry_not_on_birthday',
  'inventory_mismatch',
  'barcode_signature_ok',
  'barcode_signature_bad',
  // A passport's machine-readable zone.
  'mrz_check_digits_ok',
  // The front against the barcode.
  'front_unreadable',
  'front_name_differs',
  'front_birth_date_differs',
  'front_number_differs',
  'front_expiry_differs',
  // The faces.
  'id_face_missing',
  'selfie_face_missing',
  'selfie_many_faces',
  'face_mismatch',
  'face_weak_match',
  'selfie_is_id_photo',
  'spoof_suspected',
  'pose_not_followed',
  'pose_followed',
  // The photos themselves.
  'photo_of_screen',
  'photocopy',
  'card_outline_off',
  'photo_edited',
  'low_quality',
] as const;
export type IdSignal = (typeof ID_SIGNALS)[number];

/** What staff see beside a proof's checks (never its text). */
export const ADDRESS_SIGNALS = [
  'scanned_pdf',
  'photo',
  'issuer_known',
  'issuer_unknown',
  'pdf_edited_after_creation',
  'pdf_incremental_updates',
  'pdf_editor_tool',
  'pdf_annotations',
  'pdf_form_fields',
  'pdf_font_mix',
  'pdf_javascript',
  /** Two different texts drawn at one spot on a page (new text over covered text). */
  'pdf_text_overlay',
  /** The file was made more than a day before the date it states as its own. */
  'pdf_created_before_statement',
  'name_near_address',
  'address_in_header',
  'kind_differs',
  'low_confidence_text',
] as const;
export type AddressSignal = (typeof ADDRESS_SIGNALS)[number];

/** Who decided: our server's checks, or a person on our team. */
export type DecidedBy = 'auto' | 'staff';

/**
 * Where a document the person just sent stands, polled by the flow's "Verifying…" screen (every 2 seconds, about a
 * minute at most; then "We'll let you know").
 * - `reading`: our server hasn't read it yet (checks so far: none);
 * - `review`: read, and our team decides (passed checks show; the rest read "Our team will look");
 * - `approved`: verified (automatically or by our team);
 * - `rejected`: turned down, with the one reason the person sees, and whether they can try again now.
 */
export type CheckProgressPhase = 'reading' | 'review' | 'approved' | 'rejected';

export interface IdCheckProgress {
  kind: 'identity';
  phase: CheckProgressPhase;
  documentType?: IdentityDocumentType;
  /** Every check in `ID_CHECK_KEYS` order once read (empty while `reading`). */
  checks: CheckItem<IdCheckKey>[];
  decidedBy?: DecidedBy;
  rejectionReason?: IdentityCaptureRejectionReason;
  /** After an approval: the ID is verified now (no double check with a provider is configured), or the double check opens next. */
  next?: 'verified' | 'double_check';
  canRetry?: boolean;
  submittedAt?: ISODateTime;
}

export interface AddressCheckProgress {
  kind: 'address';
  phase: CheckProgressPhase;
  documentType?: AddressDocumentType;
  /** Who sent the document, when it's a company or agency we recognize ("Duke Energy"). */
  issuer?: string;
  checks: CheckItem<AddressCheckKey>[];
  decidedBy?: DecidedBy;
  rejectionReason?: AddressRejectionReason;
  canRetry?: boolean;
  submittedAt?: ISODateTime;
}

export type CheckProgress = IdCheckProgress | AddressCheckProgress;

/** The flow's poll: `kind` picks the check. Resolves with where the latest document stands (`null`: nothing sent). */
export type CheckProgressInput = { kind: 'identity' | 'address' };

/**
 * The details read from an ID, kept encrypted with its photos for our team's review (owner, 2026-11-27: "store DL infos
 * and images for further possible manual review"). Opened only by staff who decide ID checks, with a logged reason.
 */
export interface IdDocumentDetails {
  source: 'barcode' | 'front' | 'mrz';
  documentType: IdentityDocumentType | 'other';
  /** Two-letter state, or a passport's three-letter country. */
  issuingState?: string;
  givenNames?: string;
  middleNames?: string;
  surname?: string;
  suffix?: string;
  /** YYYY-MM-DD */
  dateOfBirth?: string;
  issueDate?: string;
  expiryDate?: string;
  documentNumber?: string;
  address?: { line1: string; line2?: string; city: string; state: string; zip: string };
  sex?: 'male' | 'female' | 'unspecified';
  height?: string;
  eyeColor?: string;
  /** License class ("E" in Florida), restrictions and endorsements, as printed. */
  licenseClass?: string;
  restrictions?: string;
  endorsements?: string;
  /** The card's document discriminator (DCF) and inventory control number (DCK), when the barcode has them. */
  documentDiscriminator?: string;
  inventoryControl?: string;
  /** The barcode's AAMVA version and the issuer's own version (staff context for the genuine check). */
  aamvaVersion?: number;
  jurisdictionVersion?: number;
}

/** How alike the selfie and the ID's photo are (0 to 1, cosine), and the thresholds it was judged by. */
export interface FaceMatchScore {
  similarity: number;
  /** At or above: the same person. */
  matchAt: number;
  /** Below: not the same person (in between: unsure). */
  mismatchBelow: number;
}
