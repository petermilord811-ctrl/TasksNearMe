CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"poster_user_id" text NOT NULL,
	"helper_user_id" text NOT NULL,
	"status" text NOT NULL,
	"source" text DEFAULT 'profile' NOT NULL,
	"pricing_type" text NOT NULL,
	"price_cents" integer,
	"hourly_rate_cents" integer,
	"estimated_hours" double precision,
	"hours_cap" double precision,
	"start_at" timestamp with time zone NOT NULL,
	"message" text,
	"breakdown" jsonb NOT NULL,
	"counter_pricing_type" text,
	"counter_price_cents" integer,
	"counter_hourly_rate_cents" integer,
	"counter_estimated_hours" double precision,
	"counter_hours_cap" double precision,
	"counter_start_at" timestamp with time zone,
	"counter_message" text,
	"counter_breakdown" jsonb,
	"payment_id" text,
	"booking_id" text,
	"expires_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_poster_user_id_users_id_fk" FOREIGN KEY ("poster_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invites_open_idx" ON "invites" USING btree ("task_id","helper_user_id") WHERE status in ('authorizing', 'sent', 'countered');--> statement-breakpoint
CREATE INDEX "invites_helper_idx" ON "invites" USING btree ("helper_user_id","created_at");--> statement-breakpoint
CREATE INDEX "invites_task_idx" ON "invites" USING btree ("task_id","created_at");