CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"journal_id" text NOT NULL,
	"account" text NOT NULL,
	"debit_cents" integer DEFAULT 0 NOT NULL,
	"credit_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ledger_entries_one_side" CHECK (("ledger_entries"."debit_cents" > 0 and "ledger_entries"."credit_cents" = 0) or ("ledger_entries"."credit_cents" > 0 and "ledger_entries"."debit_cents" = 0))
);
--> statement-breakpoint
CREATE TABLE "ledger_journals" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"payment_id" text,
	"booking_id" text,
	"provider_ref" text,
	"memo" text DEFAULT '' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_journal_id_ledger_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_entries_journal_idx" ON "ledger_entries" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_journals_idempotency_idx" ON "ledger_journals" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ledger_journals_booking_idx" ON "ledger_journals" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "ledger_journals_kind_idx" ON "ledger_journals" USING btree ("kind","occurred_at");--> statement-breakpoint
-- Every journal balances (blueprint 08): checked once its transaction commits, so all of its entries are in.
CREATE FUNCTION "ledger_journal_balanced"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT coalesce(sum("debit_cents"), 0) - coalesce(sum("credit_cents"), 0) FROM "ledger_entries" WHERE "journal_id" = NEW."journal_id") <> 0 THEN
    RAISE EXCEPTION 'ledger journal % does not balance', NEW."journal_id";
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ledger_entries_balanced" AFTER INSERT OR UPDATE ON "ledger_entries" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ledger_journal_balanced"();
