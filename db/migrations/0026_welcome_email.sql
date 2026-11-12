ALTER TABLE "users" ADD COLUMN "welcomed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dev_outbox_messages" ADD COLUMN "html" text;--> statement-breakpoint
ALTER TABLE "dev_outbox_messages" ADD COLUMN "tag" text;