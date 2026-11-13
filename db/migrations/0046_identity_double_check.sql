ALTER TABLE "identity_verifications" ADD COLUMN "provider_outcome" text;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD COLUMN "provider_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD COLUMN "review_outcome" text;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD COLUMN "reviewed_by_user_id" text;