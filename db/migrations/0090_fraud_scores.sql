CREATE TABLE "sign_in_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text,
	"ip" text,
	"user_agent" text,
	"method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sign_in_events" ADD CONSTRAINT "sign_in_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sign_in_events_user_idx" ON "sign_in_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sign_in_events_ip_idx" ON "sign_in_events" USING btree ("ip");--> statement-breakpoint
INSERT INTO "sign_in_events" ("id", "user_id", "session_id", "ip", "user_agent", "created_at") SELECT 'sie_' || md5("id"), "user_id", "id", "ip_address", "user_agent", "created_at" FROM "sessions" ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "feature_flags" WHERE "key" = 'auto_verification';--> statement-breakpoint
INSERT INTO "feature_flags" ("key", "market_id", "enabled", "description") VALUES ('auto_verification_id', 'global', false, 'Automatic decisions on ID photos: clean readings approved without staff (off: every ID goes to the team with its fraud score)'), ('auto_verification_address', 'global', true, 'Automatic decisions on proofs of address: clean ones verified; a miss is turned down so the person sends another, a second miss goes to the team') ON CONFLICT DO NOTHING;
