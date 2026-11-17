-- Telling the waitlist its city opened (completion plan 8.3): the language each entry joined in (English before now),
-- the market whose going live it's told about, the send's state (queued, sending, sent, skipped, failed) and the
-- unsubscribe link's mark. The job runner sends the queued emails in batches (src/modules/marketing/city-open.ts).
ALTER TABLE "waitlist_entries" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "told_market_id" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "tell_status" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "tell_reason" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "tell_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "tell_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "told_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "unsubscribed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_told_market_id_markets_id_fk" FOREIGN KEY ("told_market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waitlist_entries_tell_idx" ON "waitlist_entries" USING btree ("tell_status","tell_after");