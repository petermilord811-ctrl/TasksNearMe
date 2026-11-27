import { z } from 'zod';
import type { ActionHandler, FieldErrorCode, QueryHandler } from './actions';
import { CATEGORY_SLUGS, type CategorySlug } from './common';
import { LANGUAGE_CODES, type LanguageCode } from './onboarding';

/**
 * A helper's resume fills their profile (owner, 2026-11-27: "By resume, configure user's profile ex: what user can do,
 * what user can like, what user can exclude"). The helper uploads it (PDF, Word or plain text); our server reads its
 * text, and AI (the free balancer, contact details masked first) suggests what they can do (our categories), their
 * skills, tools and languages, the work they enjoy, the work they won't do, a headline, an About text and their
 * experience. Nothing is saved until the helper reviews the suggestions and applies the ones they keep. The file and
 * its text are never stored.
 */

export const RESUME_RULES = {
  maxMegabytes: 5,
  /** PDF, Word (.docx) and plain text. */
  acceptedTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
  /** File name endings the picker offers (some phones send Word files without a type). */
  acceptedExtensions: ['.pdf', '.docx', '.txt'],
} as const;

/** How much of each list a profile keeps. */
export const PROFILE_LIST_LIMITS = {
  skills: { items: 20, length: 40 },
  likes: { items: 8, length: 60 },
  excludes: { items: 8, length: 60 },
  experience: { items: 6 },
} as const;

/** One job or role, newest first. `endYear` absent with `current`: still doing it. */
export interface ExperienceEntry {
  title: string;
  organization?: string;
  startYear?: number;
  endYear?: number;
  current?: boolean;
  summary?: string;
}

const code = (value: FieldErrorCode) => value;
const listItem = (length: number) => z.string().trim().min(1, code('required')).max(length, code('too_long'));
const year = z.number().int().min(1950, code('invalid')).max(2100, code('invalid'));

export const experienceEntrySchema = z
  .object({
    title: z.string().trim().min(1, code('required')).max(80, code('too_long')),
    organization: z.string().trim().max(80, code('too_long')).optional(),
    startYear: year.optional(),
    endYear: year.optional(),
    current: z.boolean().optional(),
    summary: z.string().trim().max(280, code('too_long')).optional(),
  })
  .refine((entry) => entry.startYear === undefined || entry.endYear === undefined || entry.endYear >= entry.startYear, { message: 'invalid', path: ['endYear'] });

/** The profile's skills and work preferences (the "Skills" and "Work I enjoy / Work I don't do" sections). */
export const helperPreferencesInputSchema = z.object({
  skills: z.array(listItem(PROFILE_LIST_LIMITS.skills.length)).max(PROFILE_LIST_LIMITS.skills.items, code('too_long')),
  likes: z.array(listItem(PROFILE_LIST_LIMITS.likes.length)).max(PROFILE_LIST_LIMITS.likes.items, code('too_long')),
  excludes: z.array(listItem(PROFILE_LIST_LIMITS.excludes.length)).max(PROFILE_LIST_LIMITS.excludes.items, code('too_long')),
});
export type HelperPreferencesInput = z.input<typeof helperPreferencesInputSchema>;

export const helperExperienceInputSchema = z.object({
  experience: z.array(experienceEntrySchema).max(PROFILE_LIST_LIMITS.experience.items, code('too_long')),
});
export type HelperExperienceInput = z.input<typeof helperExperienceInputSchema>;

/** A category the resume points to, with why ("3 years of lawn care at GreenPro"), for the helper to keep or drop. */
export interface ResumeServiceSuggestion {
  categorySlug: CategorySlug;
  /** A short note for the service ("Lawn mowing, edging and leaf cleanup"). */
  description: string;
  /** Why it was suggested, in a few words, for the review screen only. */
  reason: string;
  /** Already offered: applying keeps the helper's own price and note. */
  alreadyOffered: boolean;
}

export interface ResumeSuggestions {
  headline?: string;
  bio?: string;
  services: ResumeServiceSuggestion[];
  skills: string[];
  tools: string[];
  languages: LanguageCode[];
  likes: string[];
  excludes: string[];
  experience: ExperienceEntry[];
}

/**
 * Reading a resume (FormData with one `file`). `by`: AI's suggestions, or `basic` ones from keywords when AI isn't
 * available (fewer, and no About text). Failures: `unreadable` (no text: a scanned image, an empty or locked file),
 * `too_large`, `unsupported_type`, `rate_limited` (5 an hour), `unavailable` (the reader is off), `unknown`.
 */
export type ResumeReadResult =
  | { ok: true; suggestions: ResumeSuggestions; by: 'ai' | 'basic' }
  | { ok: false; code: 'unreadable' | 'too_large' | 'unsupported_type' | 'rate_limited' | 'unavailable' | 'unknown' };

/** What the helper kept from the suggestions. Lists are added to what the profile has (no duplicates); text replaces only when given. */
export const resumeApplyInputSchema = z.object({
  headline: z.string().trim().min(10, code('too_short')).max(80, code('too_long')).optional(),
  bio: z.string().trim().min(40, code('too_short')).max(1000, code('too_long')).optional(),
  services: z
    .array(z.object({ categorySlug: z.enum(CATEGORY_SLUGS, code('invalid')), description: z.string().trim().max(240, code('too_long')) }))
    .max(CATEGORY_SLUGS.length, code('too_long')),
  skills: z.array(listItem(PROFILE_LIST_LIMITS.skills.length)).max(PROFILE_LIST_LIMITS.skills.items, code('too_long')),
  tools: z.array(z.string().trim().min(1, code('required')).max(60, code('too_long'))).max(20, code('too_long')),
  languages: z.array(z.enum(LANGUAGE_CODES, code('invalid'))).max(LANGUAGE_CODES.length, code('too_long')),
  likes: z.array(listItem(PROFILE_LIST_LIMITS.likes.length)).max(PROFILE_LIST_LIMITS.likes.items, code('too_long')),
  excludes: z.array(listItem(PROFILE_LIST_LIMITS.excludes.length)).max(PROFILE_LIST_LIMITS.excludes.items, code('too_long')),
  experience: z.array(experienceEntrySchema).max(PROFILE_LIST_LIMITS.experience.items, code('too_long')),
});
export type ResumeApplyInput = z.input<typeof resumeApplyInputSchema>;

export interface ResumeImportHandlers {
  /** Reads the resume and suggests; saves nothing. */
  onReadResume: QueryHandler<FormData, ResumeReadResult>;
  /** Saves what the helper kept. ok `saved`; `validation_failed`; `not_allowed` without a helper profile. */
  onApplyResume: ActionHandler<ResumeApplyInput>;
}
