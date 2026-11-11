CREATE TABLE "reward_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"helper_user_id" text NOT NULL,
	"program" text NOT NULL,
	"program_version" integer DEFAULT 1 NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"booking_id" text,
	"poster_user_id" text,
	"hold_until" timestamp with time zone,
	"redeemable_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"void_reason" text,
	"provider_order_id" text,
	"delivery_url" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_poster_user_id_users_id_fk" FOREIGN KEY ("poster_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reward_grants_helper_idx" ON "reward_grants" USING btree ("helper_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_grants_welcome_idx" ON "reward_grants" USING btree ("helper_user_id") WHERE program = 'welcome' and status <> 'voided';--> statement-breakpoint
CREATE UNIQUE INDEX "reward_grants_repeat_idx" ON "reward_grants" USING btree ("helper_user_id","poster_user_id") WHERE program = 'repeat' and status <> 'voided';--> statement-breakpoint
CREATE UNIQUE INDEX "reward_grants_booking_level_idx" ON "reward_grants" USING btree ("booking_id") WHERE program in ('welcome', 'acceptance', 'completion') and status <> 'voided';