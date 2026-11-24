import { type AnyPgColumn, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '../accounts/schema';
import { areas, markets } from '../markets/schema';
import { files, tasks } from '../tasks/schema';

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
    /** The author last edited its words (plan 10.5): the post says "Edited"; earlier versions stay in `community_edits`. */
    editedAt: timestamp('edited_at', { withTimezone: true }),
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
    /**
     * The reply this one answers ("Replying to Maya R.", plan 10.10): its author is told. Replies stay one level on
     * screen; this only names who it's for. Set null if that reply row ever goes away.
     */
    replyToId: text('reply_to_id').references((): AnyPgColumn => communityReplies.id, { onDelete: 'set null' }),
    /** The author last edited it (plan 10.5); earlier versions stay in `community_edits`. */
    editedAt: timestamp('edited_at', { withTimezone: true }),
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

/**
 * Photos on posts (up to 4) and replies (1) (plan 10.1): uploaded files (kind `community_photo`, re-encoded with every
 * bit of metadata dropped), attached when the post or reply is written. One row per file, so a file belongs to one
 * post or reply only. Who may see one is who may read what it's on (src/modules/files/related-access.ts).
 */
export const communityPhotos = pgTable(
  'community_photos',
  {
    fileId: text('file_id')
      .primaryKey()
      .references(() => files.id, { onDelete: 'cascade' }),
    postId: text('post_id')
      .notNull()
      .references(() => communityPosts.id, { onDelete: 'cascade' }),
    /** A reply's photo; null for the post's own. */
    replyId: text('reply_id').references(() => communityReplies.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('community_photos_post_idx').on(t.postId, t.position), index('community_photos_reply_idx').on(t.replyId)],
);

/**
 * Earlier versions of edited posts and replies (plan 10.5): what the words were before each edit, for staff, so an
 * edit can't hide what someone reported. Never shown to members.
 */
export const communityEdits = pgTable(
  'community_edits',
  {
    id: text('id').primaryKey(),
    targetKind: text('target_kind').notNull(), // post | reply
    targetId: text('target_id').notNull(),
    editorUserId: text('editor_user_id')
      .notNull()
      .references(() => users.id),
    /** A post's title before the edit (null for a reply). */
    title: text('title'),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('community_edits_target_idx').on(t.targetKind, t.targetId, t.createdAt)],
);

/**
 * Who follows a post (plan 10.9): its author, people who replied or saved it, and anyone who taps Follow hear about
 * new replies (at most one notice a post an hour). `muted` stops that for good, even after they reply again.
 */
export const communityFollows = pgTable(
  'community_follows',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    postId: text('post_id')
      .notNull()
      .references(() => communityPosts.id, { onDelete: 'cascade' }),
    state: text('state').notNull(), // following | muted
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] }), index('community_follows_post_idx').on(t.postId, t.state)],
);

/**
 * The card staff pin at the top of a market's Neighbors (plan 10.16): a welcome at launch, a holiday note. One live
 * per market at a time (the newest that has started and not ended), in English and Spanish; members can dismiss it.
 */
export const communityAnnouncements = pgTable(
  'community_announcements',
  {
    id: text('id').primaryKey(),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    titleEn: text('title_en').notNull(),
    bodyEn: text('body_en').notNull(),
    titleEs: text('title_es').notNull(),
    bodyEs: text('body_es').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    /** Staff took it down before its end. */
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('community_announcements_market_idx').on(t.marketId, t.startsAt)],
);

/** Members who closed an announcement: it stays closed on every device. */
export const communityAnnouncementDismissals = pgTable(
  'community_announcement_dismissals',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    announcementId: text('announcement_id')
      .notNull()
      .references(() => communityAnnouncements.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.announcementId] })],
);

/**
 * "Welcome to Mueller" (2026-11-24): a person's latest move, for the welcome at the top of Neighbors. Written when they
 * choose or change their neighborhood (a ZIP that moves their market too); a new account has no row until it closes
 * its first welcome. One row a person: the next move replaces it, so its welcome comes back once. Only that person
 * ever sees it.
 */
export const communityWelcomes = pgTable('community_welcomes', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  marketId: text('market_id')
    .notNull()
    .references(() => markets.id),
  /** The neighborhood they moved to; null when only the market is known. No foreign key, like `users.home_area_id`. */
  areaId: text('area_id'),
  movedAt: timestamp('moved_at', { withTimezone: true }).notNull(),
  /** They closed this move's welcome ("Got it"): it stays closed on every device. */
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
});
