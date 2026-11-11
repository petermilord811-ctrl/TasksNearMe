CREATE TABLE "availability_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"helper_user_id" text NOT NULL,
	"market_id" text NOT NULL,
	"category_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"pricing_type" text NOT NULL,
	"price_cents" integer,
	"hourly_rate_cents" integer,
	"estimated_hours" double precision,
	"hours_cap" double precision,
	"status" text NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "slot_id" text;--> statement-breakpoint
ALTER TABLE "availability_posts" ADD CONSTRAINT "availability_posts_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_posts" ADD CONSTRAINT "availability_posts_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_posts" ADD CONSTRAINT "availability_posts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_posts_helper_idx" ON "availability_posts" USING btree ("helper_user_id","start_at");--> statement-breakpoint
CREATE INDEX "availability_posts_status_idx" ON "availability_posts" USING btree ("status","start_at");--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_slot_id_availability_posts_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invites_open_slot_idx" ON "invites" USING btree ("slot_id") WHERE status in ('authorizing', 'sent', 'countered');