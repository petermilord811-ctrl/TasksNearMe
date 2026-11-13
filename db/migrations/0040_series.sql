CREATE TABLE "booking_series" (
	"id" text PRIMARY KEY NOT NULL,
	"poster_user_id" text NOT NULL,
	"helper_user_id" text NOT NULL,
	"market_id" text NOT NULL,
	"template_task_id" text NOT NULL,
	"proposal_id" text NOT NULL,
	"cadence" text NOT NULL,
	"anchor_date" text NOT NULL,
	"start_time" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"pricing_type" text NOT NULL,
	"price_cents" integer,
	"hourly_rate_cents" integer,
	"estimated_hours" double precision,
	"hours_cap" double precision,
	"scope_text" text NOT NULL,
	"payment_method_id" text,
	"status" text NOT NULL,
	"paused_until" text,
	"ends_on" text,
	"changed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "visit_index" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "funding_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "funding_method_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "funding_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "funding_failure" text;--> statement-breakpoint
ALTER TABLE "rebook_proposals" ADD COLUMN "cadence" text;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_poster_user_id_users_id_fk" FOREIGN KEY ("poster_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_template_task_id_tasks_id_fk" FOREIGN KEY ("template_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_series_proposal_idx" ON "booking_series" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "booking_series_poster_idx" ON "booking_series" USING btree ("poster_user_id","status");--> statement-breakpoint
CREATE INDEX "booking_series_helper_idx" ON "booking_series" USING btree ("helper_user_id","status");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_series_id_booking_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."booking_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_series_visit_idx" ON "bookings" USING btree ("series_id","visit_index") WHERE series_id is not null;--> statement-breakpoint
CREATE INDEX "bookings_funding_due_idx" ON "bookings" USING btree ("status","funding_due_at");