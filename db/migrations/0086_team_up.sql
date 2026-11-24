CREATE TABLE "booking_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_booking_id" text NOT NULL,
	"task_id" text NOT NULL,
	"client_user_id" text NOT NULL,
	"lead_user_id" text NOT NULL,
	"partner_user_id" text NOT NULL,
	"status" text NOT NULL,
	"pricing_type" text NOT NULL,
	"price_cents" integer,
	"hourly_rate_cents" integer,
	"estimated_hours" double precision,
	"hours_cap" double precision,
	"note" text,
	"team_thread_id" text,
	"partner_task_id" text,
	"partner_offer_id" text,
	"client_kept_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "team_part_of" text;--> statement-breakpoint
ALTER TABLE "booking_teams" ADD CONSTRAINT "booking_teams_lead_booking_id_bookings_id_fk" FOREIGN KEY ("lead_booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_teams" ADD CONSTRAINT "booking_teams_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_teams" ADD CONSTRAINT "booking_teams_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_teams" ADD CONSTRAINT "booking_teams_lead_user_id_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_teams" ADD CONSTRAINT "booking_teams_partner_user_id_users_id_fk" FOREIGN KEY ("partner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_teams" ADD CONSTRAINT "booking_teams_partner_task_id_tasks_id_fk" FOREIGN KEY ("partner_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_teams" ADD CONSTRAINT "booking_teams_partner_offer_id_offers_id_fk" FOREIGN KEY ("partner_offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_teams_lead_booking_idx" ON "booking_teams" USING btree ("lead_booking_id","created_at");--> statement-breakpoint
CREATE INDEX "booking_teams_partner_idx" ON "booking_teams" USING btree ("partner_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_teams_open_idx" ON "booking_teams" USING btree ("lead_booking_id") WHERE status in ('invited', 'accepted');--> statement-breakpoint
CREATE UNIQUE INDEX "booking_teams_partner_task_idx" ON "booking_teams" USING btree ("partner_task_id") WHERE partner_task_id is not null;