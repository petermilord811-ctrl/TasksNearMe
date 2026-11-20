-- Money review #12: one payouts row per Stripe payout. An instant payout and Stripe's payout webhook could each record the
-- same payout. Rows that share a provider_ref are merged into the row Stripe updated last: their earnings move to it, an
-- instant payout's method and fee are kept, and the count is logged and audited. Then the reference becomes unique.
-- Rows that share a reference but disagree on the amount may not be the same payout: the migration stops with an error so
-- a person looks, instead of guessing.
DO $$
DECLARE
  mismatched integer;
  merged integer;
BEGIN
  SELECT count(*) INTO mismatched FROM (
    SELECT provider_ref FROM payouts
    WHERE provider_ref IS NOT NULL
    GROUP BY provider_ref
    HAVING count(*) > 1 AND count(DISTINCT amount_cents) > 1
  ) disagreeing;
  IF mismatched > 0 THEN
    RAISE EXCEPTION 'payouts: % Stripe payout reference(s) have rows with different amounts; merge them by hand, then migrate again', mismatched;
  END IF;

  CREATE TEMP TABLE payout_merge ON COMMIT DROP AS
    SELECT id, provider_ref, method, fee_cents,
      first_value(id) OVER (PARTITION BY provider_ref ORDER BY updated_at DESC, id) AS keep_id
    FROM payouts
    WHERE provider_ref IN (SELECT provider_ref FROM payouts WHERE provider_ref IS NOT NULL GROUP BY provider_ref HAVING count(*) > 1);

  UPDATE payouts kept SET method = 'instant', fee_cents = GREATEST(kept.fee_cents, instant.fee_cents)
    FROM (SELECT keep_id, max(fee_cents) AS fee_cents FROM payout_merge WHERE method = 'instant' GROUP BY keep_id) instant
    WHERE kept.id = instant.keep_id;
  UPDATE earnings SET payout_id = m.keep_id FROM payout_merge m WHERE earnings.payout_id = m.id AND m.id <> m.keep_id;
  DELETE FROM payouts USING payout_merge m WHERE payouts.id = m.id AND m.id <> m.keep_id;
  GET DIAGNOSTICS merged = ROW_COUNT;

  RAISE NOTICE 'payouts: merged % duplicate row(s) into the row Stripe updated last', merged;
  IF merged > 0 THEN
    INSERT INTO audit_log (id, actor_id, actor_role, action, target_type, target_id, reason, metadata)
    VALUES (
      'aud_migration_0067', NULL, 'system', 'payouts.duplicates_merged', 'migration', '0067_payouts_provider_ref_unique',
      'One payouts row per Stripe payout (money review #12)',
      jsonb_build_object('merged', merged, 'references', (SELECT jsonb_agg(DISTINCT provider_ref) FROM payout_merge))
    );
  END IF;
  DROP TABLE payout_merge;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_provider_ref_idx" ON "payouts" USING btree ("provider_ref") WHERE provider_ref is not null;--> statement-breakpoint
-- Money review #7: the payment whose charge each transfer was tied to, so transfers from one charge stay within it.
ALTER TABLE "earnings" ADD COLUMN "source_payment_id" text;--> statement-breakpoint
-- Transfers made before this column: the code then tied a transfer to its booking's charge whenever that charge alone
-- covered it (tips too, before 14350ef), so that's what they are recorded as. When in doubt this counts a transfer
-- against the charge: a later transfer then goes out from the platform's balance, never one Stripe refuses.
UPDATE "earnings" SET "source_payment_id" = "payments"."id"
FROM "payments"
WHERE "earnings"."source_payment_id" IS NULL
  AND "earnings"."transfer_ref" IS NOT NULL
  AND "earnings"."status" IN ('transferred', 'paid_out', 'partially_reversed', 'reversed')
  AND "payments"."booking_id" = "earnings"."booking_id"
  AND "payments"."provider" = 'stripe'
  AND "payments"."purpose" IN ('booking_funding', 'invite_authorization')
  AND "payments"."status" IN ('succeeded', 'partially_refunded', 'refunded')
  AND "payments"."amount_cents" >= "earnings"."amount_cents";
