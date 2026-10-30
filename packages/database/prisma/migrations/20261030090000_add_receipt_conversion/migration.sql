-- Receipt conversion canonical event (RECEIPT_CONVERSION cross-asset storage)
-- Adds target_asset_id, target_quantity, conversion_ratio, conversion_type to
-- transactions, strictly scoped to type = 'RECEIPT_CONVERSION' via CHECK.
-- Additive and backwards-safe: all 134 existing rows keep NULL (valid).

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "target_asset_id" UUID,
ADD COLUMN "target_quantity" NUMERIC(38,18),
ADD COLUMN "conversion_ratio" NUMERIC(38,18),
ADD COLUMN "conversion_type" VARCHAR(50);

-- Enforce conversion field scope (PART F)
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_receipt_conversion_scope_check" CHECK (
  (
    "type" = 'RECEIPT_CONVERSION'
    AND "asset_id" IS NOT NULL
    AND "target_asset_id" IS NOT NULL
    AND "asset_id" <> "target_asset_id"
    AND "quantity" IS NOT NULL AND "quantity" > 0
    AND "target_quantity" IS NOT NULL AND "target_quantity" > 0
    AND "conversion_ratio" IS NOT NULL AND "conversion_ratio" > 0
    AND "conversion_type" IS NOT NULL
    AND "unit_price" IS NULL
    AND "amount" IS NULL
  )
  OR
  (
    "type" <> 'RECEIPT_CONVERSION'
    AND "target_asset_id" IS NULL
    AND "target_quantity" IS NULL
    AND "conversion_ratio" IS NULL
    AND "conversion_type" IS NULL
  )
);

-- CreateIndex
CREATE INDEX "transactions_target_asset_id_idx" ON "transactions"("target_asset_id");
