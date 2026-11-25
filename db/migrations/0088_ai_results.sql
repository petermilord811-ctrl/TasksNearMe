CREATE TABLE "ai_results" (
	"kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"variant" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT '' NOT NULL,
	"input_hash" text NOT NULL,
	"content" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_results_kind_subject_id_variant_locale_pk" PRIMARY KEY("kind","subject_id","variant","locale")
);
--> statement-breakpoint
CREATE INDEX "ai_results_created_idx" ON "ai_results" USING btree ("kind","created_at");