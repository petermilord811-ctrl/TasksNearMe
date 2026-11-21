ALTER TABLE "refund_requests" ADD COLUMN "case_id" text;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD COLUMN "resolution_input" jsonb;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_case_id_support_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."support_cases"("id") ON DELETE no action ON UPDATE no action;