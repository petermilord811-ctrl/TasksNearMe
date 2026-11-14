ALTER TABLE "identity_captures" ADD COLUMN "document_hash" text;--> statement-breakpoint
ALTER TABLE "identity_captures" ADD COLUMN "duplicate_of_user_id" text;--> statement-breakpoint
ALTER TABLE "identity_captures" ADD COLUMN "duplicate_cleared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_captures" ADD COLUMN "duplicate_cleared_by_user_id" text;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD COLUMN "expiry_notices" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "identity_captures_document_hash_idx" ON "identity_captures" USING btree ("document_hash");