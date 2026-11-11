CREATE TABLE "support_case_events" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"kind" text NOT NULL,
	"author_user_id" text,
	"party_user_id" text,
	"visibility" text DEFAULT 'participants' NOT NULL,
	"body" text,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_case_reads" (
	"case_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "support_case_reads_case_id_user_id_pk" PRIMARY KEY("case_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "topic" text;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "subject_user_id" text;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "context" jsonb;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "assignee_user_id" text;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "first_response_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "resolution_summary" text;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "support_case_events" ADD CONSTRAINT "support_case_events_case_id_support_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."support_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_case_events" ADD CONSTRAINT "support_case_events_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_case_events" ADD CONSTRAINT "support_case_events_party_user_id_users_id_fk" FOREIGN KEY ("party_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_case_reads" ADD CONSTRAINT "support_case_reads_case_id_support_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."support_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_case_reads" ADD CONSTRAINT "support_case_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_case_events_case_idx" ON "support_case_events" USING btree ("case_id","created_at");--> statement-breakpoint
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_cases_opener_idx" ON "support_cases" USING btree ("opened_by_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "support_cases_assignee_idx" ON "support_cases" USING btree ("assignee_user_id","status");