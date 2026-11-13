CREATE TABLE "identity_captures" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"document_type" text NOT NULL,
	"front_file_id" text,
	"back_file_id" text,
	"selfie_file_id" text,
	"prompt_key" text NOT NULL,
	"status" text NOT NULL,
	"rejection_reason" text,
	"auto_check" jsonb,
	"submitted_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" text,
	"staff_note" text,
	"files_deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_captures" ADD CONSTRAINT "identity_captures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "identity_captures_user_idx" ON "identity_captures" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "identity_captures_status_idx" ON "identity_captures" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_captures_one_in_review" ON "identity_captures" USING btree ("user_id") WHERE status = 'submitted';