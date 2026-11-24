CREATE TABLE "neighbor_group_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"code" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "neighbor_group_members" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"muted_at" timestamp with time zone,
	"invited_by_user_id" text,
	CONSTRAINT "neighbor_group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "neighbor_group_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"moderated_by_user_id" text,
	"moderation_reason" text,
	"moderated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "neighbor_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"area_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "neighbor_group_invites" ADD CONSTRAINT "neighbor_group_invites_group_id_neighbor_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."neighbor_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_group_invites" ADD CONSTRAINT "neighbor_group_invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_group_invites" ADD CONSTRAINT "neighbor_group_invites_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_group_members" ADD CONSTRAINT "neighbor_group_members_group_id_neighbor_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."neighbor_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_group_members" ADD CONSTRAINT "neighbor_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_group_members" ADD CONSTRAINT "neighbor_group_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_group_messages" ADD CONSTRAINT "neighbor_group_messages_group_id_neighbor_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."neighbor_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_group_messages" ADD CONSTRAINT "neighbor_group_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_group_messages" ADD CONSTRAINT "neighbor_group_messages_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_groups" ADD CONSTRAINT "neighbor_groups_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_groups" ADD CONSTRAINT "neighbor_groups_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_groups" ADD CONSTRAINT "neighbor_groups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "neighbor_group_invites_code_idx" ON "neighbor_group_invites" USING btree ("code");--> statement-breakpoint
CREATE INDEX "neighbor_group_invites_group_idx" ON "neighbor_group_invites" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "neighbor_group_members_user_idx" ON "neighbor_group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "neighbor_group_messages_group_idx" ON "neighbor_group_messages" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "neighbor_group_messages_author_idx" ON "neighbor_group_messages" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE INDEX "neighbor_groups_creator_idx" ON "neighbor_groups" USING btree ("created_by_user_id");