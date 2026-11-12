CREATE TABLE "rebook_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"helper_user_id" text NOT NULL,
	"poster_user_id" text NOT NULL,
	"from_booking_id" text NOT NULL,
	"status" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"pricing_type" text NOT NULL,
	"price_cents" integer,
	"hourly_rate_cents" integer,
	"estimated_hours" double precision,
	"hours_cap" double precision,
	"message" text,
	"breakdown" jsonb NOT NULL,
	"task_id" text,
	"booking_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rebook_proposals" ADD CONSTRAINT "rebook_proposals_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebook_proposals" ADD CONSTRAINT "rebook_proposals_poster_user_id_users_id_fk" FOREIGN KEY ("poster_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebook_proposals" ADD CONSTRAINT "rebook_proposals_from_booking_id_bookings_id_fk" FOREIGN KEY ("from_booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebook_proposals" ADD CONSTRAINT "rebook_proposals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebook_proposals" ADD CONSTRAINT "rebook_proposals_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rebook_proposals_open_idx" ON "rebook_proposals" USING btree ("helper_user_id","poster_user_id") WHERE status = 'sent';--> statement-breakpoint
CREATE INDEX "rebook_proposals_poster_idx" ON "rebook_proposals" USING btree ("poster_user_id","created_at");--> statement-breakpoint
CREATE INDEX "rebook_proposals_helper_idx" ON "rebook_proposals" USING btree ("helper_user_id","created_at");