ALTER TABLE "tasks" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "hidden_by_user_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_hidden_by_user_id_users_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;