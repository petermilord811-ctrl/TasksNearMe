CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"helper_user_id" text NOT NULL,
	"status" text NOT NULL,
	"pricing_type" text NOT NULL,
	"price_cents" integer,
	"hourly_rate_cents" integer,
	"estimated_hours" double precision,
	"hours_cap" double precision,
	"proposed_start" timestamp with time zone NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"brings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"poster_seen_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offers_task_idx" ON "offers" USING btree ("task_id","status");--> statement-breakpoint
CREATE INDEX "offers_helper_idx" ON "offers" USING btree ("helper_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_active_helper_task_idx" ON "offers" USING btree ("task_id","helper_user_id") WHERE status in ('pending', 'stale');