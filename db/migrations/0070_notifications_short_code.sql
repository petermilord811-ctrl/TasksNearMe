ALTER TABLE "notifications" ADD COLUMN "short_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_short_code_idx" ON "notifications" USING btree ("short_code");