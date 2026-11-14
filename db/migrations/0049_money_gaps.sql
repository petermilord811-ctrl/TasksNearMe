CREATE TABLE "transfer_reversals" (
	"id" text PRIMARY KEY NOT NULL,
	"earnings_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"case_id" text NOT NULL,
	"status" text NOT NULL,
	"stripe_reversal_id" text,
	"created_by_user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "dispute_status" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "dispute_id" text;--> statement-breakpoint
ALTER TABLE "transfer_reversals" ADD CONSTRAINT "transfer_reversals_earnings_id_earnings_id_fk" FOREIGN KEY ("earnings_id") REFERENCES "public"."earnings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_reversals" ADD CONSTRAINT "transfer_reversals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_reversals_idempotency_idx" ON "transfer_reversals" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "transfer_reversals_earnings_idx" ON "transfer_reversals" USING btree ("earnings_id");