ALTER TABLE "privacy_requests" ADD COLUMN "file_key" text;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "privacy_requests_status_idx" ON "privacy_requests" USING btree ("kind","status");