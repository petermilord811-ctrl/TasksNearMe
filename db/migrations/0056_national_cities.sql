-- National, cities open in turn (owner, 2026-11-14): markets list the ZIP3 prefixes they cover, helpers outside every
-- open market keep a ZIP and city, and waitlist entries keep the city typed and the ZIP's state.
ALTER TABLE "waitlist_entries" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "zip_prefixes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "helper_profiles" ADD COLUMN "home_zip" text;--> statement-breakpoint
ALTER TABLE "helper_profiles" ADD COLUMN "home_city" text;--> statement-breakpoint
ALTER TABLE "helper_profiles" ADD COLUMN "home_state" text;--> statement-breakpoint
-- Austin, on databases seeded before this column: 787 is the city, 786 the towns around it (db/seeds/data/austin.ts).
UPDATE "markets" SET "zip_prefixes" = '["786","787"]'::jsonb WHERE "id" = 'mkt_austin' AND "zip_prefixes" = '[]'::jsonb;
