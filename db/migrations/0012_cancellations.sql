CREATE TABLE "helper_strikes" (
	"id" text PRIMARY KEY NOT NULL,
	"helper_user_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"reason" text NOT NULL,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"booking_id" text,
	"amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"provider_ref" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cant_access_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "poster_response_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "canceled_by" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancel_choice" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancel_note" text;--> statement-breakpoint
ALTER TABLE "helper_strikes" ADD CONSTRAINT "helper_strikes_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helper_strikes" ADD CONSTRAINT "helper_strikes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "helper_strikes_helper_idx" ON "helper_strikes" USING btree ("helper_user_id","created_at");--> statement-breakpoint
CREATE INDEX "refunds_booking_idx" ON "refunds" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_idempotency_idx" ON "refunds" USING btree ("idempotency_key");