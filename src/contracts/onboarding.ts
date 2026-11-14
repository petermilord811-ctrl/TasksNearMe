import type { PushHandlers, PushSetup } from './account';
import { z } from 'zod';
import type { ActionHandler, ActionResult, FieldErrorCode, QueryHandler } from './actions';
import type { OneTimeCodeInput, PhoneInput } from './auth';
import type { CategorySlug, Cents, ISODateTime, Photo } from './common';
import { CATEGORY_SLUGS } from './common';
import type { CategoryView } from './marketing';
import type { VerificationBadges } from './people';
import type { AddressSuggestion, PhotoUploadResult } from './posting';
import type { WorkSampleView } from './profiles';
import type { OnboardingStep } from './routes';
import type {
  AddressVerificationStatus,
  BackgroundAdjudication,
  BackgroundCheckStatus,
  IdentityStatus,
  PayoutAccountStatus,
} from './status';

/**
 * Helper onboarding (`/app/helper/onboarding/[step]`) and the profile editor (`/app/helper/profile`),
 * blueprint 02 §1 and 06 §1. Order: profile → services → area → phone → ID → home address → payout →
 * background check (in-home categories only) → done. Payouts and background checks are hosted by the
 * providers (Stripe Connect, Checkr): the UI starts them and shows their status. The ID check has two
 * stages (owner, 2026-11-13): our own capture (the ID's photos and a live selfie that our team compares),
 * then the provider's hosted check as a double check. The phone is verified with a texted code, and the
 * home address with a proof-of-address document our team reviews. Whether a helper is bookable is decided
 * by the app.
 */

/** The verification steps a notification can be about. */
export const VERIFICATION_TRACKS = ['phone', 'identity', 'address', 'payout', 'background'] as const;
export type VerificationTrack = (typeof VERIFICATION_TRACKS)[number];

/** Why an ID check needs another try (`requires_input`). Never more detail than this. */
export const IDENTITY_FAILURE_REASONS = ['document_unreadable', 'selfie_mismatch', 'under_18', 'other'] as const;
export type IdentityFailureReason = (typeof IDENTITY_FAILURE_REASONS)[number];

/** `in_review`: waiting on the provider or our team (an ID check processing or a name check, an address proof, a background check). */
export type OnboardingStepState = 'done' | 'current' | 'todo' | 'skipped' | 'locked' | 'in_review';

export interface OnboardingProgress {
  steps: { step: OnboardingStep; state: OnboardingStepState }[];
  /** Can send offers in at least one category. */
  bookable: boolean;
  /** Categories the helper may take now (e.g. yard work while the background check runs). */
  bookableCategories: CategorySlug[];
}

