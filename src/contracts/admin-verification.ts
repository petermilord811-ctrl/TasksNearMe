import { z } from 'zod';
import type { ActionHandler, FieldErrorCode, QueryHandler } from './actions';
import type { CategorySlug, ISODateTime } from './common';
import type {
  AddressDocumentType,
  AddressRejectionReason,
  IdentityBlockedReason,
  IdentityCapturePhoto,
  IdentityCaptureRejectionReason,
  IdentityDocumentType,
  IdentityFailureReason,
  IdentityRequestReason,
  LivenessPrompt,
} from './onboarding';
import { ADDRESS_REJECTION_REASONS, IDENTITY_CAPTURE_REJECTION_REASONS } from './onboarding';
import type { PersonSummary } from './people';
import type {
  AddressVerificationStatus,
  BackgroundAdjudication,
  BackgroundCheckStatus,
  IdentityCaptureStatus,
  IdentityStatus,
  PayoutAccountStatus,
} from './status';

/**
 * Staff verification reviews (added 2026-11-12, blueprint 06 §1 and §4): proof-of-address documents,
 * our own ID check's photos (stage 1, added 2026-11-13), ID name checks and helpers out of ID attempts,
 * and background checks that came back `consider`.
 * Staff see statuses. The documents they can open are a proof of address and the ID photos of our own
 * check, after giving a reason (logged), through links that work for 5 minutes. The provider's ID images
 * and background reports stay with the providers. Trust and safety, support leads and admins decide;
 * support agents see statuses.
 */

const code = (value: FieldErrorCode) => value;

export const ADMIN_VERIFICATION_QUEUES = ['address', 'identity', 'background'] as const;
export type AdminVerificationQueue = (typeof ADMIN_VERIFICATION_QUEUES)[number];

/**
 * What an automatic reading of the document found (only when it's on; staff still decide). Only these
 * answers are kept, never the document's text.
 */
export interface AddressAutoCheck {
  readable: boolean;
  /** The name on the document matches the account's legal name. */
  nameMatches?: boolean;
  /** The address on the document matches the one entered. */
  addressMatches?: boolean;
  /** Dated within 90 days of the upload. */
  recent?: boolean;
  /** What the document looks like. */
  documentType?: AddressDocumentType | 'other';
}

/** A proof waiting in the address queue (oldest first). */
export interface AdminAddressReviewRow {
  id: string;
  person: PersonSummary;
  submittedAt: ISODateTime;
  documentType: AddressDocumentType;
  /** The neighborhood nearest the address ("Mueller"); the list never shows the address itself. */
  areaName?: string;
  autoCheck?: AddressAutoCheck;
  /** Waiting longer than the 2-day response target. */
  overdue: boolean;
}

/** `capture`: ID photos to compare (our own check, stage 1). */
export type AdminIdentityReviewKind = 'capture' | 'name_check' | 'too_many_attempts';

/**
 * What the automatic reading of an ID found (only when it's on; staff still decide). Only these answers
 * are kept: never the name, the birth date or the document number. Faces are never compared by it.
 */
export interface IdentityAutoCheck {
  readable: boolean;
  /** The name on the ID matches the account's legal name. */
  nameMatches?: boolean;
  /** 18 or older, from the ID's birth date. */
  isAdult?: boolean;
  notExpired?: boolean;
  /** When the ID runs out: the month and year only. */
  expires?: { month: number; year: number };
  /** What the document looks like. */
  documentType?: IdentityDocumentType | 'other';
}

/** An ID check waiting on staff: photos to compare, a name that differs from the account's, or 5 tries without a pass. */
export interface AdminIdentityReviewRow {
  /** The capture (kind `capture`), otherwise the provider check. */
  id: string;
  person: PersonSummary;
  kind: AdminIdentityReviewKind;
  /** When it started waiting. */
  at: ISODateTime;
  /** Tries since the last reset (photos and provider checks). */
  attempts: number;
  /** With `capture`. `overdue`: waiting longer than the 2-day response target. */
  capture?: { documentType: IdentityDocumentType; autoCheck?: IdentityAutoCheck; overdue: boolean };
}

/** A background check that came back `consider`, until it's engaged or final. */
export interface AdminBackgroundReviewRow {
  id: string;
  person: PersonSummary;
  completedAt: ISODateTime;
  adjudication?: Extract<BackgroundAdjudication, 'pre_adverse'>;
  /** With `pre_adverse`: the final decision can be made from then (7 days for the person to dispute). */
  finalDecisionFrom?: ISODateTime;
  /** The in-home categories it's for. */
  requiredFor: CategorySlug[];
}

