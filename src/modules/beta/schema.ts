import { index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';
import { markets } from '../markets/schema';

/**
 * Private beta (blueprint 11 B-068): invite codes staff share, and who got in with which (per market and
 * role). The switches that make a market invite-only are feature flags (`beta.sign_up`, `beta.helpers`).
 */
export const betaInviteCodes = pgTable(
  'beta_invite_codes',
  {
    id: text('id').primaryKey(),
    /** Normalized: upper case, no spaces or dashes. */
    code: text('code').notNull(),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    role: text('role').notNull(), // poster | helper
    /** Who it's for, for staff ("Mueller neighborhood group"). */
    label: text('label').notNull(),
    maxUses: integer('max_uses').notNull(),
    uses: integer('uses').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByUserId: text('revoked_by_user_id').references(() => users.id),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('beta_invite_codes_code_idx').on(t.code), index('beta_invite_codes_market_idx').on(t.marketId)],
);

/** Access during the beta: one row per person, market and role, with the code that gave it. */
export const betaAccess = pgTable(
  'beta_access',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    role: text('role').notNull(), // poster | helper
    codeId: text('code_id').references(() => betaInviteCodes.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.marketId, t.role] }), index('beta_access_code_idx').on(t.codeId)],
);
