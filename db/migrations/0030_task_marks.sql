CREATE TABLE "task_marks" (
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_marks_user_id_task_id_kind_pk" PRIMARY KEY("user_id","task_id","kind")
);
--> statement-breakpoint
ALTER TABLE "task_marks" ADD CONSTRAINT "task_marks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_marks" ADD CONSTRAINT "task_marks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_marks_task_idx" ON "task_marks" USING btree ("task_id");