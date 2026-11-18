-- The neighborhood portal (completion plan 9.10): a post can become a task ("Ask for help"), linked both ways
-- through community_posts.task_id (one post per task; set null if the task row ever goes away, so a post never keeps
-- a task alive), and members save posts to come back to (community_saves, read through the feed's own rules).
CREATE TABLE "community_saves" (
	"user_id" text NOT NULL,
	"post_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_saves_user_id_post_id_pk" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
ALTER TABLE "community_posts" ADD COLUMN "task_id" text;--> statement-breakpoint
ALTER TABLE "community_saves" ADD CONSTRAINT "community_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_saves" ADD CONSTRAINT "community_saves_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_saves_user_idx" ON "community_saves" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_posts_task_idx" ON "community_posts" USING btree ("task_id") WHERE "community_posts"."task_id" is not null;