ALTER TABLE "messages" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "request_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_sender_request_key_idx" ON "messages" USING btree ("sender_user_id","request_key") WHERE request_key is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_poster_request_key_idx" ON "tasks" USING btree ("poster_user_id","request_key") WHERE request_key is not null;