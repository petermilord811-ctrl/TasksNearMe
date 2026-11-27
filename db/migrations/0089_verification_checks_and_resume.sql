ALTER TABLE "helper_profiles" ADD COLUMN "skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "helper_profiles" ADD COLUMN "likes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "helper_profiles" ADD COLUMN "excludes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "helper_profiles" ADD COLUMN "experience" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "address_verifications" ADD COLUMN "decided_by" text;--> statement-breakpoint
ALTER TABLE "identity_captures" ADD COLUMN "details_ciphertext" text;--> statement-breakpoint
ALTER TABLE "identity_captures" ADD COLUMN "decided_by" text;--> statement-breakpoint
UPDATE "identity_captures" SET "decided_by" = 'staff' WHERE "decided_at" IS NOT NULL AND "status" IN ('approved', 'rejected');--> statement-breakpoint
UPDATE "address_verifications" SET "decided_by" = 'staff' WHERE "decided_at" IS NOT NULL AND "status" IN ('verified', 'rejected');--> statement-breakpoint
INSERT INTO "feature_flags" ("key", "market_id", "enabled", "description") VALUES ('auto_verification', 'global', true, 'Automatic decisions on ID photos and proofs of address: clean readings are approved without staff, doubtful ones go to the queue') ON CONFLICT DO NOTHING;
