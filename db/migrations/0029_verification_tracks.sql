CREATE TABLE "agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"doc" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "address_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"address_ciphertext" text,
	"area_id" text,
	"document_type" text,
	"document_file_id" text,
	"document_deleted_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" text,
	"rejection_reason" text,
	"auto_check" jsonb,
	"requested_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "background_checks" ALTER COLUMN "provider_ref" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_verifications" ALTER COLUMN "provider_session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "helper_profiles" ADD COLUMN "address_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "background_checks" ADD COLUMN "invitation_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "background_checks" ADD COLUMN "adjudication" text;--> statement-breakpoint
ALTER TABLE "background_checks" ADD COLUMN "adjudicated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "background_checks" ADD COLUMN "adjudicated_by_user_id" text;--> statement-breakpoint
ALTER TABLE "background_checks" ADD COLUMN "pre_adverse_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "background_checks" ADD COLUMN "expiry_notices" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "background_checks" ADD COLUMN "requested_by_user_id" text;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD COLUMN "name_matches" boolean;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD COLUMN "name_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD COLUMN "name_confirmed_by_user_id" text;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD COLUMN "requested_reason" text;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD COLUMN "requested_by_user_id" text;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD COLUMN "redaction_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address_verifications" ADD CONSTRAINT "address_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agreements_user_doc_version_idx" ON "agreements" USING btree ("user_id","doc","version");--> statement-breakpoint
CREATE INDEX "address_verifications_user_idx" ON "address_verifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "address_verifications_status_idx" ON "address_verifications" USING btree ("status","submitted_at");