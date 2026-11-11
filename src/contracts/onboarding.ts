import { z } from 'zod';
import type { ActionHandler, FieldErrorCode, QueryHandler } from './actions';
import type { CategorySlug, Cents, ISODateTime } from './common';
import { CATEGORY_SLUGS } from './common';
import type { CategoryView } from './marketing';
import type { VerificationBadges } from './people';
import type { PhotoUploadResult } from './posting';
import type { WorkSampleView } from './profiles';
import type { OnboardingStep } from './routes';
import type { BackgroundCheckStatus, IdentityStatus, PayoutAccountStatus } from './status';

/**
 * Helper onboarding (`/app/helper/onboarding/[step]`) and the profile editor (`/app/helper/profile`),
 * blueprint 02 §1 and 06 §1. Order: profile → services → area → ID → payout → background check
 * (in-home categories only) → done. Identity, payouts, and background checks are hosted by the
 * providers (Stripe Identity, Stripe Connect, Checkr): the UI starts them and shows their status.
 * Whether a helper is bookable is decided by the app.
 */

/** Why an ID check needs another try (`requires_input`). Never more detail than this. */
export const IDENTITY_FAILURE_REASONS = ['document_unreadable', 'selfie_mismatch', 'under_18', 'other'] as const;
export type IdentityFailureReason = (typeof IDENTITY_FAILURE_REASONS)[number];

export type OnboardingStepState = 'done' | 'current' | 'todo' | 'skipped' | 'locked';

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
});
export type HelperProfileInput = z.input<typeof helperProfileInputSchema>;

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
}

/**
 * Provider statuses (src/contracts/status.ts): identity `requires_input` means try again (with a
 * reason); background `consider` means a manual review is under way (never any details).
 */
export interface VerificationSummary {
  identity: { status: IdentityStatus; verifiedAt?: ISODateTime; failureReason?: IdentityFailureReason };
  payout: { status: PayoutAccountStatus };
  background: {
    status: BackgroundCheckStatus;
    checkedAt?: ISODateTime;
    /** In-home categories the helper offers, which need the check. */
    requiredFor: CategorySlug[];
  };
}

export interface HelperOnboardingPageData {
  step: OnboardingStep;
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
  /** "Your first payout can take about 7 days." */
  firstPayoutDays: number;
  /** Founding-cohort reward, when the helper can still earn it. */
  welcomeReward?: { amountCents: Cents; minTaskPriceCents: Cents; windowDays: number };
}

/**
 * Handlers for onboarding. Saves resolve with ok `saved` and `redirectTo` (the next step). The
 * provider steps resolve with `redirectTo` to the hosted flow (a dev stand-in in development); the
 * provider returns the person to this step, which shows the new status.
 * `onRefreshStatus` re-reads the provider status (ok `updated`).
 */
export interface HelperOnboardingHandlers {
  onSaveProfile: ActionHandler<HelperProfileInput>;
  onSaveServices: ActionHandler<HelperServicesInput>;
  onSaveArea: ActionHandler<HelperAreaInput>;
  onStartIdentity: ActionHandler;
  onStartPayout: ActionHandler;
  onStartBackgroundCheck: ActionHandler;
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
}

/**
 * Handlers for the profile editor. Saves resolve with ok `saved`. Work samples: upload returns the
 * photo; update, remove, and reorder resolve with `updated`.
 */
export interface HelperProfileEditorHandlers {
  onSaveProfile: ActionHandler<HelperProfileInput>;
  onSaveServices: ActionHandler<HelperServicesInput>;
  onSaveArea: ActionHandler<HelperAreaInput>;
  onSaveTools: ActionHandler<HelperToolsInput>;
  /** FormData with one `file`, plus optional `caption` and `categorySlug`. */
  onUploadWorkSample: QueryHandler<FormData, WorkSampleUploadResult>;
  onUpdateWorkSample: ActionHandler<{ id: string; caption?: string; categorySlug?: CategorySlug }>;
  onRemoveWorkSample: ActionHandler<{ id: string }>;
  onReorderWorkSamples: ActionHandler<{ ids: string[] }>;
  onSetPaused: ActionHandler<{ paused: boolean }>;
}
