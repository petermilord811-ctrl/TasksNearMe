CREATE TABLE "payment_customers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"customer_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_customers" ADD CONSTRAINT "payment_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_customers_ref_idx" ON "payment_customers" USING btree ("provider","customer_ref");