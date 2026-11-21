ALTER TABLE "payment_methods" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "method_fingerprint" text;--> statement-breakpoint
CREATE INDEX "payment_methods_fingerprint_idx" ON "payment_methods" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "payments_method_fingerprint_idx" ON "payments" USING btree ("method_fingerprint");