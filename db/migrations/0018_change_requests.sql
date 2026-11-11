CREATE TABLE "booking_change_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"proposed_by_user_id" text NOT NULL,
	"status" text NOT NULL,
	"types" jsonb NOT NULL,
	"from_version" integer NOT NULL,
	"pricing_type" text NOT NULL,
	"price_cents" integer,
	"hourly_rate_cents" integer,
	"estimated_hours" double precision,
	"hours_cap" double precision,
	"start_at" timestamp with time zone NOT NULL,
	"scope_text" text NOT NULL,
	"expense_allowance_cents" integer DEFAULT 0 NOT NULL,
	"message" text NOT NULL,
	"before_breakdown" jsonb NOT NULL,
	"after_breakdown" jsonb NOT NULL,
	"difference_cents" integer NOT NULL,
	"payment_id" text,
	"expires_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_change_requests" ADD CONSTRAINT "booking_change_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_change_requests" ADD CONSTRAINT "booking_change_requests_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_change_requests_open_idx" ON "booking_change_requests" USING btree ("booking_id") WHERE status in ('proposed', 'accepted_pending_funding');--> statement-breakpoint
CREATE INDEX "booking_change_requests_booking_idx" ON "booking_change_requests" USING btree ("booking_id","created_at");