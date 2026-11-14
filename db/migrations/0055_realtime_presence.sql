ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_activity" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Real time (completion plan 7.1): a new outbox event wakes the dispatchers at once. The payload is empty: each
-- server's one LISTEN connection hears it and the dispatcher claims what's new. Fires on commit, once per statement.
CREATE FUNCTION "outbox_events_notify"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('tnm_outbox', '');
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "outbox_events_notify" AFTER INSERT ON "outbox_events" FOR EACH STATEMENT EXECUTE FUNCTION "outbox_events_notify"();
