CREATE TABLE "neighbor_group_photos" (
	"file_id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "neighbor_group_reactions" (
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "neighbor_group_reactions_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
ALTER TABLE "neighbor_group_messages" ADD COLUMN "reply_to_message_id" text;--> statement-breakpoint
ALTER TABLE "neighbor_group_messages" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "neighbor_group_photos" ADD CONSTRAINT "neighbor_group_photos_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_group_photos" ADD CONSTRAINT "neighbor_group_photos_message_id_neighbor_group_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."neighbor_group_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_group_reactions" ADD CONSTRAINT "neighbor_group_reactions_message_id_neighbor_group_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."neighbor_group_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbor_group_reactions" ADD CONSTRAINT "neighbor_group_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "neighbor_group_photos_message_idx" ON "neighbor_group_photos" USING btree ("message_id","position");--> statement-breakpoint
CREATE INDEX "neighbor_group_reactions_user_idx" ON "neighbor_group_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "neighbor_group_messages_author_request_key_idx" ON "neighbor_group_messages" USING btree ("author_user_id","request_key") WHERE request_key is not null;