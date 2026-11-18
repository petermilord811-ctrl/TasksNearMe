import { index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '../accounts/schema';
import { areas, markets } from '../markets/schema';
import { tasks } from '../tasks/schema';

/**
 * The community feed (completion plan 7.7–7.8): members of a market ask their neighbors for a recommendation,
 * ask a question, share a tip, or thank a helper they booked. Posts belong to a neighborhood (`area_id`) or the
 * whole market (null). One level of replies; a reply to a recommendation request can name a helper. Counters
 * are kept on the rows so the feed reads one table. Masked like messages when written.
 */
export const communityPosts = pgTable(
  'community_posts',
  {
    id: text('id').primaryKey(),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    areaId: text('area_id').references(() => areas.id),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(), // recommendation | question | tip | thanks
    categorySlug: text('category_slug'),
    /** A thanks post: the helper thanked, from a completed, paid booking. */
    helperUserId: text('helper_user_id').references(() => users.id),
    bookingId: text('booking_id'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull().default('visible'), // visible | hidden (staff) | removed (staff or author)
    moderationReason: text('moderation_reason'),
    moderatedByUserId: text('moderated_by_user_id').references(() => users.id),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    pinnedReplyId: text('pinned_reply_id'),
    /**
     * The task this post became ("Ask for help", completion plan 9.10): its author posted the ask as a task. The post
     * links to it (closed once the task is booked, done, canceled or expired) and the task back to its discussion.
     * Set null if the task row ever goes away, so a task is never kept alive by a post.
     */
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    replyCount: integer('reply_count').notNull().default(0),
    thanksCount: integer('thanks_count').notNull().default(0),
    helpfulCount: integer('helpful_count').notNull().default(0),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('community_posts_feed_idx').on(t.marketId, t.status, t.lastActivityAt),
    index('community_posts_area_idx').on(t.areaId, t.status, t.lastActivityAt),
    index('community_posts_author_idx').on(t.authorUserId, t.createdAt),
    index('community_posts_helper_idx').on(t.helperUserId),
    // One thanks post per booking.
    uniqueIndex('community_posts_booking_idx').on(t.bookingId).where(sql`${t.bookingId} is not null`),
    // One post per task it became.
    uniqueIndex('community_posts_task_idx').on(t.taskId).where(sql`${t.taskId} is not null`),
  ],
);

export const communityReplies = pgTable(
  'community_replies',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => communityPosts.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    /** A recommendation request's answer can name one helper (7.8), shown as a card people can book. */
    recommendedHelperUserId: text('recommended_helper_user_id').references(() => users.id),
    status: text('status').notNull().default('visible'),
    moderationReason: text('moderation_reason'),
    moderatedByUserId: text('moderated_by_user_id').references(() => users.id),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    thanksCount: integer('thanks_count').notNull().default(0),
    helpfulCount: integer('helpful_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('community_replies_post_idx').on(t.postId, t.createdAt),
    index('community_replies_author_idx').on(t.authorUserId, t.createdAt),
    index('community_replies_helper_idx').on(t.recommendedHelperUserId),
    // One named helper per person per request.
    uniqueIndex('community_replies_one_recommendation_idx').on(t.postId, t.authorUserId).where(sql`${t.recommendedHelperUserId} is not null`),
  ],
);

/** Thanks and Helpful on a post or a reply: one of each per person. */
export const communityReactions = pgTable(
  'community_reactions',
  {
    targetKind: text('target_kind').notNull(), // post | reply
    targetId: text('target_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(), // thanks | helpful
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.targetKind, t.targetId, t.userId, t.kind] }), index('community_reactions_user_idx').on(t.userId, t.createdAt)],
);

/**
 * Saved posts (completion plan 9.10, Reddit-style): a member keeps a post to come back to. Private to them; read
 * through the same rules as the feed (visible posts in their market, nobody they blocked or who blocked them).
 */
export const communitySaves = pgTable(
  'community_saves',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    postId: text('post_id')
      .notNull()
      .references(() => communityPosts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] }), index('community_saves_user_idx').on(t.userId, t.createdAt)],
);
