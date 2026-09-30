-- Phase 4G.2B.0 — canonical equity IRRF withholding classification (additive only).
-- Adds an explicit withholding treatment discriminator to canonical withholding
-- evidence. Nullable for backward compatibility; legacy rows are never backfilled
-- or reclassified. No destructive changes.

ALTER TABLE "tax_withholding_input_records" ADD COLUMN "withholding_category" VARCHAR(30);
