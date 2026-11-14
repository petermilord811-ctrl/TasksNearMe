CREATE TABLE "cache_tag_invalidations" (
	"tag" text PRIMARY KEY NOT NULL,
	"stale_at" bigint,
	"expired_at" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cache_tag_invalidations_updated_idx" ON "cache_tag_invalidations" USING btree ("updated_at");