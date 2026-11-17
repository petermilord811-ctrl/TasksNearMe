import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Better Auth tables (user, session, account, verification) plus TasksNearMe's own account data.
 * Property names match Better Auth's field names; timestamps use Date mode because Better Auth
 * reads and writes Date objects. Our extra user fields are declared as `additionalFields` in
 * src/platform/auth/auth.ts and must stay in sync with this file.
 */

const authTimestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    /** Display name, e.g. "Maya R." (first name + last initial). */
    name: text('name').notNull().default(''),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    ...authTimestamps,
    // TasksNearMe fields (Better Auth additionalFields).
    firstName: text('first_name').notNull().default(''),
    /** Private. Never sent to public screens. */
    lastName: text('last_name').notNull().default(''),
    phone: text('phone'),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    mode: text('mode').notNull().default('poster'), // poster | helper
    status: text('status').notNull().default('active'), // active | restricted | suspended | banned | deleted
    homeMarketId: text('home_market_id').notNull().default('mkt_austin'),
    /** "I'm 18 or older", ticked during sign-up. */
    adultAttestedAt: timestamp('adult_attested_at', { withTimezone: true }),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    /** The terms version accepted, e.g. "draft-0.1". */
    termsVersion: text('terms_version'),
    /** When the welcome email went out (once, when sign-up finished). */
    welcomedAt: timestamp('welcomed_at', { withTimezone: true }),
    /** The profile photo (`files.id`, kind `avatar`, a 512 px square). No foreign key: files reference users. */
    avatarFileId: text('avatar_file_id'),
    /**
     * The language they use the app in ('en' | 'es'): set at sign-up from the language they signed up in,
     * changed on the account page. Emails and texts go out in it; signing in sets the device to it.
     */
    locale: text('locale'),
    /**
     * The last time they had the app open (completion plan 7.1): a heartbeat from the live connection, at most
     * once a minute. Shown as "Active now" or "Active 2 h ago" only to people they talk to, and only while
     * `showActivity` is on.
     */
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    /** "Show when I'm active" on the account page; on by default, off hides their activity from everyone. */
    showActivity: boolean('show_activity').notNull().default(true),
    /**
     * Since when the account's sign-in details are held (completion plan 5.23): someone used the "Not you?" link
     * in a contact change notice. Until trust and safety or an admin clears it on the person page, the email and
     * phone can't change and no passkey or Google or Microsoft sign-in can be added. Signing in still works.
     */
    contactHoldAt: timestamp('contact_hold_at', { withTimezone: true }),
  },
  // One account per verified phone number (NULLs don't collide).
  (t) => [uniqueIndex('users_phone_idx').on(t.phone)],
);

/**
 * The "Not you?" link in an email or phone change notice (completion plan 5.23): one row per change, sent to the
 * old address or number. Only the row's id travels, signed with HMAC (contact-revert-token.ts); the row holds the
 * link's expiry and its single use. `previousValue` (the old address, or the old number in E.164) and `newValue`
 * let the change be undone. Both are cleared once the link is used or expires (the hourly sweep in
 * privacy/retention.ts), and deleting the account removes the rows.
 */
export const contactChangeReverts = pgTable(
  'contact_change_reverts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // email | phone
    previousValue: text('previous_value'),
    newValue: text('new_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [index('contact_change_reverts_user_idx').on(t.userId, t.kind, t.createdAt)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...authTimestamps,
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...authTimestamps,
  },
  (t) => [index('accounts_user_idx').on(t.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...authTimestamps,
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

/** Staff roles (docs/blueprint/08 §4). A user with no rows here is not staff. */
export const staffRoles = pgTable(
  'staff_roles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // support_agent | support_lead | trust_safety | finance | admin
    grantedBy: text('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

/** Sessions that passed the staff two-step check (/admin/verify). */
export const staffSessionChecks = pgTable('staff_session_checks', {
  sessionId: text('session_id')
    .primaryKey()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Phone verification attempts (blueprint 06 §1, backlog B-011). One pending row per user at a
 * time. Three wrong codes lock the number for 10 minutes. With Twilio Verify the provider keeps
 * the code; the fake provider (development) stores a hash of it here.
 */
export const phoneVerifications = pgTable(
  'phone_verifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(), // E.164
    status: text('status').notNull(), // pending | approved | locked | canceled
    attempts: integer('attempts').notNull().default(0),
    codeHash: text('code_hash'),
    providerRef: text('provider_ref'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    resendAvailableAt: timestamp('resend_available_at', { withTimezone: true }).notNull(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('phone_verifications_user_idx').on(t.userId, t.createdAt)],
);

/**
 * Agreements people accept (blueprint 08 `agreements`): the helper agreement, the Texas biometric notice
 * before an ID check (CUBI), and the background-check disclosure before Checkr. One row per person, document
 * and version, with where it was accepted from. The sign-up terms stay on `users.terms_version`.
 */
export const agreements = pgTable(
  'agreements',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    doc: text('doc').notNull(), // helper_agreement | biometric_consent | bg_check_disclosure
    version: text('version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [uniqueIndex('agreements_user_doc_version_idx').on(t.userId, t.doc, t.version)],
);

/** A staff member's authenticator app (TOTP): the key, encrypted, and the last code step used (no replays). Unconfirmed until its first code. */
export const staffAuthenticators = pgTable('staff_authenticators', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secretCiphertext: text('secret_ciphertext').notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  lastStep: integer('last_step'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One-time setup codes admins give new staff (hashed; 24 hours; used once). */
export const staffSetupCodes = pgTable(
  'staff_setup_codes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    createdByUserId: text('created_by_user_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('staff_setup_codes_user_idx').on(t.userId, t.createdAt)],
);

/**
 * Passkeys (blueprint 01 P2): a person's WebAuthn credentials, stored by Better Auth's passkey plugin under
 * these exact field names. Only the public key is kept; the private key never leaves the person's device.
 */
export const passkeys = pgTable(
  'passkeys',
  {
    id: text('id').primaryKey(),
    /** The person's own label ("iPhone", "Work laptop"). */
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    createdAt: timestamp('created_at', { withTimezone: true }),
    aaguid: text('aaguid'),
  },
  (t) => [index('passkeys_user_idx').on(t.userId), uniqueIndex('passkeys_credential_idx').on(t.credentialID)],
);
