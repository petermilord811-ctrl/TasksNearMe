ALTER TABLE "thread_participants" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
-- Direct conversations from before message requests (2026-11-23) stay in both people's lists: accepted as they began.
UPDATE "thread_participants" SET "accepted_at" = "threads"."created_at" FROM "threads" WHERE "threads"."id" = "thread_participants"."thread_id" AND "threads"."kind" = 'direct';
