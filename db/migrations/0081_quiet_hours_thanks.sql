CREATE TABLE "notification_quiet_hours" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"starts_at" text NOT NULL,
	"ends_at" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thank_you_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"helper_user_id" text NOT NULL,
	"body" text NOT NULL,
	"hide_name" boolean DEFAULT false NOT NULL,
	"shown_on_profile" boolean DEFAULT false NOT NULL,
	"shown_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_by_user_id" text,
	"hidden_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_quiet_hours" ADD CONSTRAINT "notification_quiet_hours_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thank_you_notes" ADD CONSTRAINT "thank_you_notes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thank_you_notes" ADD CONSTRAINT "thank_you_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thank_you_notes" ADD CONSTRAINT "thank_you_notes_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "thank_you_notes_booking_idx" ON "thank_you_notes" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "thank_you_notes_helper_idx" ON "thank_you_notes" USING btree ("helper_user_id","created_at");