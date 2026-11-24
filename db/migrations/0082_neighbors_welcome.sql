CREATE TABLE "community_welcomes" (
	"user_id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"area_id" text,
	"moved_at" timestamp with time zone NOT NULL,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "community_welcomes" ADD CONSTRAINT "community_welcomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_welcomes" ADD CONSTRAINT "community_welcomes_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;