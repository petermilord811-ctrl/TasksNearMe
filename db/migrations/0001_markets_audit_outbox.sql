CREATE TABLE "areas" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"center_lat" double precision NOT NULL,
	"center_lng" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"in_home" boolean NOT NULL,
	"remote_allowed" boolean NOT NULL,
	"requires_background_check" boolean NOT NULL,
	"default_pricing_type" text NOT NULL,
	"min_price_cents" integer NOT NULL,
	"min_hours" integer,
	"required_evidence" jsonb NOT NULL,
	"prohibited_keywords" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text NOT NULL,
	"market_id" text DEFAULT 'global' NOT NULL,
	"enabled" boolean NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_key_market_id_pk" PRIMARY KEY("key","market_id")
);
--> statement-breakpoint
CREATE TABLE "market_categories" (
	"market_id" text NOT NULL,
	"category_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"price_guidance" jsonb NOT NULL,
	CONSTRAINT "market_categories_market_id_category_id_pk" PRIMARY KEY("market_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "market_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"effective_from" timestamp with time zone,
	"fees" jsonb NOT NULL,
	"cancellation" jsonb NOT NULL,
	"timers" jsonb NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"time_zone" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text NOT NULL,
	"center_lat" double precision NOT NULL,
	"center_lng" double precision NOT NULL,
	"service_radius_km" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "markets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_categories" ADD CONSTRAINT "market_categories_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_categories" ADD CONSTRAINT "market_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_policies" ADD CONSTRAINT "market_policies_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "areas_market_slug_idx" ON "areas" USING btree ("market_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "market_policies_market_version_idx" ON "market_policies" USING btree ("market_id","version");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" USING btree ("dispatched_at","created_at");