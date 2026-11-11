ALTER TABLE "bookings" ADD COLUMN "on_my_way_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "late_by_minutes" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "arrived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "completion_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "approval_due_at" timestamp with time zone;