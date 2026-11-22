CREATE TABLE "community_announcement_dismissals" (
	"user_id" text NOT NULL,
	"announcement_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_announcement_dismissals_user_id_announcement_id_pk" PRIMARY KEY("user_id","announcement_id")
);
--> statement-breakpoint
CREATE TABLE "community_announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"title_en" text NOT NULL,
	"body_en" text NOT NULL,
	"title_es" text NOT NULL,
	"body_es" text NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_by_user_id" text NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_edits" (
	"id" text PRIMARY KEY NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"editor_user_id" text NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_follows" (
	"user_id" text NOT NULL,
	"post_id" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_follows_user_id_post_id_pk" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "community_photos" (
	"file_id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"reply_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "home_area_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "community_digest_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "community_posts" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "community_replies" ADD COLUMN "reply_to_id" text;--> statement-breakpoint
ALTER TABLE "community_replies" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "community_prompts" jsonb;--> statement-breakpoint
ALTER TABLE "community_announcement_dismissals" ADD CONSTRAINT "community_announcement_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_announcement_dismissals" ADD CONSTRAINT "community_announcement_dismissals_announcement_id_community_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."community_announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_announcements" ADD CONSTRAINT "community_announcements_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_announcements" ADD CONSTRAINT "community_announcements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_edits" ADD CONSTRAINT "community_edits_editor_user_id_users_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_follows" ADD CONSTRAINT "community_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_follows" ADD CONSTRAINT "community_follows_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_photos" ADD CONSTRAINT "community_photos_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_photos" ADD CONSTRAINT "community_photos_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_photos" ADD CONSTRAINT "community_photos_reply_id_community_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "public"."community_replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_announcements_market_idx" ON "community_announcements" USING btree ("market_id","starts_at");--> statement-breakpoint
CREATE INDEX "community_edits_target_idx" ON "community_edits" USING btree ("target_kind","target_id","created_at");--> statement-breakpoint
CREATE INDEX "community_follows_post_idx" ON "community_follows" USING btree ("post_id","state");--> statement-breakpoint
CREATE INDEX "community_photos_post_idx" ON "community_photos" USING btree ("post_id","position");--> statement-breakpoint
CREATE INDEX "community_photos_reply_idx" ON "community_photos" USING btree ("reply_id");--> statement-breakpoint
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_reply_to_id_community_replies_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."community_replies"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Neighbors' seasonal starters (plan 10.18): market configuration, set here for the cities that exist.
UPDATE "markets" SET "community_prompts" = '[{"months": [2, 3, 4], "kind": "recommendation", "category": "yard-cleanup", "en": "Who do you recommend for a spring yard cleanup?", "es": "¿A quién recomiendan para limpiar el jardín en primavera?"}, {"months": [4, 5], "kind": "recommendation", "category": "moving-help", "en": "Who can help me load a truck at the end of the semester?", "es": "¿Quién me puede ayudar a cargar un camión al terminar el semestre?"}, {"months": [4, 5, 7], "kind": "recommendation", "category": "light-cleaning", "en": "Who do you recommend for a move-out clean before my lease ends?", "es": "¿A quién recomiendan para limpiar el apartamento antes de entregarlo?"}, {"months": [7, 8], "kind": "recommendation", "category": "furniture-assembly", "en": "New for the fall semester: who''s great at assembling furniture?", "es": "Recién llegado para el semestre de otoño: ¿quién arma muebles bien?"}, {"months": [8], "kind": "recommendation", "category": "moving-help", "en": "Who can help carry boxes up to a second-floor apartment?", "es": "¿Quién me ayuda a subir cajas a un segundo piso?"}, {"months": [6, 7, 8, 9, 10, 11], "kind": "recommendation", "category": "yard-cleanup", "en": "After a storm: who helps pick up branches and debris in the yard?", "es": "Después de una tormenta: ¿quién ayuda a recoger ramas y escombros del jardín?"}, {"months": [6], "kind": "tip", "en": "Your best tip for getting ready for storm season", "es": "Tu mejor consejo para prepararse para la temporada de tormentas"}, {"months": [11, 12, 1], "kind": "recommendation", "category": "yard-cleanup", "en": "Leaves everywhere: who do you recommend for a leaf cleanup?", "es": "Hojas por todas partes: ¿a quién recomiendan para recoger hojas?"}, {"months": [11, 12], "kind": "recommendation", "category": "light-cleaning", "en": "Hosting for the holidays: who''s great at a quick deep clean?", "es": "Recibo visitas en las fiestas: ¿quién hace una buena limpieza profunda?"}, {"months": [12, 1], "kind": "recommendation", "category": "computer-help", "en": "Who can help set up a new phone or laptop for a parent?", "es": "¿Quién puede ayudar a configurar un teléfono o una computadora nueva para mis padres?"}]'::jsonb WHERE "id" = 'mkt_gainesville';--> statement-breakpoint
UPDATE "markets" SET "community_prompts" = '[{"months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "kind": "recommendation", "category": "furniture-assembly", "en": "Who do you recommend for putting together a bed frame?", "es": "¿A quién recomiendan para armar una base de cama?"}, {"months": [10, 11, 12], "kind": "recommendation", "category": "yard-cleanup", "en": "Who''s good at a fall leaf cleanup?", "es": "¿Quién es bueno para recoger hojas en otoño?"}, {"months": [5, 6, 7, 8], "kind": "question", "category": "moving-help", "en": "Moving in the summer heat: what time of day works best?", "es": "Mudarse con el calor del verano: ¿a qué hora conviene?"}]'::jsonb WHERE "id" = 'mkt_austin';
