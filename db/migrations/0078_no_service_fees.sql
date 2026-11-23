ALTER TABLE "bookings" ADD COLUMN "payment_mode" text DEFAULT 'held' NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "payment_mode" text DEFAULT 'held' NOT NULL;--> statement-breakpoint
-- No service fees (owner, 2026-11-23): every market publishes a new policy version. The helper fee is gone; the
-- client's fee is the hold fee, 5% (at least $1), charged only when the helper asks to be paid upfront and
-- TasksNearMe holds the money. Plans no longer pay fees back (Plus waives the hold fee instead). Bookings keep the
-- version they were confirmed under, so the previous version is retired, as publishing from /admin/config does.
-- The new version comes after every version of the market, drafts included (a draft may hold the next number).
INSERT INTO "market_policies" ("id", "market_id", "version", "status", "effective_from", "fees", "cancellation", "timers", "plans", "published_by", "published_at")
SELECT 'pol_' || "latest"."market_id" || '_v' || "next"."version" || '_nofees', "latest"."market_id", "next"."version", 'published', now(),
  '{"posterBps": 500, "posterMinCents": 100, "helperBps": 0}'::jsonb, "latest"."cancellation", "latest"."timers",
  CASE WHEN "latest"."plans" IS NULL THEN NULL ELSE jsonb_set(jsonb_set("latest"."plans", '{plus,posterFeeRebateBps}', '0'), '{pro,helperFeeRebateBps}', '0') END,
  'system', now()
FROM (
  SELECT DISTINCT ON ("market_id") * FROM "market_policies" WHERE "status" = 'published' ORDER BY "market_id", "version" DESC
) AS "latest"
CROSS JOIN LATERAL (
  SELECT max("all_versions"."version") + 1 AS "version" FROM "market_policies" AS "all_versions" WHERE "all_versions"."market_id" = "latest"."market_id"
) AS "next"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "market_policies" AS "old" SET "status" = 'retired'
WHERE "old"."status" = 'published'
  AND EXISTS (SELECT 1 FROM "market_policies" AS "newer" WHERE "newer"."market_id" = "old"."market_id" AND "newer"."status" = 'published' AND "newer"."version" > "old"."version");
--> statement-breakpoint
-- A draft made before the change holds the old fees: it's retired with them, so publishing it can't bring them back.
UPDATE "market_policies" AS "draft" SET "status" = 'retired'
WHERE "draft"."status" = 'draft'
  AND EXISTS (SELECT 1 FROM "market_policies" AS "newer" WHERE "newer"."market_id" = "draft"."market_id" AND "newer"."status" = 'published' AND "newer"."version" > "draft"."version");
