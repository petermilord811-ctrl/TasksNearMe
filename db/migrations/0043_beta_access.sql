CREATE TABLE "beta_access" (
	"user_id" text NOT NULL,
	"market_id" text NOT NULL,
	"role" text NOT NULL,
	"code_id" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beta_access_user_id_market_id_role_pk" PRIMARY KEY("user_id","market_id","role")
);
--> statement-breakpoint
CREATE TABLE "beta_invite_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"market_id" text NOT NULL,
	"role" text NOT NULL,
	"label" text NOT NULL,
	"max_uses" integer NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "beta_access" ADD CONSTRAINT "beta_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_access" ADD CONSTRAINT "beta_access_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_access" ADD CONSTRAINT "beta_access_code_id_beta_invite_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."beta_invite_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_invite_codes" ADD CONSTRAINT "beta_invite_codes_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_invite_codes" ADD CONSTRAINT "beta_invite_codes_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_invite_codes" ADD CONSTRAINT "beta_invite_codes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beta_access_code_idx" ON "beta_access" USING btree ("code_id");--> statement-breakpoint
CREATE UNIQUE INDEX "beta_invite_codes_code_idx" ON "beta_invite_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "beta_invite_codes_market_idx" ON "beta_invite_codes" USING btree ("market_id");