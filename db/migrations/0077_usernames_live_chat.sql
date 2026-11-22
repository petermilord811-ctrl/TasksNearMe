CREATE TABLE "usernames" (
	"user_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "live_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "live_agent_user_id" text;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "live_joined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "live_ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usernames" ADD CONSTRAINT "usernames_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Everyone gets an @username from their first name (2026-11-22): accents folded, letters and digits only, lowercase, at
-- most 15 long and starting with a letter, else "neighbor" (also for reserved words). The second and later with the same
-- name get _2, _3, and so on: a base never holds "_", so a numbered one can't be someone else's base. Deleted accounts
-- get none.
WITH folded AS (
  SELECT "id", "created_at",
    regexp_replace(translate(lower("first_name"), 'áàäâãåéèëêíìïîóòöôõúùüûñçý', 'aaaaaaeeeeiiiiooooouuuuncy'), '[^a-z0-9]', '', 'g') AS "raw"
  FROM "users" WHERE "status" <> 'deleted'
), "base" AS (
  SELECT "id", "created_at",
    CASE WHEN "raw" ~ '^[a-z][a-z0-9]{2,}$' AND left("raw", 15) NOT IN ('admin', 'administrator', 'support', 'help', 'helpdesk', 'staff', 'system', 'moderator', 'mod', 'mods', 'root', 'tasksnearme', 'official', 'team', 'security', 'trust', 'safety', 'billing', 'payments', 'null', 'undefined', 'api', 'app', 'www', 'everyone', 'here', 'deleted', 'anonymous', 'assistant', 'bot', 'me', 'you', 'owner', 'ceo', 'founder', 'neighbors')
      THEN left("raw", 15) ELSE 'neighbor' END AS "b"
  FROM folded
), numbered AS (
  SELECT "id", "b", row_number() OVER (PARTITION BY "b" ORDER BY "created_at", "id") AS "n" FROM "base"
)
INSERT INTO "usernames" ("user_id", "username")
SELECT numbered."id", CASE WHEN numbered."n" = 1 THEN numbered."b" ELSE numbered."b" || '_' || numbered."n" END FROM numbered;--> statement-breakpoint
CREATE UNIQUE INDEX "usernames_lower_idx" ON "usernames" USING btree (lower("username"));--> statement-breakpoint
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_live_agent_user_id_users_id_fk" FOREIGN KEY ("live_agent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_cases_live_idx" ON "support_cases" USING btree ("live_requested_at") WHERE "support_cases"."live_ended_at" is null;