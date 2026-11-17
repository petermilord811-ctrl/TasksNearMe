ALTER TABLE "users" ALTER COLUMN "home_market_id" SET DEFAULT 'mkt_gainesville';--> statement-breakpoint
-- Gainesville, FL opens in pre-launch as the first city (owner, 2026-11-17; completion plan 8.6), now that dates follow
-- each market's own zone (8.1). What setMarketStatus does on an opening move, in one statement: the status (only if still
-- paused), the helpers waiting there brought in (active, no neighborhood yet, a 326 ZIP) with their city_open notice
-- (the outbox event emitVerificationEvent writes), and the audit row. New sign-ups start in Gainesville (the default
-- above, with the auth config's).
WITH "opened" AS (
  UPDATE "markets" SET "status" = 'prelaunch', "updated_at" = now()
  WHERE "id" = 'mkt_gainesville' AND "status" = 'paused'
  RETURNING "id", "name"
), "covered" AS (
  UPDATE "users" SET "home_market_id" = 'mkt_gainesville', "updated_at" = now()
  FROM "helper_profiles", "opened"
  WHERE "helper_profiles"."user_id" = "users"."id"
    AND "helper_profiles"."area_id" IS NULL
    AND left("helper_profiles"."home_zip", 3) = '326'
    AND "users"."status" = 'active'
  RETURNING "users"."id"
), "told" AS (
  INSERT INTO "outbox_events" ("id", "type", "aggregate_type", "aggregate_id", "payload")
  SELECT 'evt_' || replace(gen_random_uuid()::text, '-', ''), 'verification.updated', 'user', "covered"."id",
    jsonb_build_object('userId', "covered"."id", 'track', 'helper', 'outcome', 'city_open', 'city', 'Gainesville')
  FROM "covered"
  RETURNING 1
)
INSERT INTO "audit_log" ("id", "actor_id", "actor_role", "action", "target_type", "target_id", "reason", "metadata")
SELECT 'aud_' || replace(gen_random_uuid()::text, '-', ''), NULL, 'system', 'config.market_status', 'market', "opened"."id",
  'Gainesville, FL is the first city (owner, 2026-11-17); it opens in pre-launch now that dates follow each market''s zone (plan 8.1)',
  jsonb_build_object('from', 'paused', 'to', 'prelaunch', 'helpersBroughtIn', (SELECT count(*) FROM "covered"), 'waitlistQueued', 0, 'by', 'migration 0063')
FROM "opened";
--> statement-breakpoint
-- Austin, TX becomes a later city (owner, 2026-11-17): paused until it opens again, so its pages answer 404 and leave
-- search, and Austin ZIPs wait like any city we haven't opened. Audited with the status it had.
WITH "before" AS (
  SELECT "id", "status" FROM "markets" WHERE "id" = 'mkt_austin' AND "status" IN ('prelaunch', 'live')
), "closed" AS (
  UPDATE "markets" SET "status" = 'paused', "updated_at" = now()
  FROM "before" WHERE "markets"."id" = "before"."id"
  RETURNING "markets"."id"
)
INSERT INTO "audit_log" ("id", "actor_id", "actor_role", "action", "target_type", "target_id", "reason", "metadata")
SELECT 'aud_' || replace(gen_random_uuid()::text, '-', ''), NULL, 'system', 'config.market_status', 'market', "before"."id",
  'Austin, TX becomes a later city: Gainesville, FL is the first (owner, 2026-11-17)',
  jsonb_build_object('from', "before"."status", 'to', 'paused', 'helpersBroughtIn', 0, 'waitlistQueued', 0, 'by', 'migration 0063')
FROM "before" JOIN "closed" ON "closed"."id" = "before"."id";
