CREATE TABLE "spark_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pack" text NOT NULL,
	"points" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_session_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "task_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "direct_messages" text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "started_by_user_id" text;--> statement-breakpoint
ALTER TABLE "spark_purchases" ADD CONSTRAINT "spark_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spark_purchases_user_idx" ON "spark_purchases" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "spark_purchases_session_idx" ON "spark_purchases" USING btree ("provider","provider_session_id") WHERE provider_session_id is not null;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "threads_started_by_idx" ON "threads" USING btree ("started_by_user_id","created_at") WHERE started_by_user_id is not null;