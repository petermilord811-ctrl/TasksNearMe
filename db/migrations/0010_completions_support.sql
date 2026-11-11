CREATE TABLE "booking_completion_photos" (
	"booking_id" text NOT NULL,
	"file_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "booking_completion_photos_booking_id_file_id_pk" PRIMARY KEY("booking_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "booking_completions" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"hours_worked" double precision,
	"final_breakdown" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"receipt_file_id" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"booking_id" text,
	"opened_by_user_id" text NOT NULL,
	"reason" text,
	"description" text DEFAULT '' NOT NULL,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_completion_photos" ADD CONSTRAINT "booking_completion_photos_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_completion_photos" ADD CONSTRAINT "booking_completion_photos_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_completions" ADD CONSTRAINT "booking_completions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_expenses" ADD CONSTRAINT "booking_expenses_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_expenses" ADD CONSTRAINT "booking_expenses_receipt_file_id_files_id_fk" FOREIGN KEY ("receipt_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_expenses_booking_idx" ON "booking_expenses" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "support_cases_booking_idx" ON "support_cases" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "support_cases_status_idx" ON "support_cases" USING btree ("status","created_at");