/** `routes.admin.verifications(queue)`: every queue's count, and the chosen queue's rows (oldest first, up to 100). */
export interface AdminVerificationsPageData {
  queue: AdminVerificationQueue;
  counts: Record<AdminVerificationQueue, number>;
  address: AdminAddressReviewRow[];
  identity: AdminIdentityReviewRow[];
  background: AdminBackgroundReviewRow[];
  /** Trust and safety, support leads and admins can decide (others see the queues). */
  canDecide: boolean;
}

/** One proof of address as staff see it on the person page (the address and document only through `onRevealAddressProof`). */
export interface AdminAddressProofView {
  id: string;
  status: Exclude<AddressVerificationStatus, 'not_started'>;
  submittedAt?: ISODateTime;
  documentType?: AddressDocumentType;
  areaName?: string;
  /** The document is still stored (it's deleted 30 days after the decision). */
  documentAvailable: boolean;
  documentDeletedAt?: ISODateTime;
  decidedAt?: ISODateTime;
  decidedBy?: string;
  rejectionReason?: AddressRejectionReason;
  autoCheck?: AddressAutoCheck;
}

/** One try at our own ID check, as staff see it on the person page (the photos only through `onRevealIdentityCapture`). */
export interface AdminIdentityCaptureView {
  id: string;
  status: IdentityCaptureStatus;
  documentType: IdentityDocumentType;
  submittedAt: ISODateTime;
  /** What the selfie had to show. */
  prompt: LivenessPrompt;
  autoCheck?: IdentityAutoCheck;
  /** The photos still stored (they're deleted 30 days after the decision). */
  photos: IdentityCapturePhoto[];
  photosDeletedAt?: ISODateTime;
  decidedAt?: ISODateTime;
  decidedBy?: string;
  rejectionReason?: IdentityCaptureRejectionReason;
  /** The deciding staff member's note (staff only; the helper sees the reason). */
  note?: string;
}

export const ADMIN_VERIFICATION_ACTIONS = [
  /** Approve or reject the proof in review. */
  'review_address',
  /** Ask for a new proof (the current verification stops counting). */
  'request_address',
  /** Approve or reject the ID photos in review (our own check, stage 1). */
  'review_identity_capture',
  /** Open the ID photos still stored, with a logged reason. */
  'view_identity_photos',
  /** The ID name differs from the account's: confirm it's the same person (a nickname, a married name). */
  'confirm_name',
  /** Out of ID attempts, or an under-18 result that was a misread: allow new tries. */
  'allow_identity_retry',
  /** Ask for a new ID check (the current verification stops counting). */
  'request_identity',
  /** A `consider` background check: approve the helper for in-home work. */
  'engage_background',
  /** A `consider` background check: start the pre-adverse notice through Checkr. */
  'pre_adverse_background',
  /** After the 7-day dispute window: the final adverse action (no in-home categories). */
  'post_adverse_background',
] as const;
export type AdminVerificationActionId = (typeof ADMIN_VERIFICATION_ACTIONS)[number];

/** The Verification section of `routes.admin.user(userId)`. */
export interface AdminPersonVerification {
  phone: { verified: boolean; last4?: string; verifiedAt?: ISODateTime };
  /** The helper agreement (none for people who never started onboarding). */
  agreement?: { version: string; acceptedAt: ISODateTime };
  identity: {
    status: IdentityStatus;
    verifiedAt?: ISODateTime;
    failureReason?: IdentityFailureReason;
    /** Tries since the last reset. */
    attempts: number;
    /** The ID name matched the account's (absent until a check is verified). */
    nameMatches?: boolean;
    nameConfirmedAt?: ISODateTime;
    blocked?: IdentityBlockedReason;
    requested?: IdentityRequestReason;
    /** When the biometric notice was accepted. */
    consentAt?: ISODateTime;
    /** The provider was asked to delete the ID images (30 days after the result). */
    redactionRequestedAt?: ISODateTime;
    /** Our own check's tries (stage 1), newest first, up to 5. */
    captures: AdminIdentityCaptureView[];
  };
  address: {
    status: AddressVerificationStatus;
    verifiedAt?: ISODateTime;
    /** Newest first, up to 5. */
    proofs: AdminAddressProofView[];
  };
  payout: { status: PayoutAccountStatus };
  background: {
    status: BackgroundCheckStatus;
    completedAt?: ISODateTime;
    validUntil?: ISODateTime;
    adjudication?: BackgroundAdjudication;
    finalDecisionFrom?: ISODateTime;
    requiredFor: CategorySlug[];
    disclosureAt?: ISODateTime;
  };
  /** What the viewer can do now. */
  actions: AdminVerificationActionId[];
}

