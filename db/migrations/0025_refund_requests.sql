CREATE TABLE "refund_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"note" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"status" text NOT NULL,
	"decided_by_user_id" text,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refund_requests_booking_idx" ON "refund_requests" USING btree ("booking_id","status");