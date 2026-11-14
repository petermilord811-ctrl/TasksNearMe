import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';

/**
 * The verification tracks (docs/blueprint/06 §1), stored separately. Providers keep their own ID images
 * and background reports; we keep statuses, timestamps and pass flags. Two kinds of document enter our
 * storage, both private, opened only by staff with a logged reason, and deleted 30 days after the
 * decision: a proof of the home address (added 2026-11-12), and the ID photos and selfie of our own ID
 * check (stage 1, added 2026-11-13), which are also encrypted.
 *
 * "Request" rows: staff (or a change to the legal name) can ask for a new check. That adds a row with
 * status `not_started` (identity, background) or `requested` (address) and no provider reference; the
 * latest row is the current one, so the earlier verification stops counting, and the attempt count
 * starts again from the request.
 */

/** Stripe Identity sessions. The latest row per user is the current one. */
export const identityVerifications = pgTable(
  'identity_verifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // dev | stripe_identity | persona
    /** Null on a request row. For Persona, the inquiry id (inq_…). */
    providerSessionId: text('provider_session_id'),
    status: text('status').notNull(), // not_started | processing | requires_input | verified | canceled
    failureReason: text('failure_reason'), // document_unreadable | selfie_mismatch | under_18 | other
    /** The provider's own word for the result (Persona: approved, declined, failed, expired…), for staff. */
    providerOutcome: text('provider_outcome'),
    /** When the newest provider event applied here was created: older or repeated events change nothing. */
    providerEventAt: timestamp('provider_event_at', { withTimezone: true }),
    /**
     * Staff's decision on a double check that didn't confirm the photos our team approved (`retry_allowed`
     * or `rejected`), with who and when; until then the helper is paused.
     */
    reviewOutcome: text('review_outcome'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedByUserId: text('reviewed_by_user_id'),
    /** From the verified date of birth; the date itself is never stored. */
    isAdult: boolean('is_adult'),
    /** The verified first and last name matched the account's (the names themselves are never stored). */
    nameMatches: boolean('name_matches'),
    /** Staff confirmed a name that didn't match (a nickname, a married name). */
    nameConfirmedAt: timestamp('name_confirmed_at', { withTimezone: true }),
    nameConfirmedByUserId: text('name_confirmed_by_user_id'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    /**
     * Request rows: why (`staff_request`, `name_changed`, `allow_retry`, `id_expiring`) and by whom (staff;
     * null for the system). `id_expiring` (6.3): the ID our team approved runs out within 30 days, so a new
     * check starts while the verification before it counts until the ID's expiry month ends.
     */
    requestedReason: text('requested_reason'),
    requestedByUserId: text('requested_by_user_id'),
    /** Texas biometric limits (blueprint 06 §3): the provider is asked to delete the images after the result. */
    redactionRequestedAt: timestamp('redaction_requested_at', { withTimezone: true }),
    /** On an `id_expiring` request row: 1 once the helper was told the ID runs out, 2 once told it has. */
    expiryNotices: integer('expiry_notices').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('identity_verifications_user_idx').on(t.userId, t.createdAt)],
);

/**
 * The yes/no answers of the automatic reading of an ID (stage 1). The name, birth date and document
 * number are read once and never kept; only these answers and the expiry month and year are.
 */
export interface StoredIdentityAutoCheck {
  readable: boolean;
  nameMatches?: boolean;
  isAdult?: boolean;
  notExpired?: boolean;
  expiresMonth?: number;
  expiresYear?: number;
  /** What the document looks like: drivers_license | state_id | passport | other. */
  documentType?: string;
  /** Which reader produced it (`claude:<model>` or `stand-in`). */
  by: string;
  at: string;
}

/**
 * Our own ID check, the first of two stages (owner, 2026-11-13): photos of the ID (the front, and the
 * back except for passports) and a live selfie that follows a prompt, which staff compare. Once staff
 * approve, the provider's hosted check runs as the double check (`identity_verifications`). The latest
 * row since the last request row is the current one, and every row counts as a try toward the ID limits.
 * The photos are `files` rows of kind `id_document` and `id_selfie`, encrypted (platform/crypto), and
 * deleted 30 days after the decision (`files_deleted_at`; the row keeps its status and dates).
 */
export const identityCaptures = pgTable(
  'identity_captures',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    documentType: text('document_type').notNull(), // drivers_license | state_id | passport
    /** `files.id`; null once deleted (and `back` for passports). */
    frontFileId: text('front_file_id'),
    backFileId: text('back_file_id'),
    selfieFileId: text('selfie_file_id'),
    /** What the selfie had to show (LIVENESS_PROMPTS). */
    promptKey: text('prompt_key').notNull(),
    status: text('status').notNull(), // submitted | approved | rejected | canceled
    rejectionReason: text('rejection_reason'), // document_unreadable | selfie_mismatch | prompt_not_followed | under_18 | expired | double_check_failed | duplicate_id | other
    autoCheck: jsonb('auto_check').$type<StoredIdentityAutoCheck>(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedByUserId: text('decided_by_user_id'),
    /** The deciding staff member's note (also in the audit log); never shown to the helper. */
    staffNote: text('staff_note'),
    filesDeletedAt: timestamp('files_deleted_at', { withTimezone: true }),
    /**
     * The same ID on two accounts (6.3): a keyed hash (HMAC-SHA256, its own key derived from
     * FIELD_ENCRYPTION_KEY) of the document number, issuing state and birth date read from the front. The
     * number itself is never stored or logged. Null when the reading didn't find all three.
     */
    documentHash: text('document_hash'),
    /** Another account already had a capture with the same hash: the double check waits for staff. */
    duplicateOfUserId: text('duplicate_of_user_id'),
    /** Staff found the duplicate in order (the hold is lifted), with who and when. */
    duplicateClearedAt: timestamp('duplicate_cleared_at', { withTimezone: true }),
    duplicateClearedByUserId: text('duplicate_cleared_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('identity_captures_user_idx').on(t.userId, t.createdAt),
    index('identity_captures_document_hash_idx').on(t.documentHash),
    index('identity_captures_status_idx').on(t.status, t.submittedAt),
    // One set of photos in review at a time, even when two submits race.
    uniqueIndex('identity_captures_one_in_review').on(t.userId).where(sql`status = 'submitted'`),
  ],
);

/** Stripe Connect accounts for payouts. No bank or tax details here. */
export const payoutAccounts = pgTable('payout_accounts', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // dev | stripe
  providerAccountId: text('provider_account_id').notNull(),
  status: text('status').notNull(), // not_started | pending | requirements_due | active | restricted
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  /**
   * When Stripe last reported a working default bank account (`account.external_account.created` or `.updated`):
   * a payout that failed before this no longer asks the helper for their bank (completion plan 5.17).
   */
  bankUpdatedAt: timestamp('bank_updated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Background checks (Checkr; blueprint 08 `eligibility_checks`). Report contents stay with the provider. */
export const backgroundChecks = pgTable(
  'background_checks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // dev | checkr
    /** Null on a request row. */
    providerRef: text('provider_ref'),
    status: text('status').notNull(), // not_started | invited | pending | clear | consider | suspended | canceled | expired
    /** Checkr's invitation link works for 7 days. */
    invitationExpiresAt: timestamp('invitation_expires_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Re-check every 12 months (blueprint 06 §1): set for clear and engaged checks. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Staff decision on `consider`: engaged | pre_adverse | post_adverse. */
    adjudication: text('adjudication'),
    adjudicatedAt: timestamp('adjudicated_at', { withTimezone: true }),
    adjudicatedByUserId: text('adjudicated_by_user_id'),
    /** When the pre-adverse notice went out (the final decision waits 7 days for a dispute). */
    preAdverseAt: timestamp('pre_adverse_at', { withTimezone: true }),
    /** The provider's adverse action (Checkr), to cancel its scheduled final notice. */
    adverseActionRef: text('adverse_action_ref'),
    /** Renewal reminders sent: 1 at 30 days before expiry, 2 at 7 days, 3 at expiry. */
    expiryNotices: integer('expiry_notices').notNull().default(0),
    requestedByUserId: text('requested_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('background_checks_user_idx').on(t.userId, t.createdAt)],
);

/** The yes/no answers of an automatic document reading (never the document's text). */
export interface StoredAddressAutoCheck {
  readable: boolean;
  nameMatches?: boolean;
  addressMatches?: boolean;
  recent?: boolean;
  documentType?: string;
  /** Which reader produced it (`claude:<model>` or `stand-in`). */
  by: string;
  at: string;
}

/**
 * Home address checks with a proof-of-address document (added 2026-11-12). The latest row is the
 * current one, except that a newer proof in review (or turned down) doesn't undo an earlier verified one
 * until staff ask for a new proof (a `requested` row).
 */
export const addressVerifications = pgTable(
  'address_verifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull(), // requested | in_review | verified | rejected | withdrawn
    /** Encrypted JSON { line1, line2?, city, state, zip } (platform/crypto). Null on a request row. */
    addressCiphertext: text('address_ciphertext'),
    /** The neighborhood nearest the address, for staff context (from the geocode, used once). */
    areaId: text('area_id'),
    documentType: text('document_type'),
    /** `files.id` (kind `address_proof`); null once the document is deleted. */
    documentFileId: text('document_file_id'),
    documentDeletedAt: timestamp('document_deleted_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedByUserId: text('decided_by_user_id'),
    rejectionReason: text('rejection_reason'),
    autoCheck: jsonb('auto_check').$type<StoredAddressAutoCheck>(),
    requestedByUserId: text('requested_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('address_verifications_user_idx').on(t.userId, t.createdAt),
    index('address_verifications_status_idx').on(t.status, t.submittedAt),
  ],
);