const note = z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long'));

/** Approving or rejecting a proof in review. A rejection needs a reason (the helper sees it); the note goes to the audit log. */
export const addressDecisionInputSchema = z
  .object({
    verificationId: z.string(code('required')).min(1, code('required')),
    decision: z.enum(['approve', 'reject'], code('required')),
    reason: z.enum(ADDRESS_REJECTION_REASONS, code('required')).optional(),
    note,
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'reject' && !value.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: code('required') });
  });
export type AddressDecisionInput = z.input<typeof addressDecisionInputSchema>;

/** The other verification actions on a person (the note goes to the audit log, and requests explain themselves to the helper by type only). */
export const verificationActionInputSchema = z.object({
  userId: z.string(code('required')).min(1, code('required')),
  action: z.enum(
    ['request_address', 'confirm_name', 'allow_identity_retry', 'request_identity', 'engage_background', 'pre_adverse_background', 'post_adverse_background'],
    code('required'),
  ),
  note,
});
export type VerificationActionInput = z.input<typeof verificationActionInputSchema>;

/** Opening a proof of address: why (logged with the staff member and time). */
export const addressProofRevealInputSchema = z.object({
  verificationId: z.string(code('required')).min(1, code('required')),
  reason: z.string(code('required')).trim().min(10, code('too_short')).max(500, code('too_long')),
});
export type AddressProofRevealInput = z.input<typeof addressProofRevealInputSchema>;

/**
 * The address as entered and, while it's stored, a link to the document that works until `expiresAt`
 * (5 minutes; open it in a new tab). `not_allowed` for other roles; `not_found` for an unknown proof.
 */
export type AddressProofRevealResult =
  | { ok: true; address: string; document?: { url: string; kind: 'image' | 'pdf' }; expiresAt: ISODateTime }
  | { ok: false; code: 'validation_failed' | 'not_allowed' | 'not_found' | 'unknown'; fieldErrors?: Partial<Record<string, FieldErrorCode[]>> };

/**
 * Approving or rejecting the ID photos in review. Approving opens the provider's double check for the
 * helper; a rejection needs a reason (the helper sees it, and can try again within the limits). The note
 * goes to the audit log.
 */
export const identityCaptureDecisionInputSchema = z
  .object({
    captureId: z.string(code('required')).min(1, code('required')),
    decision: z.enum(['approve', 'reject'], code('required')),
    reason: z.enum(IDENTITY_CAPTURE_REJECTION_REASONS, code('required')).optional(),
    note,
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'reject' && !value.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: code('required') });
  });
export type IdentityCaptureDecisionInput = z.input<typeof identityCaptureDecisionInputSchema>;

/** Opening the ID photos: why (logged with the staff member and time). */
export const identityCaptureRevealInputSchema = z.object({
  captureId: z.string(code('required')).min(1, code('required')),
  reason: z.string(code('required')).trim().min(10, code('too_short')).max(500, code('too_long')),
});
export type IdentityCaptureRevealInput = z.input<typeof identityCaptureRevealInputSchema>;

/**
 * A link to each photo still stored, working until `expiresAt` (5 minutes), and what the selfie had to
 * show. `not_allowed` for other roles; `not_found` for an unknown capture.
 */
export type IdentityCaptureRevealResult =
  | { ok: true; photos: { kind: IdentityCapturePhoto; url: string }[]; prompt: LivenessPrompt; expiresAt: ISODateTime }
  | { ok: false; code: 'validation_failed' | 'not_allowed' | 'not_found' | 'unknown'; fieldErrors?: Partial<Record<string, FieldErrorCode[]>> };

/** ok `updated` (refresh). Errors: `validation_failed`, `not_allowed` (your role, or the item moved on), `not_found`. */
export interface AdminVerificationHandlers {
  onRevealAddressProof: QueryHandler<AddressProofRevealInput, AddressProofRevealResult>;
  onDecideAddress: ActionHandler<AddressDecisionInput>;
  onRevealIdentityCapture: QueryHandler<IdentityCaptureRevealInput, IdentityCaptureRevealResult>;
  onDecideIdentityCapture: ActionHandler<IdentityCaptureDecisionInput>;
  onVerificationAction: ActionHandler<VerificationActionInput>;
}
