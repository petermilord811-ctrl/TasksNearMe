import { boolean, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

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

export const users = pgTable('users', {
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
});

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
