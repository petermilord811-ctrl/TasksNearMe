CREATE TABLE "community_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"area_id" text,
	"author_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"category_slug" text,
	"helper_user_id" text,
	"booking_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"moderation_reason" text,
	"moderated_by_user_id" text,
	"moderated_at" timestamp with time zone,
	"pinned_reply_id" text,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"thanks_count" integer DEFAULT 0 NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_reactions" (
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_reactions_target_kind_target_id_user_id_kind_pk" PRIMARY KEY("target_kind","target_id","user_id","kind")
);
--> statement-breakpoint
CREATE TABLE "community_replies" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"recommended_helper_user_id" text,
	"status" text DEFAULT 'visible' NOT NULL,
	"moderation_reason" text,
	"moderated_by_user_id" text,
	"moderated_at" timestamp with time zone,
	"thanks_count" integer DEFAULT 0 NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"asker_user_id" text NOT NULL,
	"body" text NOT NULL,
	"answer_body" text,
	"answered_at" timestamp with time zone,
	"pinned" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"moderation_reason" text,
	"moderated_by_user_id" text,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"market_id" text NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"alert" text DEFAULT 'off' NOT NULL,
	"last_alert_at" timestamp with time zone,
	"last_digest_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_recommended_helper_user_id_users_id_fk" FOREIGN KEY ("recommended_helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_questions" ADD CONSTRAINT "task_questions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_questions" ADD CONSTRAINT "task_questions_asker_user_id_users_id_fk" FOREIGN KEY ("asker_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_questions" ADD CONSTRAINT "task_questions_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_posts_feed_idx" ON "community_posts" USING btree ("market_id","status","last_activity_at");--> statement-breakpoint
CREATE INDEX "community_posts_area_idx" ON "community_posts" USING btree ("area_id","status","last_activity_at");--> statement-breakpoint
CREATE INDEX "community_posts_author_idx" ON "community_posts" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE INDEX "community_posts_helper_idx" ON "community_posts" USING btree ("helper_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_posts_booking_idx" ON "community_posts" USING btree ("booking_id") WHERE "community_posts"."booking_id" is not null;--> statement-breakpoint
CREATE INDEX "community_reactions_user_idx" ON "community_reactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "community_replies_post_idx" ON "community_replies" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "community_replies_author_idx" ON "community_replies" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE INDEX "community_replies_helper_idx" ON "community_replies" USING btree ("recommended_helper_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_replies_one_recommendation_idx" ON "community_replies" USING btree ("post_id","author_user_id") WHERE "community_replies"."recommended_helper_user_id" is not null;--> statement-breakpoint
CREATE INDEX "task_questions_task_idx" ON "task_questions" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_questions_asker_idx" ON "task_questions" USING btree ("asker_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "task_questions_one_open_idx" ON "task_questions" USING btree ("task_id","asker_user_id") WHERE "task_questions"."answer_body" is null and "task_questions"."status" = 'visible';--> statement-breakpoint
CREATE INDEX "saved_searches_user_idx" ON "saved_searches" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "saved_searches_alert_idx" ON "saved_searches" USING btree ("market_id","alert");