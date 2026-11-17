-- Gainesville, FL: the first city (owner, 2026-11-17; completion plan 8.6). The same rows as the base seed (db/seeds/data/gainesville.ts),
-- with fixed ids so both agree. Categories, price guidance and fees start as copies of Austin's, as configured when this runs.
-- Paused (invisible, no bookings, out of the index; ZIP 326 keeps waiting) until dates follow each market's zone (plan 8.1);
-- it opens through marketStatusChange, which brings in the helpers waiting there.
INSERT INTO "markets" ("id", "slug", "name", "state", "time_zone", "currency", "status", "center_lat", "center_lng", "service_radius_km", "zip_prefixes")
VALUES ('mkt_gainesville', 'gainesville', 'Gainesville', 'FL', 'America/New_York', 'USD', 'paused', 29.6516, -82.3248, 25, '["326"]'::jsonb)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "areas" ("id", "market_id", "slug", "name", "center_lat", "center_lng") VALUES
  ('area_gnv_downtown', 'mkt_gainesville', 'downtown', 'Downtown', 29.6516, -82.3248),
  ('area_gnv_duckpond', 'mkt_gainesville', 'duckpond', 'Duckpond', 29.6564, -82.3197),
  ('area_gnv_pleasant_street', 'mkt_gainesville', 'pleasant-street', 'Pleasant Street', 29.6557, -82.3282),
  ('area_gnv_university_heights', 'mkt_gainesville', 'university-heights', 'University Heights', 29.648, -82.335),
  ('area_gnv_midtown', 'mkt_gainesville', 'midtown', 'Midtown', 29.6525, -82.3445),
  ('area_gnv_golfview', 'mkt_gainesville', 'golfview', 'Golfview', 29.6463, -82.3634),
  ('area_gnv_thornebrook', 'mkt_gainesville', 'thornebrook', 'Thornebrook', 29.6755, -82.3876),
  ('area_gnv_millhopper', 'mkt_gainesville', 'millhopper', 'Millhopper', 29.695, -82.392),
  ('area_gnv_northeast', 'mkt_gainesville', 'northeast', 'Northeast Gainesville', 29.673, -82.3002),
  ('area_gnv_southeast', 'mkt_gainesville', 'southeast', 'Southeast Gainesville', 29.64, -82.3009),
  ('area_gnv_southwest', 'mkt_gainesville', 'southwest', 'Southwest Gainesville', 29.6233, -82.3794),
  ('area_gnv_haile_plantation', 'mkt_gainesville', 'haile-plantation', 'Haile Plantation', 29.6097, -82.4382)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "market_categories" ("market_id", "category_id", "enabled", "price_guidance")
SELECT 'mkt_gainesville', "category_id", "enabled", "price_guidance" FROM "market_categories" WHERE "market_id" = 'mkt_austin'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "market_policies" ("id", "market_id", "version", "status", "effective_from", "fees", "cancellation", "timers", "published_by", "published_at")
SELECT 'pol_gainesville_v1', 'mkt_gainesville', 1, 'published', '2026-11-17T05:00:00.000Z', "fees", "cancellation", "timers", 'system', '2026-11-17T05:00:00.000Z'
FROM "market_policies" WHERE "market_id" = 'mkt_austin' AND "status" = 'published'
ORDER BY "version" DESC LIMIT 1
ON CONFLICT DO NOTHING;