export const LANGUAGE_CODES = ['en', 'es', 'vi', 'zh', 'ar', 'ko', 'tl', 'fr', 'de', 'hi'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

/** Service radius choices in miles. */
export const SERVICE_RADIUS_MILES = [2, 5, 8, 12, 15] as const;

const code = (value: FieldErrorCode) => value;

export const helperProfileInputSchema = z.object({
  headline: z.string(code('required')).trim().min(10, code('too_short')).max(80, code('too_long')),
  bio: z.string(code('required')).trim().min(40, code('too_short')).max(1000, code('too_long')),
  languages: z.array(z.enum(LANGUAGE_CODES, code('invalid'))).min(1, code('required')).max(6, code('too_long')),
  /**
   * "I agree to the Helper agreement and the Community guidelines." Needed once per agreement version
   * (`agreementNeeded` on the onboarding page data); without it then, the app answers
   * `fieldErrors.acceptHelperAgreement: ['must_accept']`. Ignored once accepted.
   */
  acceptHelperAgreement: z.boolean().optional(),
});
export type HelperProfileInput = z.input<typeof helperProfileInputSchema>;

/**
 * "Write it for me" on the profile (onboarding and the editor): a few words about themselves in; a
 * headline and an about-me out, built from those words and their services, area, tools and languages.
 * The helper reviews and edits it before saving. Drafting saves nothing.
 */
export const profileDraftInputSchema = z.object({ notes: z.string().trim().max(600, code('too_long')) });
export type ProfileDraftInput = z.input<typeof profileDraftInputSchema>;
/** `prohibited`: the notes describe something TasksNearMe doesn't allow. `rate_limited`: 10 drafts an hour. */
export type ProfileDraftResult =
  | { ok: true; draft: { headline: string; bio: string } }
  | { ok: false; code: 'unavailable' | 'rate_limited' | 'prohibited' };

const serviceSchema = z.object({
  categorySlug: z.enum(CATEGORY_SLUGS, code('required')),
  pricingType: z.enum(['fixed', 'hourly'], code('required')),
  /** Fixed: "from" price. */
  fromPriceCents: z.number(code('required')).int().positive(code('required')).optional(),
  /** Hourly: rate and minimum hours. */
  hourlyRateCents: z.number(code('required')).int().positive(code('required')).optional(),
  minHours: z.number(code('required')).int().min(1, code('out_of_range')).max(8, code('out_of_range')).optional(),
  description: z.string(code('required')).trim().max(300, code('too_long')),
});

/** Services, checked against the market's categories (minimum prices, hourly minimums). */
export function createHelperServicesSchema(categories: Pick<CategoryView, 'slug' | 'minPriceCents' | 'minHours'>[]) {
  return z
    .object({ services: z.array(serviceSchema).min(1, code('required')).max(CATEGORY_SLUGS.length, code('too_long')) })
    .superRefine(({ services }, ctx) => {
      const seen = new Set<string>();
      services.forEach((service, index) => {
        const issue = (field: string, message: FieldErrorCode) =>
          ctx.addIssue({ code: 'custom', path: ['services', index, field], message });
        const category = categories.find((c) => c.slug === service.categorySlug);
        if (!category) return issue('categorySlug', 'not_supported');
        if (seen.has(service.categorySlug)) issue('categorySlug', 'invalid');
        seen.add(service.categorySlug);
        if (service.pricingType === 'fixed') {
          if (service.fromPriceCents === undefined) issue('fromPriceCents', 'required');
          else if (service.fromPriceCents < category.minPriceCents) issue('fromPriceCents', 'out_of_range');
        } else {
          if (service.hourlyRateCents === undefined) issue('hourlyRateCents', 'required');
          if (service.minHours === undefined) issue('minHours', 'required');
          else if (category.minHours && service.minHours < category.minHours) issue('minHours', 'out_of_range');
        }
      });
    });
}
export type HelperServicesInput = z.input<ReturnType<typeof createHelperServicesSchema>>;

export const helperAreaInputSchema = z.object({
  areaId: z.string(code('required')).min(1, code('required')),
  serviceRadiusMiles: z.literal(SERVICE_RADIUS_MILES, code('required')),
  /** Offer remote help in categories that allow it. */
  remoteOk: z.boolean(),
});
export type HelperAreaInput = z.input<typeof helperAreaInputSchema>;

export const helperToolsInputSchema = z.object({
  tools: z.array(z.string().trim().min(2, code('too_short')).max(40, code('too_long'))).max(20, code('too_long')),
});
export type HelperToolsInput = z.input<typeof helperToolsInputSchema>;

export interface AreaOption {
  id: string;
  name: string;
  /** The neighborhood's center, for the service-area map. */
  center?: { lat: number; lng: number };
}

/**
 * Why an ID check can't start right now. `try_later`: 3 tries in 24 hours (see `retryAt`).
 * `too_many_attempts`: 5 tries without a pass, so our team looks at it. `under_18`: helpers must be 18 or
 * older. `double_check_review`: the provider's double check didn't confirm the photos our team approved,
 * so our team looks at both before anything else happens (helpers only; offers stay paused).
 * `duplicate_id`: the ID on these photos is on another account too, so the double check waits for our
 * team (helpers only).
 */
export const IDENTITY_BLOCKED_REASONS = ['try_later', 'too_many_attempts', 'under_18', 'double_check_review', 'duplicate_id'] as const;
export type IdentityBlockedReason = (typeof IDENTITY_BLOCKED_REASONS)[number];

/**
 * Why a new ID check was asked for: by our team, or because the legal name on the account changed.
 * `id_expiring`: the ID our team approved runs out within 30 days; the check before it still counts until
 * the end of the ID's expiry month (`renewal`). `id_expired`: that month has ended, so it no longer counts.
 */
export const IDENTITY_REQUEST_REASONS = ['staff_request', 'name_changed', 'id_expiring', 'id_expired'] as const;
export type IdentityRequestReason = (typeof IDENTITY_REQUEST_REASONS)[number];

/** The IDs our own check takes (stage 1). A passport has no back to photograph. */
export const IDENTITY_DOCUMENT_TYPES = ['drivers_license', 'state_id', 'passport'] as const;
export type IdentityDocumentType = (typeof IDENTITY_DOCUMENT_TYPES)[number];

/**
 * Why our team asked for new ID photos (the helper sees the reason, never the note). `under_18` closes
 * helper setup until our team reopens it, as an under-18 result from the provider does.
 * `double_check_failed`: the provider's double check didn't confirm these photos, and our team agreed.
 * `duplicate_id`: the ID is already used on another account.
 */
export const IDENTITY_CAPTURE_REJECTION_REASONS = ['document_unreadable', 'selfie_mismatch', 'prompt_not_followed', 'under_18', 'expired', 'double_check_failed', 'duplicate_id', 'other'] as const;
export type IdentityCaptureRejectionReason = (typeof IDENTITY_CAPTURE_REJECTION_REASONS)[number];

/**
 * What the live selfie must show, so a photo of a photo doesn't pass. The app picks one for each try
 * (reloading the page doesn't change it); our team checks the selfie follows it.
 */
export const LIVENESS_PROMPTS = ['look_left', 'look_right', 'look_up', 'smile', 'tilt_head', 'three_fingers'] as const;
export type LivenessPrompt = (typeof LIVENESS_PROMPTS)[number];

/**
 * The ID photos' limits. The UI shrinks each photo to at most `photoEdgePx` on its longer side before
 * sending it (a phone photo is several MB); the app re-encodes every photo (no location or other
 * metadata) and stores it encrypted.
 */
export const IDENTITY_CAPTURE_RULES = {
  maxMegabytes: 3,
  photoEdgePx: 2000,
  acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
} as const;

/** The photos the capture takes, in order. Passports skip `back`. */
export const IDENTITY_CAPTURE_PHOTOS = ['front', 'back', 'selfie'] as const;
export type IdentityCapturePhoto = (typeof IDENTITY_CAPTURE_PHOTOS)[number];

/** The capture's form field. It's sent as FormData with the photos `front`, `back` (not for passports) and `selfie`. */
export const identityCaptureInputSchema = z.object({
  documentType: z.enum(IDENTITY_DOCUMENT_TYPES, code('required')),
});
export type IdentityCaptureInput = z.input<typeof identityCaptureInputSchema>;

/**
 * Sending the ID photos. ok `submitted` (now in review). `validation_failed` with `fieldErrors`:
 * `documentType` `required`; `front`, `back`, `selfie` `required`, or `invalid` for a file that isn't a
 * photo; `consent` `must_accept` while the Texas notice isn't accepted. `too_large` (a photo over
 * `IDENTITY_CAPTURE_RULES.maxMegabytes`), `unsupported_type`, `rate_limited`, `not_allowed` (the step
 * isn't open, photos are in review or approved, or the check is paused), or `unknown`.
 */
export type IdentityCaptureResult =
  | { ok: true; code: 'submitted'; redirectTo?: string }
  | { ok: false; code: 'validation_failed'; fieldErrors: Partial<Record<keyof IdentityCaptureInput | IdentityCapturePhoto | 'consent', FieldErrorCode[]>> }
  | { ok: false; code: 'too_large' | 'unsupported_type' | 'rate_limited' | 'not_allowed' | 'unknown' };

/** Our own ID check (stage 1) as the helper sees it. */
export interface IdentityCaptureSummary {
  /**
   * - `needed`: take the photos (the first time, after our team turned them down, or after a new check was asked for);
   * - `in_review`: our team is comparing them;
   * - `approved`: next is the double check with our ID partner (`identity.status` shows how it's going);
   * - `done`: the ID is verified (helpers verified before stage 1 existed keep their check).
   */
  stage: 'needed' | 'in_review' | 'approved' | 'done';
  /** The photos can be sent now (not while they're in review or approved, or while the check is paused). */
  canSubmit: boolean;
  /** What the latest photos were of, and when they were sent. */
  documentType?: IdentityDocumentType;
  submittedAt?: ISODateTime;
  /** With `needed`, after our team turned the latest photos down. */
  rejectionReason?: IdentityCaptureRejectionReason;
  /** What the next selfie must show. */
  prompt: LivenessPrompt;
}

/** Documents that prove a home address. Each must show the person's name and the address, dated within 90 days. */
export const ADDRESS_DOCUMENT_TYPES = [
  'utility_bill',
  'bank_statement',
  'lease',
  'government_letter',
  'insurance_statement',
  'phone_or_internet_bill',
] as const;
export type AddressDocumentType = (typeof ADDRESS_DOCUMENT_TYPES)[number];

/** Why our team asked for another document. Never more detail than this. */
export const ADDRESS_REJECTION_REASONS = ['unreadable', 'name_mismatch', 'address_mismatch', 'too_old', 'not_accepted', 'suspicious', 'other'] as const;
export type AddressRejectionReason = (typeof ADDRESS_REJECTION_REASONS)[number];

/** The proof-of-address rules the step shows. */
export const ADDRESS_PROOF_RULES = {
  maxAgeDays: 90,
  maxMegabytes: 10,
  /** Photos and PDFs. */
  acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'],
} as const;

/**
 * The home address step's fields. The form sends them as FormData with one `file` (a photo or PDF of the
 * document); `placeId` comes from `onSearchAddresses`. `declaration`: "This document shows my name and this
 * address, and it's dated within the last 90 days."
 */
export const addressProofInputSchema = z.object({
  placeId: z.string(code('required')).trim().min(1, code('required')).max(600, code('invalid')),
  line2: z.string().trim().max(40, code('too_long')).optional(),
  documentType: z.enum(ADDRESS_DOCUMENT_TYPES, code('required')),
  declaration: z.literal(true, code('must_accept')),
});
export type AddressProofInput = z.input<typeof addressProofInputSchema>;

/**
 * Submitting the home address with its proof. ok `submitted` (now in review). `validation_failed` with
 * `fieldErrors` (`placeId`: `invalid`, or `not_supported` outside the area we verify; `file`: `required`, or
 * `invalid` for a file that isn't the photo or PDF it claims to be), the upload codes `too_large`,
 * `unsupported_type` and `rate_limited`, `not_allowed` while the step isn't open, or `unknown`.
 */
export type AddressProofResult =
  | { ok: true; code: 'submitted'; redirectTo?: string }
  | { ok: false; code: 'validation_failed'; fieldErrors: Partial<Record<keyof AddressProofInput | 'file', FieldErrorCode[]>> }
  | { ok: false; code: 'too_large' | 'unsupported_type' | 'rate_limited' | 'not_allowed' | 'unknown' };

/**
 * Where each track stands (src/contracts/status.ts). Identity `requires_input` means try again (with a
 * reason); background `consider` means a manual review is under way (never any details).
 */
export interface VerificationSummary {
  /** Never the full number. */
  phone: { verified: boolean; last4?: string };
  identity: {
    /** The provider's check (for helpers, the double check after our own: see `capture`). */
    status: IdentityStatus;
    verifiedAt?: ISODateTime;
    failureReason?: IdentityFailureReason;
    /**
     * The Texas biometric notice must be accepted (once per notice version) first: before the photos
     * (helpers) or before the provider's check opens (clients).
     */
    consentNeeded: boolean;
    blocked?: IdentityBlockedReason;
    /** With `blocked: try_later`. */
    retryAt?: ISODateTime;
    /** Verified, but the name on the ID differs from the account's name: our team is checking it. */
    nameCheck?: 'in_review';
    /** A new check was asked for (the earlier one no longer counts, except while `renewal` is set). */
    requested?: IdentityRequestReason;
    /**
     * With `requested: id_expiring`: the earlier check still counts (the helper stays bookable) until
     * `countsUntil`, the end of the ID's expiry month in Austin.
     */
    renewal?: { countsUntil: ISODateTime };
    /** Helpers only: our own check, the first stage (a client's ID check is the provider's alone). */
    capture?: IdentityCaptureSummary;
  };
  address: {
    status: AddressVerificationStatus;
    verifiedAt?: ISODateTime;
    /** The person's own address on file, e.g. "1234 Example Lane, Austin, TX 78723" (only ever shown to them). */
    label?: string;
    submittedAt?: ISODateTime;
    documentType?: AddressDocumentType;
    /** With `rejected`. */
    rejectionReason?: AddressRejectionReason;
    /** A newer proof (after a move, say) is in review or was turned down; the earlier verification still counts. */
    update?: { status: 'in_review' | 'rejected'; rejectionReason?: AddressRejectionReason };
  };
  payout: { status: PayoutAccountStatus };
  background: {
    status: BackgroundCheckStatus;
    checkedAt?: ISODateTime;
    /** In-home categories the helper offers, which need the check. */
    requiredFor: CategorySlug[];
    /** The disclosure summary must be acknowledged before Checkr opens (once per version). */
    disclosureNeeded: boolean;
    /** A clear (or approved) check counts for 12 months. */
    validUntil?: ISODateTime;
    /** From 30 days before `validUntil`, a renewal can start; the current check keeps counting meanwhile. */
    renewalOpen: boolean;
    /** An open invitation's expiry (7 days after it was sent). */
    invitationExpiresAt?: ISODateTime;
    /** Our team's decision on a `consider` result: `engaged` reads as approved, `pre_adverse` as "we've sent you a notice", `post_adverse` as final. */
    adjudication?: BackgroundAdjudication;
    /** With `pre_adverse`: until when the person can dispute the report through Checkr. */
    disputeUntil?: ISODateTime;
    /** A check can be started (or started again) now. */
    canStart: boolean;
  };
}

export interface HelperOnboardingPageData {
  step: OnboardingStep;
  /** The last step can offer notifications on this device ("hear about new tasks near you"). */
  push?: PushSetup;
  progress: OnboardingProgress;
  categories: CategoryView[];
  areas: AreaOption[];
  /** Display names by code, e.g. { code: 'es', name: 'Spanish' }. */
  languageOptions: { code: LanguageCode; name: string }[];
  /** What's saved so far (defaults for the forms). */
  values: {
    profile: HelperProfileInput;
    services: HelperServicesInput;
    area: HelperAreaInput;
  };
  verification: VerificationSummary;
  /** The helper agreement (current version) still needs accepting: the profile step shows the checkbox. */
  agreementNeeded: boolean;
  /** "Your first payout can take about 7 days." */
  firstPayoutDays: number;
  /** Founding-cohort reward, when the helper can still earn it. */
  welcomeReward?: { amountCents: Cents; minTaskPriceCents: Cents; windowDays: number };
  /** The `ai_drafting` flag, and drafting is set up: show "Write it for me" on the profile step. */
  aiDraftingEnabled: boolean;
}

/**
 * Handlers for onboarding. Saves resolve with ok `saved` and `redirectTo` (the next step). The
 * provider steps resolve with `redirectTo` to the hosted flow (a dev stand-in in development); the
 * provider returns the person to this step, which shows the new status.
 * `onRefreshStatus` re-reads the provider status (ok `updated`).
 */
export interface HelperOnboardingHandlers {
  onSavePushSubscription?: PushHandlers['onSavePushSubscription'];
  onSaveProfile: ActionHandler<HelperProfileInput>;
  /** "Write it for me" (only when `aiDraftingEnabled`). Saves nothing. */
  onDraftProfile: QueryHandler<ProfileDraftInput, ProfileDraftResult>;
  onSaveServices: ActionHandler<HelperServicesInput>;
  onSaveArea: ActionHandler<HelperAreaInput>;
  /** The phone step: a 6-digit code by text (as on the account page). ok `sent`; `fieldErrors.phone`; `rate_limited`. */
  onStartPhone: ActionHandler<PhoneInput>;
  /** Verifies the number. ok `updated` with `redirectTo` (the next step). `fieldErrors.code`: `incorrect`, `expired`. */
  onConfirmPhone: ActionHandler<OneTimeCodeInput>;
  /**
   * Accepts the Texas biometric notice before the photos are taken (`consent: true`). ok `updated`;
   * `fieldErrors.consent: ['must_accept']` without it; `not_allowed` while the step isn't open.
   */
  onAcceptIdentityNotice: ActionHandler<{ consent: boolean }>;
  /** Sends our own check's photos (FormData: `documentType`, `front`, `back` unless a passport, `selfie`). */
  onSubmitIdentityCapture: QueryHandler<FormData, IdentityCaptureResult>;
  /**
   * Opens the provider's hosted check, the double check once our team approved the photos
   * (`identity.capture.stage` `approved`). `consent`: the Texas biometric notice was accepted just now
   * (needed while `identity.consentNeeded`, otherwise `fieldErrors.consent: ['must_accept']`).
   * `not_allowed` while blocked or before the photos are approved.
   */
  onStartIdentity: ActionHandler<{ consent?: boolean }>;
  /** Home address suggestions, in and around the market (`inServiceArea: false` can't be chosen). */
  onSearchAddresses: QueryHandler<{ query: string }, AddressSuggestion[]>;
  /** FormData: the `addressProofInputSchema` fields (`declaration` as "true") plus one `file`. */
  onSubmitAddressProof: QueryHandler<FormData, AddressProofResult>;
  onStartPayout: ActionHandler;
  /** `acknowledged`: the disclosure summary was acknowledged just now (needed while `background.disclosureNeeded`). */
  onStartBackgroundCheck: ActionHandler<{ acknowledged?: boolean }>;
  onRefreshStatus: ActionHandler;
}

/**
 * The upload result for work samples. The app always returns `sample` (the stored work sample,
 * ready to caption, reorder, or remove); it's optional only until the editor relies on it.
 */
export type WorkSampleUploadResult =
  | { ok: true; photo: WorkSampleView['photo']; sample?: WorkSampleView }
  | Extract<PhotoUploadResult, { ok: false }>;

/** `/app/helper/profile`: everything a helper can change after onboarding. */
export interface HelperProfileEditorData {
  handle: string;
  /** How people see the helper: the display name, initials and profile photo (the same as on the account page). */
  person: { displayName: string; initials: string; photo?: Photo };
  progress: OnboardingProgress;
  categories: CategoryView[];
  areas: AreaOption[];
  languageOptions: { code: LanguageCode; name: string }[];
  values: {
    profile: HelperProfileInput;
    services: HelperServicesInput;
    area: HelperAreaInput;
    tools: HelperToolsInput;
  };
  workSamples: WorkSampleView[];
  /** Up to this many work samples. */
  maxWorkSamples: number;
  /** Same size limit as task photos. */
  maxPhotoMegabytes: number;
  badges: VerificationBadges;
  verification: VerificationSummary;
  /** Paused profiles don't appear in search and can't receive invites. */
  paused: boolean;
  /** The `ai_drafting` flag, and drafting is set up: show "Write it for me" on the profile. */
  aiDraftingEnabled: boolean;
}

/**
 * Handlers for the profile editor. Saves resolve with ok `saved`. Work samples: upload returns the
 * photo; update, remove, and reorder resolve with `updated`.
 */
export interface HelperProfileEditorHandlers {
  onSaveProfile: ActionHandler<HelperProfileInput>;
  /** "Write it for me" (only when `aiDraftingEnabled`). Saves nothing. */
  onDraftProfile: QueryHandler<ProfileDraftInput, ProfileDraftResult>;
  onSaveServices: ActionHandler<HelperServicesInput>;
  onSaveArea: ActionHandler<HelperAreaInput>;
  onSaveTools: ActionHandler<HelperToolsInput>;
  /** FormData with one `file`, plus optional `caption` and `categorySlug`. */
  onUploadWorkSample: QueryHandler<FormData, WorkSampleUploadResult>;
  onUpdateWorkSample: ActionHandler<{ id: string; caption?: string; categorySlug?: CategorySlug }>;
  onRemoveWorkSample: ActionHandler<{ id: string }>;
  onReorderWorkSamples: ActionHandler<{ ids: string[] }>;
  onSetPaused: ActionHandler<{ paused: boolean }>;
  /** The profile photo, as on the account page: FormData with one `file`; resolves with the photo. */
  onUploadPhoto: QueryHandler<FormData, PhotoUploadResult>;
  /** Back to initials; ok `updated`. */
  onRemovePhoto: () => Promise<ActionResult>;
}
