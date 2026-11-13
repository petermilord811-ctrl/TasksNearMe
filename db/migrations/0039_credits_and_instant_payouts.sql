CREATE TABLE "credit_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"credit_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"refund_id" text,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poster_credits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"remaining_cents" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"granted_by_user_id" text,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "method" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_redemptions" ADD CONSTRAINT "credit_redemptions_credit_id_poster_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."poster_credits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_credits" ADD CONSTRAINT "poster_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_credits" ADD CONSTRAINT "poster_credits_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_redemptions_credit_booking_idx" ON "credit_redemptions" USING btree ("credit_id","booking_id");--> statement-breakpoint
CREATE INDEX "credit_redemptions_booking_idx" ON "credit_redemptions" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "poster_credits_user_idx" ON "poster_credits" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "poster_credits_one_welcome_idx" ON "poster_credits" USING btree ("user_id") WHERE kind = 'welcome';