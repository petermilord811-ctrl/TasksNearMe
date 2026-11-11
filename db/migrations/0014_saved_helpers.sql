CREATE TABLE "saved_helpers" (
	"user_id" text NOT NULL,
	"helper_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_helpers_user_id_helper_user_id_pk" PRIMARY KEY("user_id","helper_user_id")
);
--> statement-breakpoint
ALTER TABLE "saved_helpers" ADD CONSTRAINT "saved_helpers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_helpers" ADD CONSTRAINT "saved_helpers_helper_user_id_users_id_fk" FOREIGN KEY ("helper_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;