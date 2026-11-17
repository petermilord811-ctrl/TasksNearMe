CREATE TABLE "contact_change_reverts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "contact_hold_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contact_change_reverts" ADD CONSTRAINT "contact_change_reverts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_change_reverts_user_idx" ON "contact_change_reverts" USING btree ("user_id","kind","created_at");