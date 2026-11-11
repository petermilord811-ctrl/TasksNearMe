CREATE TABLE "earnings" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"helper_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"transfer_ref" text,
	"transferred_at" timestamp with time zone,
	"payout_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"helper_user_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"arrival_date" text NOT NULL,
	"bank_last4" text NOT NULL,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "earnings_helper_idx" ON "earnings" USING btree ("helper_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "earnings_booking_kind_idx" ON "earnings" USING btree ("booking_id","kind");--> statement-breakpoint
CREATE INDEX "payouts_helper_idx" ON "payouts" USING btree ("helper_user_id","created_at");