CREATE TABLE "booking_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"version" integer NOT NULL,
	"pricing_type" text NOT NULL,
	"price_cents" integer,
	"hourly_rate_cents" integer,
	"estimated_hours" double precision,
	"hours_cap" double precision,
	"expense_allowance_cents" integer DEFAULT 0 NOT NULL,
	"breakdown" jsonb NOT NULL,
	"scope_text" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"offer_id" text,
	"poster_user_id" text NOT NULL,
	"helper_user_id" text NOT NULL,
	"market_id" text NOT NULL,
	"policy_version_id" text NOT NULL,
	"status" text NOT NULL,
	"cancel_reason" text,
	"completed_via" text,
	"terms_version" integer DEFAULT 1 NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"funding_expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"brand" text NOT NULL,
	"last4" text NOT NULL,
	"exp_month" integer NOT NULL,
	"exp_year" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"detached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text,
	"purpose" text NOT NULL,
	"payer_user_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"payment_method_id" text,
	"method_ref" text,
	"method_brand" text,
	"method_last4" text,
	"method_exp_month" integer,
	"method_exp_year" integer,
	"save_method" boolean DEFAULT false NOT NULL,
	"failure_code" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_terms" ADD CONSTRAINT "booking_terms_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_poster_user_id_users_id_fk" FOREIGN KEY ("poster_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_terms_version_idx" ON "booking_terms" USING btree ("booking_id","version");--> statement-breakpoint
CREATE INDEX "bookings_poster_idx" ON "bookings" USING btree ("poster_user_id","status");--> statement-breakpoint
CREATE INDEX "bookings_helper_idx" ON "bookings" USING btree ("helper_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_live_task_idx" ON "bookings" USING btree ("task_id") WHERE status <> 'canceled';--> statement-breakpoint
CREATE INDEX "payment_methods_user_idx" ON "payment_methods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_payer_idx" ON "payments" USING btree ("payer_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_idx" ON "payments" USING btree ("idempotency_key");