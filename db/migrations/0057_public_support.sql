ALTER TABLE "support_cases" ALTER COLUMN "opened_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "contact_locale" text;--> statement-breakpoint
CREATE INDEX "support_cases_contact_idx" ON "support_cases" USING btree ("contact_email","created_at");