CREATE TABLE "neighborhood_days" (
	"id" text PRIMARY KEY NOT NULL,
	"helper_user_id" text NOT NULL,
	"market_id" text NOT NULL,
	"area_id" text NOT NULL,
	"category_id" text NOT NULL,
	"day" text NOT NULL,
	"price_cents" integer NOT NULL,
	"neighbor_price_cents" integer,
	"status" text NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_posts" ADD COLUMN "day_id" text;--> statement-breakpoint
ALTER TABLE "neighborhood_days" ADD CONSTRAINT "neighborhood_days_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighborhood_days" ADD CONSTRAINT "neighborhood_days_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighborhood_days" ADD CONSTRAINT "neighborhood_days_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighborhood_days" ADD CONSTRAINT "neighborhood_days_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "neighborhood_days_helper_idx" ON "neighborhood_days" USING btree ("helper_user_id","day");--> statement-breakpoint
CREATE INDEX "neighborhood_days_area_idx" ON "neighborhood_days" USING btree ("area_id","day");--> statement-breakpoint
ALTER TABLE "availability_posts" ADD CONSTRAINT "availability_posts_day_id_neighborhood_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."neighborhood_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_posts_day_idx" ON "availability_posts" USING btree ("day_id");