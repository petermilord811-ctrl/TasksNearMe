CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "staff_roles" (
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"granted_by" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "staff_session_checks" (
	"session_id" text PRIMARY KEY NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"mode" text DEFAULT 'poster' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"home_market_id" text DEFAULT 'mkt_austin' NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "helper_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"area_id" text,
	"service_radius_km" integer DEFAULT 8 NOT NULL,
	"remote_ok" boolean DEFAULT false NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"languages" jsonb DEFAULT '["en"]'::jsonb NOT NULL,
	"founding_number" integer,
	"id_verified_at" timestamp with time zone,
	"background_checked_at" timestamp with time zone,
	"payouts_ready_at" timestamp with time zone,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"rating_average" double precision,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"response_time_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "helper_profiles_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "helper_services" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category_id" text NOT NULL,
	"pricing_type" text NOT NULL,
	"from_price_cents" integer,
	"hourly_rate_cents" integer,
	"min_hours" integer,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev_outbox_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"to" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_session_checks" ADD CONSTRAINT "staff_session_checks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helper_profiles" ADD CONSTRAINT "helper_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helper_profiles" ADD CONSTRAINT "helper_profiles_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helper_services" ADD CONSTRAINT "helper_services_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helper_services" ADD CONSTRAINT "helper_services_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "helper_services_user_category_idx" ON "helper_services" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "dev_outbox_to_idx" ON "dev_outbox_messages" USING btree ("to","created_at");