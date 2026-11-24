CREATE TABLE "booking_followers" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"follower_user_id" text NOT NULL,
	"added_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" text
);
--> statement-breakpoint
ALTER TABLE "booking_followers" ADD CONSTRAINT "booking_followers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_followers" ADD CONSTRAINT "booking_followers_follower_user_id_users_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_followers" ADD CONSTRAINT "booking_followers_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_followers_open_idx" ON "booking_followers" USING btree ("booking_id","follower_user_id") WHERE ended_at is null;--> statement-breakpoint
CREATE INDEX "booking_followers_follower_idx" ON "booking_followers" USING btree ("follower_user_id","ended_at");